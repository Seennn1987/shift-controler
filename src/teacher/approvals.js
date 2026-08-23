import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { mountInlineConfirm, showInlineNotice } from '../shared/inline-confirm.js';
import { pad2, daysInYearMonth } from '../shared/date-utils.js';
import { fbAuth, fbDb, S } from './state.js';
import { debugLog } from './debug.js';
import { getDayStatus } from './day-status.js';
import { renderMyCalendar } from './calendar.js';
import { renderKeepingOverrides } from './shift-ui.js';
import {
  draftKeyForTicket,
  draftKeyForSlot,
  draftKeyForCancel,
  loadResponseDrafts,
  saveResponseDrafts,
  summarizeDrafts,
  actionLabel,
} from './response-draft.js';
import { ticketSubjectMatchesEntry } from '../admin/dual-subject.js';

async function loadAdminCancelledNotices(){
  const uid = fbAuth.currentUser ? fbAuth.currentUser.uid : null;
  if(!uid) return [];
  try{
    const snap = await fbDb.collection('assignmentApprovals')
      .where('teacherLoginUid','==',uid).get();
    const list = [];
    snap.forEach(doc=>{
      const data = doc.data();
      if(data.status !== 'cancelled') return;
      if(!data.cancelledByAdmin) return;
      if(data.teacherRead) return;
      list.push({id:doc.id, ...data});
    });
    list.sort((a,b)=>{
      const ta = (a.cancelledAt && a.cancelledAt.toMillis) ? a.cancelledAt.toMillis() : 0;
      const tb = (b.cancelledAt && b.cancelledAt.toMillis) ? b.cancelledAt.toMillis() : 0;
      return tb - ta;
    });
    return list;
  }catch(err){
    console.error('取り消しお知らせ読み込みエラー:', err);
    return [];
  }
}

async function markAdminCancelledNoticeRead(ticketId){
  if(!ticketId) return;
  try{
    await fbDb.collection('assignmentApprovals').doc(ticketId).update({ teacherRead: true });
    S.adminCancelledNotices = S.adminCancelledNotices.filter(n=> n.id !== ticketId);
  }catch(err){
    console.error('お知らせ既読更新エラー:', err);
  }
}

function formatAdminCancelledNoticeLine(notice){
  const slotDef = SLOTS.find(s=> Number(s.id) === Number(notice.slot));
  const slotLabel = slotDef ? slotDef.label : `${notice.slot}講`;
  if(notice.oneTimeDate){
    const d = new Date(`${notice.oneTimeDate}T00:00:00`);
    const wd = WEEKDAY_JP[d.getDay()];
    return `${d.getMonth() + 1}/${d.getDate()}（${wd}）${slotLabel} ${notice.subject} ${notice.studentName}さん`;
  }
  return `${notice.day}曜 ${slotLabel} ${notice.subject} ${notice.studentName}さん`;
}

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
  return S.newAssignments.find(a=>{
    if(a.day !== day || Number(a.slot) !== slotNum || a.studentName !== studentName) return false;
    if(!ticketSubjectMatchesEntry(a, subject)) return false;
    if(a.oneTimeDate && oneTimeDate) return a.oneTimeDate === oneTimeDate;
    if(a.oneTimeDate && !oneTimeDate) return false;
    if(!a.oneTimeDate && oneTimeDate) return true;
    return true;
  });
}

function resolveApprovalState(entry){
  if(entry.approvalStatus === 'pending') return 'pending';
  if(entry.approvalStatus === 'confirmed') return 'confirmed';
  return findPendingTicket(entry.day, entry.slot, entry.subject, entry.studentName, entry.oneTimeDate)
    ? 'pending'
    : 'confirmed';
}

function getSlotPendingTickets(dateStr, slotId){
  const wd = WEEKDAY_JP[new Date(`${dateStr}T00:00:00`).getDay()];
  return S.newAssignments.filter(t=>{
    if(t.day !== wd || Number(t.slot) !== Number(slotId)) return false;
    if(t.oneTimeDate) return t.oneTimeDate === dateStr;
    return true;
  });
}

function slotLabelFor(dateStr, slotId){
  const d = new Date(`${dateStr}T00:00:00`);
  const wd = WEEKDAY_JP[d.getDay()];
  const slotDef = SLOTS.find(s=> Number(s.id) === Number(slotId));
  return `${d.getMonth() + 1}/${d.getDate()}（${wd}）${slotDef ? slotDef.label : `${slotId}講`}`;
}

