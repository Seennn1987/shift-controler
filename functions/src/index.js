import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { isValidKey, checkRateLimit } from './auth.js';
import { HttpError } from './http-error.js';
import { toJstIso } from './serialize.js';
import { listAllCollections, readCollection, readDocument } from './generic.js';
import { loadClassroom } from './classroom.js';
import { fillState } from './server-state.js';
import { viewLessons, viewSummary, viewShifts, viewStudents, viewTeachers, viewPayroll, viewCost } from './views.js';

const PITAKOMA_API_KEY = defineSecret('PITAKOMA_API_KEY');
initializeApp();
const db = getFirestore();

const CLASSROOM_VIEWS = {
  '/lessons': viewLessons,
  '/summary': viewSummary,
  '/shifts': viewShifts,
  '/students': viewStudents,
  '/teachers': viewTeachers,
  '/payroll': viewPayroll,
  '/cost': viewCost,
};

function normalizePath(req){
  let p = String(req.path || '/').replace(/\/+$/, '') || '/';
  if(p === '/readApi' || p.startsWith('/readApi/')) p = p.slice('/readApi'.length) || '/';
  return p;
}

function decodeSegmentPath(rest){
  return rest.split('/').map(s=> decodeURIComponent(s)).join('/');
}

async function route(path, query){
  if(path === '/collections') return listAllCollections(db);
  if(path.startsWith('/collection/')) return readCollection(db, decodeSegmentPath(path.slice('/collection/'.length)), query);
  if(path === '/doc' || path.startsWith('/doc/')){
    const raw = path === '/doc' ? query.path : decodeSegmentPath(path.slice('/doc/'.length));
    return readDocument(db, raw);
  }
  const view = CLASSROOM_VIEWS[path];
  if(view){
    const classroom = await loadClassroom(db, (process.env.PITAKOMA_ADMIN_UID || '').trim());
    // 読み込み後は await を挟まずに計算し、同時に来た別リクエストと状態 S が混ざらないようにする
    fillState(classroom.appState, classroom.scheduleDocs);
    return { ...view(query), readCount: classroom.readCount };
  }
  throw new HttpError(404, `エンドポイントが見つかりません: ${path}`);
}

function logAccess(path, status, count, readCount, startedAt){
  console.log(JSON.stringify({
    kind: 'readApi-access',
    at: toJstIso(new Date()),
    endpoint: path,
    status,
    count,
    firestoreReads: readCount,
    ms: Date.now() - startedAt,
  }));
}

export const readApi = onRequest(
  {
    region: 'asia-northeast1',
    secrets: [PITAKOMA_API_KEY],
    maxInstances: 1,
    timeoutSeconds: 120,
    memory: '512MiB',
  },
  async (req, res)=>{
    const startedAt = Date.now();
    const path = normalizePath(req);
    res.set('Cache-Control', 'no-store');

    if(req.method !== 'GET'){
      res.set('Allow', 'GET');
      res.status(405).json({ error: 'method not allowed' });
      logAccess(path, 405, 0, 0, startedAt);
      return;
    }

    const rate = checkRateLimit(req.ip || 'unknown');
    if(!rate.ok){
      res.set('Retry-After', String(rate.retryAfterSec));
      res.status(429).json({ error: 'too many requests', retryAfterSec: rate.retryAfterSec });
      logAccess(path, 429, 0, 0, startedAt);
      return;
    }

    if(!isValidKey(req.query.key, PITAKOMA_API_KEY.value())){
      res.status(401).json({ error: 'unauthorized' });
      logAccess(path, 401, 0, 0, startedAt);
      return;
    }

    const { key: _key, ...query } = req.query;
    try{
      const result = await route(path, query);
      const items = result.items || [];
      res.status(200).json({
        generatedAt: toJstIso(new Date()),
        count: items.length,
        ...(result.extra || {}),
        items,
        nextCursor: result.nextCursor || null,
      });
      logAccess(path, 200, items.length, result.readCount || 0, startedAt);
    }catch(err){
      if(err instanceof HttpError){
        res.status(err.status).json({ error: err.message });
        logAccess(path, err.status, 0, 0, startedAt);
        return;
      }
      console.error(JSON.stringify({ kind: 'readApi-error', endpoint: path, message: err && err.message }));
      res.status(500).json({ error: 'internal error' });
      logAccess(path, 500, 0, 0, startedAt);
    }
  },
);
