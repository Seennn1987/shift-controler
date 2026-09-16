import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { showAppNoticeDialog } from '../shared/app-confirm-dialog.js';
import { mountInlineConfirm, showInlineNotice } from '../shared/inline-confirm.js';
import { pad2, daysInYearMonth, isOnOrAfterDate } from '../shared/date-utils.js';
import { POLL_INTERVAL_MS, startVisiblePoll } from '../shared/poll-while-visible.js';
import {
  FIRESTORE_READ_FLAGS,
  backfillAttentionFlags,
  fetchTeacherApprovalDocs,
  needsTeacherAttention,
  probeAssignmentApprovalsSnapshot,
  listenAttentionApprovals,
} from '../shared/firestore-read-safety.js';
import { fbAuth, fbDb, S } from './state.js';
import { debugLog } from './debug.js';
import { getDayStatus } from './day-status.js';
import { renderMyCalendar } from './calendar.js';
import {
  draftKeyForTicket,
  draftKeyForSlot,
  draftKeyForCancel,
  loadResponseDrafts,
  saveResponseDrafts,
  summarizeDrafts,
  actionLabel,
  splitResponseDrafts,
} from './response-draft.js';
import { ticketSubjectMatchesEntry } from '../admin/dual-subject.js';

function collectApprovalNoticesFromDocs(docs){
  const pending = [];
  const cancelledNotices = [];
  docs.forEach(doc=>{
    const data = doc.data;
    if(data.status === 'pending') pending.push({id:doc.id, ...data});
    if(data.status === 'cancelled' && data.cancelledByAdmin && !data.teacherRead){
      cancelledNotices.push({id:doc.id, ...data});
      return;
    }
    if(data.status === 'pending' && data.cancelNoticeUnread && data.lastCancelledDate){
      cancelledNotices.push({id:doc.id, ...data});
    }
  });
  cancelledNotices.sort((a,b)=>{
    const ta = (a.cancelledAt && a.cancelledAt.toMillis) ? a.cancelledAt.toMillis() : 0;
    const tb = (b.cancelledAt && b.cancelledAt.toMillis) ? b.cancelledAt.toMillis() : 0;
    return tb - ta;
  });
  return { pending, cancelledNotices };
}

function collectApprovalNoticesFromSnap(snap){
  return collectApprovalNoticesFromDocs(snap.docs.map(doc=> ({ id: doc.id, data: doc.data() })));
}

async function loadAdminCancelledNotices(){
  const uid = fbAuth.currentUser ? fbAuth.currentUser.uid : null;
  if(!uid) return [];
  try{
    const result = await fetchTeacherApprovalDocs(fbDb, uid);
    return collectApprovalNoticesFromDocs(result.docs).cancelledNotices;
  }catch(err){
    console.error('取り消しお知らせ読み込みエラー:', err);
    return [];
  }
}

async function markAdminCancelledNoticeRead(ticketId){
  if(!ticketId) return;
  try{
    const notice = (S.adminCancelledNotices || []).find(n=> n.id === ticketId);
    if(notice && notice.status === 'pending'){
      await fbDb.collection('assignmentApprovals').doc(ticketId).update({
        cancelNoticeUnread: false,
        teacherAttention: needsTeacherAttention({
          ...notice,
          cancelNoticeUnread: false,
        }),
      });
    }else{
      await fbDb.collection('assignmentApprovals').doc(ticketId).update({
        teacherRead: true,
        teacherAttention: false,
      });
    }
    S.adminCancelledNotices = S.adminCancelledNotices.filter(n=> n.id !== ticketId);
  }catch(err){
    console.error('お知らせ既読更新エラー:', err);
  }
}

function formatAdminCancelledNoticeLine(notice){
  const slotDef = SLOTS.find(s=> Number(s.id) === Number(notice.slot));
  const slotLabel = slotDef ? slotDef.label : `${notice.slot}講`;
  const dateStr = notice.lastCancelledDate || notice.oneTimeDate;
  if(dateStr){
    const d = new Date(`${dateStr}T00:00:00`);
    const wd = WEEKDAY_JP[d.getDay()];
    return `${d.getMonth() + 1}/${d.getDate()}（${wd}）${slotLabel} ${notice.subject} ${notice.studentName}さん`;
  }
  return `${notice.day}曜 ${slotLabel} ${notice.subject} ${notice.studentName}さん`;
}