function collectActionablePendingSlots(){
  if(S.curYear == null || S.curMonth == null) return [];
  const seen = new Set();
  const items = [];
  const total = daysInYearMonth(`${S.curYear}-${pad2(S.curMonth + 1)}`);
  for(let d = 1; d <= total; d++){
    const dateStr = `${S.curYear}-${pad2(S.curMonth + 1)}-${pad2(d)}`;
    if(getDayStatus(dateStr).type !== 'open') continue;
    SLOTS.forEach(slot=>{
      const tickets = getSlotPendingTickets(dateStr, slot.id);
      if(tickets.length === 0) return;
      const key = draftKeyForSlot(dateStr, slot.id);
      if(S.responseDrafts[key]) return;
      if(seen.has(key)) return;
      seen.add(key);
      items.push({ dateStr, slotId: slot.id, tickets });
    });
  }
  return items;
}

/** @deprecated 互換用 */
function collectActionablePendingApprovals(){
  return collectActionablePendingSlots();
}

function pruneStaleResponseDrafts(){
  const next = {};
  let changed = false;
  Object.entries(S.responseDrafts).forEach(([key, d])=>{
    if(d.action === 'approve' || d.action === 'reject'){
      if(key.startsWith('slot:')){
        const tickets = getSlotPendingTickets(d.dateStr, d.slotId);
        if(tickets.length === 0){
          changed = true;
          return;
        }
        next[key] = d;
        return;
      }
      const ticket = d.ticketId ? S.newAssignments.find(t=> t.id === d.ticketId) : null;
      if(!ticket){
        changed = true;
        return;
      }
      next[key] = d;
      return;
    }
    if(d.action === 'cancel'){
      const entry = S.myAssignmentEntries.find(e=>
        e.day === d.day &&
        Number(e.slot) === Number(d.slot) &&
        ticketSubjectMatchesEntry({ subject: d.subject, subjects: d.subjects }, e.subject) &&
        e.studentName === d.studentName &&
        (d.oneTimeDate ? e.oneTimeDate === d.oneTimeDate : !e.oneTimeDate)
      );
      if(!entry || entry.approvalStatus === 'pending' || findPendingCancellation(entry)){
        changed = true;
        return;
      }
      next[key] = d;
      return;
    }
    changed = true;
  });
  if(changed || Object.keys(next).length !== Object.keys(S.responseDrafts).length){
    S.responseDrafts = next;
    persistDrafts();
  }
}

function findPendingCancellation(entry){
  return S.pendingCancellationRequests.find(r=>
    r.day === entry.day &&
    Number(r.slot) === Number(entry.slot) &&
    ticketSubjectMatchesEntry(r, entry.subject) &&
    r.studentName === entry.studentName &&
    (entry.oneTimeDate ? r.oneTimeDate === entry.oneTimeDate : !r.oneTimeDate)
  );
}

