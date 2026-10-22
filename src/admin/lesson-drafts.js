import { fbAuth, fbDb, S } from './state.js';
import { isClosedCopyPage } from '../shared/firebase-config.js';
import { diffDrafts, entryFromStored } from '../shared/lesson-draft-diff.mjs';
import { showSaveErrorFlash } from './save-state-flash.js';

const BATCH_LIMIT = 400;

function resolveUid(explicit){
  if(explicit){
    if(!isClosedCopyPage()) return '';
    return String(explicit);
  }
  return fbAuth?.currentUser?.uid || '';
}

function draftRef(id){
  return fbDb.collection('lessonDrafts').doc(id);
}

function isMissingDraftRead(err){
  const code = err && (err.code || '');
  return code === 'permission-denied' || code === 'permission_denied';
}

/** すでに入っている仮決めだけ中身を返す。まだ無いものは空。空の確認が拒否されても新規として扱う。 */
async function readStoredDraft(id){
  try{
    const snap = await draftRef(id).get();
    return snap.exists ? snap.data() : null;
  }catch(err){
    if(isMissingDraftRead(err)) return null;
    throw err;
  }
}

function payloadOf(entry, uid){
  const out = { adminUid: uid, id: entry.id };
  Object.keys(entry).forEach(key => {
    if(key === 'adminUid' || key === 'updatedAt' || key === 'id') return;
    if(entry[key] !== undefined) out[key] = entry[key];
  });
  out.updatedAt = firebase.firestore.FieldValue.serverTimestamp();
  return out;
}

function chunk(items, size){
  const groups = [];
  for(let i = 0; i < items.length; i += size) groups.push(items.slice(i, i + size));
  return groups;
}

async function rollbackApplied(applied){
  for(let i = applied.length - 1; i >= 0; i--){
    const step = applied[i];
    const batch = fbDb.batch();
    if(step.type === 'set'){
      step.entries.forEach(entry => {
        const prev = step.previous.get(entry.id);
        const ref = draftRef(entry.id);
        if(prev) batch.set(ref, prev);
        else batch.delete(ref);
      });
    }else{
      step.snaps.forEach(item => {
        if(item.data) batch.set(draftRef(item.id), item.data);
      });
    }
    try{
      await batch.commit();
    }catch(err){
      console.error('仮決めの戻しエラー:', err);
    }
  }
}

export async function loadLessonDrafts(adminUid){
  const uid = resolveUid(adminUid);
  if(!uid || !fbDb) return [];
  const snap = await fbDb.collection('lessonDrafts').where('adminUid', '==', uid).get();
  const list = [];
  snap.forEach(doc => {
    list.push(entryFromStored(doc.data(), doc.id));
  });
  return list;
}

/**
 * 仮決めをまとめて書く。途中で失敗したら、その回に書いた分は戻す。
 * 画面の一覧は、呼び出し側が成功したときだけ差し替える。
 */
export async function commitLessonDrafts({ upserts = [], deleteIds = [], forceFail = false, adminUid = '', quiet = false } = {}){
  const rows = (upserts || []).filter(entry => entry && entry.id);
  const removals = [...new Set((deleteIds || []).filter(Boolean))];
  if(forceFail){
    if(!quiet) showSaveErrorFlash();
    return false;
  }
  if(!rows.length && !removals.length) return true;
  const uid = resolveUid(adminUid);
  if(!uid || !fbDb){
    if(!quiet) showSaveErrorFlash();
    return false;
  }
  const applied = [];
  try{
    for(const group of chunk(rows, BATCH_LIMIT)){
      const previous = new Map();
      for(const entry of group){
        previous.set(entry.id, await readStoredDraft(entry.id));
      }
      const batch = fbDb.batch();
      group.forEach(entry => batch.set(draftRef(entry.id), payloadOf(entry, uid)));
      await batch.commit();
      applied.push({ type: 'set', entries: group, previous });
    }
    for(const group of chunk(removals, BATCH_LIMIT)){
      const snaps = [];
      for(const id of group){
        const data = await readStoredDraft(id);
        if(data) snaps.push({ id, data });
      }
      if(!snaps.length) continue;
      const batch = fbDb.batch();
      snaps.forEach(item => batch.delete(draftRef(item.id)));
      await batch.commit();
      applied.push({ type: 'delete', snaps });
    }
    return true;
  }catch(err){
    console.error('仮決めの保存エラー:', err);
    await rollbackApplied(applied);
    if(!quiet) showSaveErrorFlash();
    return false;
  }
}

export function snapshotLessonLists(){
  return {
    drafts: (S.draftAssignments || []).slice(),
    assignments: (S.assignments || []).slice(),
    pending: (S.pendingAssignments || []).slice(),
  };
}

export function restoreLessonLists(snap){
  if(!snap) return;
  S.draftAssignments = snap.drafts;
  S.assignments = snap.assignments;
  S.pendingAssignments = snap.pending;
}

export async function persistDraftDiff(beforeDrafts, options = {}){
  const { upserts, deleteIds } = diffDrafts(beforeDrafts || [], S.draftAssignments || []);
  if(!upserts.length && !deleteIds.length) return true;
  return commitLessonDrafts({
    upserts,
    deleteIds,
    forceFail: !!options.forceFail,
    adminUid: options.adminUid || '',
    quiet: !!options.quiet,
  });
}