async function loadNewAssignments(){
  const uid = fbAuth.currentUser ? fbAuth.currentUser.uid : null;
  if(!uid) return [];
  try{
    const result = await fetchTeacherApprovalDocs(fbDb, uid);
    const { pending } = collectApprovalNoticesFromDocs(result.docs);
    debugLog(`[assignmentApprovals] 成功 pending=${pending.length}件`);
    return pending;
  }catch(err){
    debugLog(`[assignmentApprovals] ★失敗★ code=${err.code} message=${err.message}`);
    console.error('新しい授業の読み込みエラー:', err);
    return [];
  }
}

async function loadAssignmentApprovalBundles(){
  const uid = fbAuth.currentUser ? fbAuth.currentUser.uid : null;
  if(!uid) return { pending: [], cancelledNotices: [] };
  try{
    const result = await fetchTeacherApprovalDocs(fbDb, uid);
    const bundles = collectApprovalNoticesFromDocs(result.docs);
    debugLog(`[assignmentApprovals] 成功 pending=${bundles.pending.length}件`);
    return bundles;
  }catch(err){
    debugLog(`[assignmentApprovals] ★失敗★ code=${err.code} message=${err.message}`);
    console.error('新しい授業の読み込みエラー:', err);
    return { pending: [], cancelledNotices: [] };
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

function resolveCourseStartDate(item){
  if(item?.courseStartDate) return item.courseStartDate;
  const name = item?.studentName;
  if(!name) return null;
  const fromEntry = (S.myAssignmentEntries || []).find(e=> e.studentName === name && e.courseStartDate);
  return fromEntry?.courseStartDate || null;
}

function approvalAppliesOnDate(ticket, dateStr){
  if(!isOnOrAfterDate(dateStr, resolveCourseStartDate(ticket))) return false;
  if((ticket.skippedDates || []).includes(dateStr)) return false;
  if(ticket.oneTimeDate) return ticket.oneTimeDate === dateStr;
  const wd = WEEKDAY_JP[new Date(`${dateStr}T00:00:00`).getDay()];
  if(ticket.day !== wd) return false;
  return getDayStatus(dateStr).type === 'open';
}

function entryAppliesOnDate(entry, dateStr){
  if(!isOnOrAfterDate(dateStr, resolveCourseStartDate(entry))) return false;
  if(entry.leftDate && dateStr >= entry.leftDate) return false;
  if((entry.absentDates || []).includes(dateStr)) return false;
  if((entry.skippedDates || []).includes(dateStr)) return false;
  if(entry.oneTimeDate) return entry.oneTimeDate === dateStr;
  const wd = WEEKDAY_JP[new Date(`${dateStr}T00:00:00`).getDay()];
  if(entry.day !== wd) return false;
  return getDayStatus(dateStr).type === 'open';
}

function findPendingTicket(day, slot, subject, studentName, oneTimeDate, dateStr, studentId){
  const slotNum = Number(slot);
  return S.newAssignments.find(a=>{
    if(a.day !== day || Number(a.slot) !== slotNum) return false;
    if(studentId && a.studentId){
      if(a.studentId !== studentId) return false;
    }else if(a.studentName !== studentName){
      return false;
    }
    if(!ticketSubjectMatchesEntry(a, subject)) return false;
    if(a.oneTimeDate && oneTimeDate) return a.oneTimeDate === oneTimeDate;
    if(a.oneTimeDate && !oneTimeDate) return false;
    if(!a.oneTimeDate && oneTimeDate){
      const checkDate = dateStr || oneTimeDate;
      return checkDate ? approvalAppliesOnDate(a, checkDate) : false;
    }
    if(dateStr && !approvalAppliesOnDate(a, dateStr)) return false;
    return true;
  });
}

function resolveApprovalState(entry, dateStr){
  if(entry.approvalStatus === 'pending'){
    return dateStr && !entryAppliesOnDate(entry, dateStr) ? 'confirmed' : 'pending';
  }
  if(entry.approvalStatus === 'confirmed') return 'confirmed';
  return findPendingTicket(entry.day, entry.slot, entry.subject, entry.studentName, entry.oneTimeDate, dateStr, entry.studentId)
    ? 'pending'
    : 'confirmed';
}

function getSlotPendingTickets(dateStr, slotId){
  const wd = WEEKDAY_JP[new Date(`${dateStr}T00:00:00`).getDay()];
  return S.newAssignments.filter(t=>{
    if(t.day !== wd || Number(t.slot) !== Number(slotId)) return false;
    return approvalAppliesOnDate(t, dateStr);
  });
}

function parseSlotDraftKey(key){
  if(!key.startsWith('slot:')) return null;
  const body = key.slice(5);
  const sep = body.lastIndexOf('|');
  if(sep <= 0) return null;
  return { dateStr: body.slice(0, sep), slotId: Number(body.slice(sep + 1)) };
}

function resolveDraftDisplayDateStr(key, d, ticket){
  if(d?.dateStr) return d.dateStr;
  if(d?.oneTimeDate) return d.oneTimeDate;
  const fromKey = parseSlotDraftKey(key);
  if(fromKey?.dateStr) return fromKey.dateStr;
  if(ticket?.oneTimeDate) return ticket.oneTimeDate;
  if(ticket) return findDraftDateForTicket(ticket);
  return null;
}

function findDraftDateForTicket(ticket){
  if(!ticket || S.curYear == null || S.curMonth == null) return null;
  const total = daysInYearMonth(`${S.curYear}-${pad2(S.curMonth + 1)}`);
  for(let d = 1; d <= total; d++){
    const dateStr = `${S.curYear}-${pad2(S.curMonth + 1)}-${pad2(d)}`;
    if(getDayStatus(dateStr).type !== 'open') continue;
    const slotDraft = S.responseDrafts[draftKeyForSlot(dateStr, ticket.slot)];
    if(!slotDraft) continue;
    const ids = slotDraft.ticketIds || (slotDraft.ticketId ? [slotDraft.ticketId] : []);
    if(ids.includes(ticket.id)) return dateStr;
  }
  return null;
}

function normalizeResponseDraft(key, d){
  const next = { ...d };
  if(key.startsWith('slot:')){
    const parsed = parseSlotDraftKey(key);
    if(parsed?.dateStr) next.dateStr = next.dateStr || parsed.dateStr;
    if(parsed?.slotId) next.slotId = next.slotId ?? parsed.slotId;
    if(next.dateStr && !next.day){
      next.day = WEEKDAY_JP[new Date(`${next.dateStr}T00:00:00`).getDay()];
    }
  }
  return next;
}

function formatDateWeekdayLabel(dateStr){
  const d = new Date(`${dateStr}T00:00:00`);
  const wd = WEEKDAY_JP[d.getDay()];
  return `${d.getMonth() + 1}/${d.getDate()}（${wd}）`;
}

function slotLabelFor(dateStr, slotId){
  const slotDef = SLOTS.find(s=> Number(s.id) === Number(slotId));
  return `${formatDateWeekdayLabel(dateStr)}${slotDef ? slotDef.label : `${slotId}講`}`;
}

function formatTicketDetailLine(dateStr, ticket){
  const slotDef = SLOTS.find(s=> Number(s.id) === Number(ticket.slot));
  const slotLabel = slotDef ? slotDef.label : `${ticket.slot}講`;
  const resolvedDate = dateStr || ticket.oneTimeDate || null;
  const datePart = resolvedDate
    ? formatDateWeekdayLabel(resolvedDate)
    : `（${ticket.day}）`;
  return `・${datePart}${slotLabel} ${ticket.studentName} ${ticket.subject}`;
}

function formatCancelDraftLabel(entry){
  const slotDef = SLOTS.find(s=> Number(s.id) === Number(entry.slot));
  const slotLabel = slotDef ? slotDef.label : `${entry.slot}講`;
  const resolvedDate = entry.dateStr || entry.oneTimeDate || null;
  const datePart = resolvedDate
    ? formatDateWeekdayLabel(resolvedDate)
    : `（${entry.day}）`;
  return `${datePart}${slotLabel} ${entry.studentName} ${entry.subject}`;
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
    const draft = normalizeResponseDraft(key, d);
    if(draft.action === 'approve' || draft.action === 'reject'){
      if(key.startsWith('slot:')){
        const parsed = parseSlotDraftKey(key);
        const dateStr = draft.dateStr || parsed?.dateStr;
        const slotId = Number(draft.slotId ?? parsed?.slotId);
        if(!dateStr || !slotId){
          changed = true;
          return;
        }
        const tickets = getSlotPendingTickets(dateStr, slotId);
        if(tickets.length === 0){
          changed = true;
          return;
        }
        if(draft.dateStr !== d.dateStr || draft.slotId !== d.slotId || draft.day !== d.day) changed = true;
        next[key] = draft;
        return;
      }
      const ticket = draft.ticketId ? S.newAssignments.find(t=> t.id === draft.ticketId) : null;
      if(!ticket){
        changed = true;
        return;
      }
      next[key] = draft;
      return;
    }
    if(draft.action === 'cancel'){
      const entry = S.myAssignmentEntries.find(e=>
        e.day === d.day &&
        Number(e.slot) === Number(d.slot) &&
        ticketSubjectMatchesEntry({ subject: d.subject, subjects: d.subjects }, e.subject) &&
        e.studentName === d.studentName &&
        (d.oneTimeDate ? e.oneTimeDate === d.oneTimeDate : !e.oneTimeDate)
      );
      if(!entry || entry.approvalStatus === 'pending' || findPendingCancellation(entry, d.dateStr)){
        changed = true;
        return;
      }
      if(draft.dateStr && !entryAppliesOnDate(entry, draft.dateStr)){
        changed = true;
        return;
      }
      next[key] = draft;
      return;
    }
    changed = true;
  });
  if(changed || Object.keys(next).length !== Object.keys(S.responseDrafts).length){
    S.responseDrafts = next;
    persistDrafts();
  }
}

