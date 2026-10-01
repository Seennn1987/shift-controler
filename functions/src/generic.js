import { FieldPath, Timestamp } from 'firebase-admin/firestore';
import { HttpError } from './http-error.js';
import { serializeDoc, isHiddenFieldPath } from './serialize.js';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const SUBCOLLECTION_SCAN_DOCS = 100;
const OPERATORS = ['>=', '<=', '!=', '==', '>', '<'];
const INEQUALITY = new Set(['>=', '<=', '!=', '>', '<']);

function splitPath(raw){
  return String(raw || '').split('/').map(s=> s.trim()).filter(Boolean);
}

function assertSafeSegments(segments){
  segments.forEach(s=>{
    if(s === '.' || s === '..' || s.startsWith('__')) throw new HttpError(400, `使えない名前です: ${s}`);
  });
}

function parseLimit(raw){
  if(raw == null || raw === '') return DEFAULT_LIMIT;
  const n = Number(raw);
  if(!Number.isInteger(n) || n < 1) throw new HttpError(400, 'limit は1以上の整数で指定してください');
  return Math.min(n, MAX_LIMIT);
}

function parseLiteral(text){
  const t = text.trim();
  if(/^".*"$/.test(t)) return t.slice(1, -1);
  if(t === 'true') return true;
  if(t === 'false') return false;
  if(t === 'null') return null;
  if(/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
  return t;
}

function parseWhere(raw){
  const list = raw == null ? [] : (Array.isArray(raw) ? raw : [raw]);
  return list.filter(Boolean).map(expr=>{
    const op = OPERATORS.find(o=> expr.includes(o));
    if(!op) throw new HttpError(400, `where の形式が正しくありません（例: date==2026-09-28）: ${expr}`);
    const idx = expr.indexOf(op);
    const field = expr.slice(0, idx).trim();
    if(!field) throw new HttpError(400, `where のフィールド名がありません: ${expr}`);
    return { field, op, value: parseLiteral(expr.slice(idx + op.length)) };
  });
}

function parseOrderBy(raw){
  if(!raw) return null;
  const [field, dirRaw] = String(raw).split(':');
  const dir = (dirRaw || 'asc').toLowerCase();
  if(!field || !['asc', 'desc'].includes(dir)) throw new HttpError(400, 'orderBy は「フィールド名」または「フィールド名:desc」で指定してください');
  return { field, dir };
}

function encodeCursor(value, id){
  const v = value instanceof Timestamp ? { _ts: value.toMillis() } : value;
  return Buffer.from(JSON.stringify({ v, id }), 'utf8').toString('base64url');
}

function decodeCursor(raw){
  try{
    const { v, id } = JSON.parse(Buffer.from(String(raw), 'base64url').toString('utf8'));
    const value = v && typeof v === 'object' && '_ts' in v ? Timestamp.fromMillis(v._ts) : v;
    if(typeof id !== 'string') throw new Error('bad');
    return { value, id };
  }catch(_e){
    throw new HttpError(400, 'cursor が正しくありません');
  }
}

function getByPath(obj, dotted){
  return dotted.split('.').reduce((o, k)=> (o == null ? undefined : o[k]), obj);
}

async function collectionExists(db, segments){
  if(segments.length === 1){
    const cols = await db.listCollections();
    return cols.some(c=> c.id === segments[0]);
  }
  const parent = db.doc(segments.slice(0, -1).join('/'));
  const cols = await parent.listCollections();
  return cols.some(c=> c.id === segments[segments.length - 1]);
}

function wrapFirestoreError(err){
  if(err instanceof HttpError) return err;
  if(err && (err.code === 9 || err.code === 3)){
    return new HttpError(400, `この条件では検索できません（並び順や索引の条件をご確認ください）: ${err.details || err.message}`);
  }
  return err;
}

/** /collections */
export async function listAllCollections(db){
  const roots = await db.listCollections();
  const items = [];
  let scanTruncated = false;
  for(const col of roots){
    const agg = await col.count().get();
    items.push({ path: col.id, name: col.id, parent: null, count: agg.data().count });
    const refs = await col.listDocuments();
    if(refs.length > SUBCOLLECTION_SCAN_DOCS) scanTruncated = true;
    for(const ref of refs.slice(0, SUBCOLLECTION_SCAN_DOCS)){
      const subs = await ref.listCollections();
      for(const sub of subs){
        const c = await sub.count().get();
        items.push({ path: sub.path, name: sub.id, parent: ref.path, count: c.data().count });
      }
    }
  }
  return {
    items,
    extra: {
      subcollectionScan: { docsCheckedPerCollection: SUBCOLLECTION_SCAN_DOCS, truncated: scanTruncated },
    },
    readCount: items.length,
  };
}

/** /collection/{name} */
export async function readCollection(db, rawName, query){
  const segments = splitPath(rawName);
  if(segments.length === 0 || segments.length % 2 === 0) throw new HttpError(400, 'コレクション名が正しくありません（例: teacherSchedules）');
  assertSafeSegments(segments);
  if(!(await collectionExists(db, segments))) throw new HttpError(404, `コレクションが見つかりません: ${segments.join('/')}`);

  const limit = parseLimit(query.limit);
  const wheres = parseWhere(query.where);
  let order = parseOrderBy(query.orderBy);
  if(wheres.some(w=> isHiddenFieldPath(w.field)) || (order && isHiddenFieldPath(order.field))){
    throw new HttpError(400, 'この項目では検索・並べ替えできません');
  }
  const firstInequality = wheres.find(w=> INEQUALITY.has(w.op));
  if(!order && firstInequality) order = { field: firstInequality.field, dir: 'asc' };

  let q = db.collection(segments.join('/'));
  wheres.forEach(w=>{ q = q.where(w.field, w.op, w.value); });
  if(order){
    q = q.orderBy(order.field, order.dir).orderBy(FieldPath.documentId(), order.dir);
  }else{
    q = q.orderBy(FieldPath.documentId());
  }
  if(query.cursor){
    const c = decodeCursor(query.cursor);
    q = order ? q.startAfter(c.value, c.id) : q.startAfter(c.id);
  }

  let snap;
  try{
    snap = await q.limit(limit + 1).get();
  }catch(err){
    throw wrapFirestoreError(err);
  }
  const docs = snap.docs.slice(0, limit);
  const hasMore = snap.docs.length > limit;
  const last = docs[docs.length - 1];
  const nextCursor = hasMore && last
    ? encodeCursor(order ? getByPath(last.data(), order.field) : undefined, last.id)
    : null;
  return { items: docs.map(serializeDoc), nextCursor, readCount: snap.size };
}

/** /doc/{path} */
export async function readDocument(db, rawPath){
  const segments = splitPath(rawPath);
  if(segments.length === 0 || segments.length % 2 !== 0) throw new HttpError(400, 'path は「コレクション名/ドキュメントID」の形で指定してください（例: teacherSchedules/abc123）');
  assertSafeSegments(segments);
  const ref = db.doc(segments.join('/'));
  const [snap, subs] = await Promise.all([ref.get(), ref.listCollections()]);
  if(!snap.exists) throw new HttpError(404, `ドキュメントが見つかりません: ${segments.join('/')}`);
  return {
    items: [{ ...serializeDoc(snap), _subcollections: subs.map(s=> s.id) }],
    readCount: 1,
  };
}

