import { SLOTS } from '../shared/constants.js';
import { fbAuth, fbDb, S } from './state.js';
import { debugLog } from './debug.js';
import { renderMyCalendar } from './calendar.js';
import {
  draftKeyForTicket,
  draftKeyForCancel,
  loadResponseDrafts,
  saveResponseDrafts,
  summarizeDrafts,
  actionLabel,
} from './response-draft.js';

async function loadNewAssignments(){
  const uid = fbAuth.currentUser ? fbAuth.currentUser.uid : null;
  if(!uid) return [];
  try{
    const snap = await fbDb.collection('assignmentApprovals')
      .where('teacherLoginUid','==',uid).get();
    const list = [];
    snap.forEach(doc=>{
      const data = doc.data();
      if(data.status === 'pending') list.push({id:doc.id, ...data});
    });
    debugLog(`[assignmentApprovals] 成功 pending=${list.length}件`);
    return list;
  }catch(err){
    debugLog(`[assignmentApprovals] ★失敗★ code=${err.code} message=${err.message}`);
    console.error('新しい授業の読み込みエラー:', err);
    return [];
  }
}

async function loadPendingCancellationRequests(){
  const uid = fbAuth.currentUser ? fbAuth.currentUser.uid : null;
  if(!uid) return [];
  try{
    const snap = await fbDb.collection('assignmentCancellationRequests')
      .where('teacherLoginUid','==',uid).get();
    const list = [];
    snap.forEach(doc=>{
      const data = doc.data();
      if(data.status === 'pending') list.push({id:doc.id, ...data});
    });
    return list;
  }catch(err){
    console.error('キャンセル依頼の読み込みエラー:', err);
    return [];
  }
}

function findPendingTicket(day, slot, subject, studentName, oneTimeDate){
  const slotNum = Number(slot);
  return S.newAssignments.find(a=>
    a.day===day && Number(a.slot)===slotNum && a.subject===subject && a.studentName===studentName &&
    (oneTimeDate ? a.oneTimeDate===oneTimeDate : !a.oneTimeDate)
  );
}

function findPendingCancellation(entry){
  return S.pendingCancellationRequests.find(r=>
    r.day===entry.day &&
    Number(r.slot)===Number(entry.slot) &&
    r.subject===entry.subject &&
    r.studentName===entry.studentName &&
    (entry.oneTimeDate ? r.oneTimeDate===entry.oneTimeDate : !r.oneTimeDate)
  );
}

function reloadDraftsFromStorage(){
  const uid = fbAuth.currentUser ? fbAuth.currentUser.uid : null;
  S.responseDrafts = loadResponseDrafts(uid);
}

function persistDrafts(){
  const uid = fbAuth.currentUser ? fbAuth.currentUser.uid : null;
  saveResponseDrafts(uid, S.responseDrafts);
}

function getDraftForEntry(entry, ticket){
  if(ticket){
    const key = draftKeyForTicket(ticket.id);
    return S.responseDrafts[key] || null;
  }
  if(entry.approvalStatus === 'confirmed' || !ticket){
    const key = draftKeyForCancel(entry);
    return S.responseDrafts[key] || null;
  }
  return null;
}

function setDraftForTicket(ticket, action, entry){
  const key = draftKeyForTicket(ticket.id);
  S.responseDrafts[key] = {
    action,
    ticketId: ticket.id,
    day: entry.day,
    slot: entry.slot,
    subject: entry.subject,
    studentName: entry.studentName,
    studentGrade: entry.studentGrade || ticket.studentGrade || '',
    oneTimeDate: entry.oneTimeDate || null,
    label: `${entry.day}曜 ${SLOTS.find(s=>s.id===entry.slot)?.label||entry.slot+'講'} ${entry.studentName} ${entry.subject}`,
  };
  persistDrafts();
  renderMyCalendar();
}

function setDraftForCancel(entry){
  const key = draftKeyForCancel(entry);
  S.responseDrafts[key] = {
    action: 'cancel',
    day: entry.day,
    slot: entry.slot,
    subject: entry.subject,
    studentName: entry.studentName,
    studentGrade: entry.studentGrade || '',
    oneTimeDate: entry.oneTimeDate || null,
    label: `${entry.day}曜 ${SLOTS.find(s=>s.id===entry.slot)?.label||entry.slot+'講'} ${entry.studentName} ${entry.subject}`,
  };
  persistDrafts();
  renderMyCalendar();
}

function clearDraftByKey(key){
  delete S.responseDrafts[key];
  persistDrafts();
  renderMyCalendar();
}

function countUnrepliedPendingTickets(){
  const seen = new Set();
  let count = 0;
  S.newAssignments.forEach(t=>{
    if(seen.has(t.id)) return;
    if(S.responseDrafts[draftKeyForTicket(t.id)]) return;
    seen.add(t.id);
    count++;
  });
  return count;
}