function reloadDraftsFromStorage(){
  const uid = fbAuth.currentUser ? fbAuth.currentUser.uid : null;
  S.responseDrafts = loadResponseDrafts(uid);
  pruneStaleResponseDrafts();
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

function rerenderSchedule(){
  renderMyCalendar();
  renderKeepingOverrides();
}

function getSlotDraft(dateStr, slotId){
  return S.responseDrafts[draftKeyForSlot(dateStr, slotId)] || null;
}

function setDraftForSlot(dateStr, slotId, action){
  const tickets = getSlotPendingTickets(dateStr, slotId);
  if(tickets.length === 0) return;
  const wd = WEEKDAY_JP[new Date(`${dateStr}T00:00:00`).getDay()];
  const key = draftKeyForSlot(dateStr, slotId);
  S.responseDrafts[key] = {
    action,
    dateStr,
    slotId: Number(slotId),
    day: wd,
    ticketIds: tickets.map(t=> t.id),
    label: `${slotLabelFor(dateStr, slotId)}（${tickets.length}件）`,
  };
  persistDrafts();
  rerenderSchedule();
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
  rerenderSchedule();
}

function clearDraftByKey(key){
  delete S.responseDrafts[key];
  persistDrafts();
  rerenderSchedule();
}

function clearSlotDraft(dateStr, slotId){
  clearDraftByKey(draftKeyForSlot(dateStr, slotId));
}

function countUnrepliedPendingSlots(){
  return collectActionablePendingSlots().length;
}

function countUnrepliedPendingTickets(){
  return countUnrepliedPendingSlots();
}

function draftAllPendingApprovals(){
  let changed = false;
  collectActionablePendingSlots().forEach(({ dateStr, slotId })=>{
    if(getSlotDraft(dateStr, slotId)) return;
    const tickets = getSlotPendingTickets(dateStr, slotId);
    if(tickets.length === 0) return;
    const wd = WEEKDAY_JP[new Date(`${dateStr}T00:00:00`).getDay()];
    const key = draftKeyForSlot(dateStr, slotId);
    S.responseDrafts[key] = {
      action: 'approve',
      dateStr,
      slotId: Number(slotId),
      day: wd,
      ticketIds: tickets.map(t=> t.id),
      label: `${slotLabelFor(dateStr, slotId)}（${tickets.length}件）`,
    };
    changed = true;
  });
  if(changed) persistDrafts();
  rerenderSchedule();
}

function buildSubmitConfirmMessage(drafts){
  const lines = Object.values(drafts).map(d=>`・${d.label} … ${actionLabel(d.action)}`);
  return `次の内容を教室長に送信します。\n\n${lines.join('\n')}\n\nよろしいですか？`;
}

async function submitResponseDrafts(){
  const drafts = {...S.responseDrafts};
  const keys = Object.keys(drafts);
  if(keys.length===0) return;

  const btn = document.getElementById('submitResponsesBtn');
  if(btn) btn.disabled = true;
  const errors = [];

  for(const key of keys){
    const d = drafts[key];
    try{
      if(d.action==='approve' || d.action==='reject'){
        const status = d.action === 'approve' ? 'approved' : 'rejected';
        const ticketIds = d.ticketIds?.length ? d.ticketIds : (d.ticketId ? [d.ticketId] : []);
        if(ticketIds.length === 0) throw new Error('ticketIds missing');
        for(const ticketId of ticketIds){
          await fbDb.collection('assignmentApprovals').doc(ticketId).update({ status });
        }
      }else if(d.action==='cancel'){
        const uid = fbAuth.currentUser.uid;
        const existing = S.pendingCancellationRequests.find(r=>
          r.day === d.day && Number(r.slot) === Number(d.slot) &&
          ticketSubjectMatchesEntry(r, d.subject) &&
          r.studentName === d.studentName &&
          (d.oneTimeDate ? r.oneTimeDate === d.oneTimeDate : !r.oneTimeDate)
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
  S.adminCancelledNotices = await loadAdminCancelledNotices();
  rerenderSchedule();
  if(btn) btn.disabled = false;

  if(errors.length){
    showInlineNotice(document.getElementById('pendingBannerCard'), `一部の送信に失敗しました。\n${errors.join('\n')}\n\nFirestoreの設定（キャンセル依頼）を教室長に確認してください。`, { variant: 'warn', clear: false });
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
      S.adminCancelledNotices = await loadAdminCancelledNotices();
      pruneStaleResponseDrafts();
      rerenderSchedule();
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
  S.adminCancelledNotices = await loadAdminCancelledNotices();
  pruneStaleResponseDrafts();
  rerenderSchedule();
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
    submitBtn.addEventListener('click', ()=>{
      const drafts = {...S.responseDrafts};
      if(Object.keys(drafts).length === 0) return;
      mountInlineConfirm(document.getElementById('pendingBannerCard'), submitBtn, {
        message: buildSubmitConfirmMessage(drafts),
        confirmLabel: '送信する',
        variant: 'primary',
        mountSelector: '.pending-banner-col',
        onConfirm: async ()=>{
          await submitResponseDrafts();
          return { ok: true };
        },
      });
    });
  }
}

export {
  loadNewAssignments,
  loadPendingCancellationRequests,
  loadAdminCancelledNotices,
  markAdminCancelledNoticeRead,
  formatAdminCancelledNoticeLine,
  findPendingTicket,
  findPendingCancellation,
  getDraftForEntry,
  getSlotDraft,
  setDraftForSlot,
  setDraftForCancel,
  clearDraftByKey,
  clearSlotDraft,
  draftKeyForTicket,
  draftKeyForSlot,
  draftKeyForCancel,
  countUnrepliedPendingSlots,
  countUnrepliedPendingTickets,
  summarizeDrafts,
  reloadDraftsFromStorage,
  pruneStaleResponseDrafts,
  resolveApprovalState,
  collectActionablePendingSlots,
  collectActionablePendingApprovals,
  getSlotPendingTickets,
  refreshPendingAndRender,
  startMyAssignmentsListener,
  initResponseDraftHandlers,
};