function cancellationDateKey(r){
  return r.dateStr || r.oneTimeDate || '';
}

function findPendingCancellation(entry, dateStr){
  const eDate = dateStr || entry.dateStr || entry.oneTimeDate || '';
  return S.pendingCancellationRequests.find(r=>
    r.day === entry.day &&
    Number(r.slot) === Number(entry.slot) &&
    ticketSubjectMatchesEntry(r, entry.subject) &&
    r.studentName === entry.studentName &&
    (eDate ? cancellationDateKey(r) === eDate : !cancellationDateKey(r))
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
    studentId: entry.studentId || null,
    studentGrade: entry.studentGrade || '',
    oneTimeDate: entry.oneTimeDate || null,
    dateStr: entry.dateStr || entry.oneTimeDate || null,
    label: formatCancelDraftLabel(entry),
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
  const approveLines = [];
  const rejectLines = [];
  const cancelLines = [];

  Object.entries(drafts).forEach(([key, raw])=>{
    const d = normalizeResponseDraft(key, raw);
    if(d.action === 'approve' || d.action === 'reject'){
      const ticketIds = d.ticketIds?.length ? d.ticketIds : (d.ticketId ? [d.ticketId] : []);
      const tickets = ticketIds.map(id=> S.newAssignments.find(t=> t.id === id)).filter(Boolean);
      const target = d.action === 'approve' ? approveLines : rejectLines;
      if(tickets.length > 0){
        tickets.forEach(ticket=>{
          const displayDate = resolveDraftDisplayDateStr(key, d, ticket);
          target.push(formatTicketDetailLine(displayDate, ticket));
        });
        return;
      }
      const displayDate = resolveDraftDisplayDateStr(key, d, null);
      target.push(displayDate
        ? `・${formatDateWeekdayLabel(displayDate)}${d.label || ''}`
        : `・${d.label}`);
      return;
    }
    if(d.action === 'cancel'){
      cancelLines.push(`・${formatCancelDraftLabel(d)}`);
      return;
    }
    cancelLines.push(`・${d.label}`);
  });

  const sections = [];
  if(approveLines.length) sections.push(`【承認】\n${approveLines.join('\n')}`);
  if(rejectLines.length) sections.push(`【辞退】\n${rejectLines.join('\n')}`);
  if(cancelLines.length) sections.push(`【欠勤申請】\n${cancelLines.join('\n')}`);

  return {
    title: '次の内容を教室長に提出します。',
    body: sections.join('\n\n'),
    footer: 'よろしいですか？',
  };
}

async function submitResponseDrafts(kind){
  const { lesson, absence } = splitResponseDrafts(S.responseDrafts);
  const drafts = kind === 'absence' ? absence : lesson;
  const keys = Object.keys(drafts);
  if(keys.length===0) return;

  const btn = kind === 'absence'
    ? document.getElementById('submitAbsenceBtn')
    : document.getElementById('submitResponsesBtn');
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
          await fbDb.collection('assignmentApprovals').doc(ticketId).update({
            status,
            adminAttention: true,
            teacherAttention: false,
          });
        }
      }else if(d.action==='cancel'){
        const uid = fbAuth.currentUser.uid;
        const existing = S.pendingCancellationRequests.find(r=>
          r.day === d.day && Number(r.slot) === Number(d.slot) &&
          ticketSubjectMatchesEntry(r, d.subject) &&
          r.studentName === d.studentName &&
          cancellationDateKey(r) === cancellationDateKey(d)
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
            studentId: d.studentId || null,
            studentGrade: d.studentGrade || '',
            oneTimeDate: d.oneTimeDate || null,
            dateStr: d.dateStr || d.oneTimeDate || null,
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

  const dock = document.getElementById('submitDock');
  if(errors.length){
    showInlineNotice(dock, `一部を提出できませんでした。\n通信状況をご確認のうえ、もう一度お試しください。`, { variant: 'warn', clear: false });
    return { ok: false };
  }
  if(kind === 'absence'){
    showAppNoticeDialog({
      title: '欠勤を申請しました。',
      message: '急な欠勤（3日以内）の場合は、教室長に電話でご連絡ください。それ以外はLINEでも構いません。',
    });
  }
  return { ok: true };
}

function bindSubmitDraftButton(btn, kind, mountSelector){
  if(!btn) return;
  btn.addEventListener('click', ()=>{
    const { lesson, absence } = splitResponseDrafts(S.responseDrafts);
    const drafts = kind === 'absence' ? absence : lesson;
    if(Object.keys(drafts).length === 0) return;
    mountInlineConfirm(document.getElementById('submitDock'), btn, {
      messageParts: buildSubmitConfirmMessage(drafts),
      confirmLabel: '提出する',
      variant: 'primary',
      mountSelector,
      onConfirm: async ()=>{
        await submitResponseDrafts(kind);
        return { ok: true };
      },
    });
  });
}

function stopMyAssignmentsListener(){
  if(typeof S.approvalSnapshotUnsub === 'function'){
    try{ S.approvalSnapshotUnsub(); }catch(_e){ /* ignore */ }
    S.approvalSnapshotUnsub = null;
  }
  if(typeof S.myAssignTimer === 'function'){
    S.myAssignTimer();
    S.myAssignTimer = null;
    return;
  }
  if(S.myAssignTimer){
    clearInterval(S.myAssignTimer);
    S.myAssignTimer = null;
  }
}

async function pollMyAssignmentsCore(){
  const docId = `${S.myAdminUid}_${S.myTeacherId}`;
  const ref = fbDb.collection('teacherAssignments').doc(docId);
  try{
    const snap = await ref.get();
    S.myAssignmentEntries = snap.exists ? (snap.data().entries || []) : [];
    S.pendingCancellationRequests = await loadPendingCancellationRequests();
    pruneStaleResponseDrafts();
    rerenderSchedule();
  }catch(err){
    console.error('担当授業の読み込みエラー:', err);
  }
}

async function pollMyAssignments(){
  try{
    const approvalBundles = await loadAssignmentApprovalBundles();
    S.newAssignments = approvalBundles.pending;
    S.adminCancelledNotices = approvalBundles.cancelledNotices;
    await pollMyAssignmentsCore();
  }catch(err){
    console.error('担当授業の読み込みエラー:', err);
  }
}

function startMyAssignmentsSnapshotWithPollFallback(){
  const uid = fbAuth.currentUser?.uid;
  if(!uid) return false;
  if(typeof S.approvalSnapshotUnsub === 'function'){
    try{ S.approvalSnapshotUnsub(); }catch(_e){ /* ignore */ }
  }
  try{
    S.approvalSnapshotUnsub = listenAttentionApprovals(fbDb, {
      teacherLoginUid: uid,
      onData: (docs)=>{
        const bundles = collectApprovalNoticesFromDocs(docs);
        S.newAssignments = bundles.pending;
        S.adminCancelledNotices = bundles.cancelledNotices;
        pruneStaleResponseDrafts();
        rerenderSchedule();
      },
      onError: ()=>{
        if(typeof S.approvalSnapshotUnsub === 'function'){
          try{ S.approvalSnapshotUnsub(); }catch(_e){ /* ignore */ }
        }
        S.approvalSnapshotUnsub = null;
        if(typeof S.myAssignTimer === 'function') S.myAssignTimer();
        S.myAssignTimer = startVisiblePoll(pollMyAssignments, POLL_INTERVAL_MS.APPROVAL);
      },
    });
    // 担当本体・キャンセル依頼は監視対象外のため、短い定期取得を続ける
    if(typeof S.myAssignTimer === 'function') S.myAssignTimer();
    S.myAssignTimer = startVisiblePoll(pollMyAssignmentsCore, POLL_INTERVAL_MS.DEFAULT);
    return true;
  }catch(err){
    console.error('[firestore-read-safety] 講師監視開始失敗:', err);
    S.approvalSnapshotUnsub = null;
    return false;
  }
}

function startMyAssignmentsListener(){
  stopMyAssignmentsListener();

  const boot = async ()=>{
    const uid = fbAuth.currentUser?.uid;
    if(uid){
      try{
        const backfill = await backfillAttentionFlags(fbDb, { teacherLoginUid: uid });
        debugLog(`[firestore-read-safety] teacherAttention 補完 scanned=${backfill.scanned} updated=${backfill.updated}`);
        if(FIRESTORE_READ_FLAGS.enableSnapshotProbe){
          S.snapshotProbeResult = await probeAssignmentApprovalsSnapshot(fbDb, { teacherLoginUid: uid });
        }
      }catch(err){
        console.error('[firestore-read-safety] 講師ログイン時安全処理エラー:', err);
      }
    }

    if(FIRESTORE_READ_FLAGS.useSnapshotListeners && S.snapshotProbeResult?.ok){
      const ok = startMyAssignmentsSnapshotWithPollFallback();
      if(ok){
        await pollMyAssignmentsCore();
        return;
      }
    }
    S.myAssignTimer = startVisiblePoll(pollMyAssignments, POLL_INTERVAL_MS.APPROVAL);
  };
  boot();
}

async function refreshPendingAndRender(){
  const approvalBundles = await loadAssignmentApprovalBundles();
  S.newAssignments = approvalBundles.pending;
  S.adminCancelledNotices = approvalBundles.cancelledNotices;
  S.pendingCancellationRequests = await loadPendingCancellationRequests();
  pruneStaleResponseDrafts();
  rerenderSchedule();
}

function initResponseDraftHandlers(){
  if(initResponseDraftHandlers._bound) return;
  initResponseDraftHandlers._bound = true;
  const draftAllBtn = document.getElementById('draftApproveAllBtn');
  if(draftAllBtn){
    draftAllBtn.addEventListener('click', ()=> draftAllPendingApprovals());
  }
  bindSubmitDraftButton(
    document.getElementById('submitResponsesBtn'),
    'lesson',
    '.submit-dock-block.is-lesson',
  );
  bindSubmitDraftButton(
    document.getElementById('submitAbsenceBtn'),
    'absence',
    '.submit-dock-block.is-absence',
  );
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
  entryAppliesOnDate,
  resolveApprovalState,
  collectActionablePendingSlots,
  collectActionablePendingApprovals,
  getSlotPendingTickets,
  refreshPendingAndRender,
  startMyAssignmentsListener,
  stopMyAssignmentsListener,
  initResponseDraftHandlers,
};