function draftAllPendingApprovals(){
  S.newAssignments.forEach(t=>{
    const key = draftKeyForTicket(t.id);
    if(S.responseDrafts[key]) return;
    S.responseDrafts[key] = {
      action: 'approve',
      ticketId: t.id,
      day: t.day,
      slot: t.slot,
      subject: t.subject,
      studentName: t.studentName,
      studentGrade: t.studentGrade || '',
      oneTimeDate: t.oneTimeDate || null,
      label: `${t.day}曜 ${SLOTS.find(s=>s.id===t.slot)?.label||t.slot+'講'} ${t.studentName} ${t.subject}`,
    };
  });
  persistDrafts();
  renderMyCalendar();
}

function buildSubmitConfirmMessage(drafts){
  const lines = Object.values(drafts).map(d=>`・${d.label} … ${actionLabel(d.action)}`);
  return `次の内容を教室長に送信します。\n\n${lines.join('\n')}\n\nよろしいですか？`;
}

async function submitResponseDrafts(){
  const drafts = {...S.responseDrafts};
  const keys = Object.keys(drafts);
  if(keys.length===0) return;
  if(!window.confirm(buildSubmitConfirmMessage(drafts))) return;

  const btn = document.getElementById('submitResponsesBtn');
  if(btn) btn.disabled = true;
  const errors = [];

  for(const key of keys){
    const d = drafts[key];
    try{
      if(d.action==='approve' || d.action==='reject'){
        if(!d.ticketId) throw new Error('ticketId missing');
        await fbDb.collection('assignmentApprovals').doc(d.ticketId).update({
          status: d.action==='approve' ? 'approved' : 'rejected',
        });
      }else if(d.action==='cancel'){
        const uid = fbAuth.currentUser.uid;
        const existing = S.pendingCancellationRequests.find(r=>
          r.day===d.day && Number(r.slot)===Number(d.slot) && r.subject===d.subject &&
          r.studentName===d.studentName &&
          (d.oneTimeDate ? r.oneTimeDate===d.oneTimeDate : !r.oneTimeDate)
        );
        if(!existing){
          await fbDb.collection('assignmentCancellationRequests').add({
            adminUid: S.myAdminUid,
            teacherId: S.myTeacherId,
            teacherLoginUid: uid,
            day: d.day,
            slot: d.slot,
            subject: d.subject,
            studentName: d.studentName,
            studentGrade: d.studentGrade || '',
            oneTimeDate: d.oneTimeDate || null,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
        }
      }
      delete S.responseDrafts[key];
    }catch(err){
      console.error('返信送信エラー:', err, d);
      errors.push(d.label || key);
    }
  }

  persistDrafts();
  S.newAssignments = await loadNewAssignments();
  S.pendingCancellationRequests = await loadPendingCancellationRequests();
  renderMyCalendar();
  if(btn) btn.disabled = false;

  if(errors.length){
    window.alert(`一部の送信に失敗しました。\n${errors.join('\n')}\n\nFirestoreの設定（キャンセル依頼）を教室長に確認してください。`);
  }
}

function startMyAssignmentsListener(){
  if(S.myAssignTimer) clearInterval(S.myAssignTimer);
  const docId = `${S.myAdminUid}_${S.myTeacherId}`;
  const ref = fbDb.collection('teacherAssignments').doc(docId);
  const poll = async ()=>{
    try{
      const snap = await ref.get();
      S.myAssignmentEntries = snap.exists ? (snap.data().entries || []) : [];
      S.newAssignments = await loadNewAssignments();
      S.pendingCancellationRequests = await loadPendingCancellationRequests();
      renderMyCalendar();
    }catch(err){
      console.error('担当授業の読み込みエラー:', err);
    }
  };
  poll();
  S.myAssignTimer = setInterval(poll, 10000);
}

async function refreshPendingAndRender(){
  S.newAssignments = await loadNewAssignments();
  S.pendingCancellationRequests = await loadPendingCancellationRequests();
  renderMyCalendar();
}

function initResponseDraftHandlers(){
  if(initResponseDraftHandlers._bound) return;
  initResponseDraftHandlers._bound = true;
  const draftAllBtn = document.getElementById('draftApproveAllBtn');
  const submitBtn = document.getElementById('submitResponsesBtn');
  if(draftAllBtn){
    draftAllBtn.addEventListener('click', ()=> draftAllPendingApprovals());
  }
  if(submitBtn){
    submitBtn.addEventListener('click', ()=> submitResponseDrafts());
  }
}

export {
  loadNewAssignments,
  loadPendingCancellationRequests,
  findPendingTicket,
  findPendingCancellation,
  getDraftForEntry,
  setDraftForTicket,
  setDraftForCancel,
  clearDraftByKey,
  draftKeyForTicket,
  draftKeyForCancel,
  countUnrepliedPendingTickets,
  summarizeDrafts,
  reloadDraftsFromStorage,
  refreshPendingAndRender,
  startMyAssignmentsListener,
  initResponseDraftHandlers,
};
