import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { collapseTeacherCalendarEntries, ticketSubjectMatchesEntry, buildDualSubjectTagsHtml } from '../admin/dual-subject.js';
import { subjectColor } from '../admin/schedule-core.js';
import { pad2, daysInYearMonth, toDateStr } from '../shared/date-utils.js';
import { S } from './state.js';
import { mountInlineConfirm } from '../shared/inline-confirm.js';
import { getDayStatus } from './day-status.js';
import { splitResponseDrafts } from './response-draft.js';
import {
  markAdminCancelledNoticeRead,
  formatAdminCancelledNoticeLine,
  findPendingTicket,
  findPendingCancellation,
  resolveApprovalState,
  getSlotDraft,
  setDraftForSlot,
  setDraftForCancel,
  clearDraftByKey,
  draftKeyForSlot,
  draftKeyForCancel,
  countUnrepliedPendingSlots,
  pruneStaleResponseDrafts,
  getSlotPendingTickets,
  entryAppliesOnDate,
} from './approvals.js';
import {
  getMonthEntry,
  buildShiftPickGroupHtml,
  handleShiftPickSelect,
  hasLocalShiftChange,
  updateShiftFormState,
  clearShiftLocalOverrides,
  submitShiftMonth,
  sendPendingChanges,
  buildShiftChangeConfirmMessage,
} from './shift-ui.js';

function getEntriesForDate(dateStr){
  return collapseTeacherCalendarEntries(
    S.myAssignmentEntries.filter(e=> entryAppliesOnDate(e, dateStr))
  );
}

function groupEntriesBySlot(entries){
  const map = new Map();
  entries.forEach(entry=>{
    const slotId = Number(entry.slot);
    if(!map.has(slotId)) map.set(slotId, []);
    map.get(slotId).push(entry);
  });
  return map;
}

function levelFromGrade(grade){
  if(!grade) return '中学';
  if(grade.startsWith('小')) return '小学';
  if(grade.startsWith('中')) return '中学';
  if(grade.startsWith('高')) return '高校';
  return '中学';
}

function ticketCoversEntry(ticket, entry, dateStr){
  if(entry.day !== ticket.day || Number(entry.slot) !== Number(ticket.slot)) return false;
  if(entry.studentName !== ticket.studentName) return false;
  if(!ticketSubjectMatchesEntry(ticket, entry.subject)) return false;
  if(ticket.oneTimeDate) return entry.oneTimeDate === ticket.oneTimeDate;
  if(entry.oneTimeDate) return entry.oneTimeDate === dateStr;
  return true;
}

function ticketToDisplayEntry(ticket){
  return {
    day: ticket.day,
    slot: ticket.slot,
    studentName: ticket.studentName,
    studentGrade: ticket.studentGrade || '',
    subject: ticket.subject,
    subjects: ticket.subjects?.length ? ticket.subjects : [ticket.subject],
    dualGroupId: ticket.dualGroupId || null,
    isDual: (ticket.subjects?.length || 0) >= 2,
    oneTimeDate: ticket.oneTimeDate || null,
    courseStartDate: ticket.courseStartDate || null,
    approvalStatus: 'pending',
    isPreferredPair: false,
  };
}

function mergeSlotEntriesWithTickets(dateStr, slotId, entries){
  const tickets = getSlotPendingTickets(dateStr, slotId);
  if(tickets.length === 0) return entries;
  const merged = [...entries];
  tickets.forEach(ticket=>{
    if(entries.some(entry=> ticketCoversEntry(ticket, entry, dateStr))) return;
    merged.push(ticketToDisplayEntry(ticket));
  });
  return collapseTeacherCalendarEntries(merged);
}

function buildSubjectTagsHtml(entry){
  const level = levelFromGrade(entry.studentGrade);
  if(entry.subjects?.length >= 2){
    return buildDualSubjectTagsHtml(level, entry.subjects, subjectColor);
  }
  const c = subjectColor(level, entry.subject);
  return `<span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${entry.subject}</span>`;
}

function buildStudentLineHtml(entry, isLast, showCancelInRow, dateStr){
  const approvalState = resolveApprovalState(entry, dateStr);
  const isPending = approvalState === 'pending';
  const ticket = isPending ? findPendingTicket(entry.day, entry.slot, entry.subject, entry.studentName, entry.oneTimeDate, dateStr, entry.studentId) : null;
  if(isPending && !ticket){
    const gradePart = entry.studentGrade ? `（${entry.studentGrade}）` : '';
    return `<div class="mycal-slot-student is-orphan${isLast ? '' : ' has-divider'}">
      ${buildSubjectTagsHtml(entry)}
      <span class="mycal-slot-student-name"><b>${entry.studentName}</b>${gradePart}</span>
      <span class="mycal-orphan-note">教室長の確認待ち</span>
    </div>`;
  }

  const gradePart = entry.studentGrade ? `（${entry.studentGrade}）` : '';
  const assignedBadge = entry.isPreferredPair ? '<span class="pref-pair-assigned-badge">担当生徒</span>' : '';
  const cancelHtml = (approvalState === 'confirmed' && showCancelInRow) ? buildCancelActionHtml(entry, dateStr) : '';
  return `<div class="mycal-slot-student${isPending ? ' is-pending' : ''}${isLast ? '' : ' has-divider'}">
    ${buildSubjectTagsHtml(entry)}
    <span class="mycal-slot-student-name"><b>${entry.studentName}</b>${gradePart}</span>
    ${assignedBadge}
    ${cancelHtml}
  </div>`;
}

function buildCancelActionHtml(entry, dateStr){
  const pendingCancel = findPendingCancellation(entry, dateStr);
  const cancelKey = draftKeyForCancel(entry, dateStr);
  const cancelDraft = S.responseDrafts[cancelKey];
  if(pendingCancel){
    return '<span class="schedule-cancel-note">欠勤申請中</span>';
  }
  if(cancelDraft){
    return `<span class="mycal-slot-status">
      <span class="mycal-draft-label">欠勤申請（下書き）</span>
      <button type="button" class="mycal-undo-btn" data-draft-key="${cancelKey}">取り消す</button>
    </span>`;
  }
  const payload = encodeURIComponent(JSON.stringify({
    day: entry.day, slot: entry.slot, subject: entry.subject,
    studentId: entry.studentId || null,
    studentName: entry.studentName, studentGrade: entry.studentGrade || '',
    oneTimeDate: entry.oneTimeDate || null,
    dateStr,
  }));
  return `<button type="button" class="mycal-cancel-btn schedule-cancel-btn" data-cancel-entry="${payload}">欠勤申請</button>`;
}

function buildPendingHeaderActionsHtml(dateStr, slotId){
  const draft = getSlotDraft(dateStr, slotId);
  const slotKey = draftKeyForSlot(dateStr, slotId);
  if(draft){
    if(draft.action === 'approve'){
      return `<span class="mycal-draft-label">承認（下書き）</span>
        <button type="button" class="mycal-undo-btn" data-draft-key="${slotKey}">取り消す</button>`;
    }
    return `<span class="mycal-draft-label">辞退（下書き）</span>
      <button type="button" class="mycal-undo-btn" data-draft-key="${slotKey}">取り消す</button>`;
  }
  return `<button type="button" class="mycal-approve-btn" data-slot-date="${dateStr}" data-slot-id="${slotId}">承認</button>
    <button type="button" class="mycal-decline-btn" data-slot-date="${dateStr}" data-slot-id="${slotId}">辞退</button>`;
}

function buildConfirmedHeaderActionsHtml(entries, dateStr){
  const confirmedEntries = entries.filter(e=> resolveApprovalState(e, dateStr) === 'confirmed');
  if(confirmedEntries.length === 0) return '';
  const cancelHtml = confirmedEntries.length === 1 ? buildCancelActionHtml(confirmedEntries[0], dateStr) : '';
  return `<span class="mycal-confirmed-pill">確定</span>${cancelHtml}`;
}

function buildSlotHeaderActionsHtml(dateStr, slotId, entries){
  if(getSlotPendingTickets(dateStr, slotId).length > 0){
    return buildPendingHeaderActionsHtml(dateStr, slotId);
  }
  return buildConfirmedHeaderActionsHtml(entries, dateStr);
}

function slotHasLessonContent(dateStr, slotId, entries){
  if(getSlotPendingTickets(dateStr, slotId).length > 0) return true;
  return entries.length > 0;
}

function buildSlotCardHtml(dateStr, slotId, entries){
  const slotDef = SLOTS.find(s=> Number(s.id) === Number(slotId));
  const slotLabel = slotDef ? slotDef.label : `${slotId}講`;
  const yearMonth = dateStr.slice(0, 7);
  const monthEntry = getMonthEntry(yearMonth);

  if(!slotHasLessonContent(dateStr, slotId, entries)){
    const localDirty = hasLocalShiftChange(dateStr, slotId);
    const cls = ['mycal-slot-card', 'is-empty-shift', localDirty ? 'has-local-shift' : ''].filter(Boolean).join(' ');
    return `<div class="${cls}">
      <div class="mycal-slot-head">
        <span class="mycal-slot-label">${slotLabel}</span>
        ${buildShiftPickGroupHtml(dateStr, slotId, monthEntry)}
      </div>
    </div>`;
  }

  const pending = getSlotPendingTickets(dateStr, slotId).length > 0;
  const draft = getSlotDraft(dateStr, slotId);
  const hasConfirmed = entries.some(e=> resolveApprovalState(e, dateStr) === 'confirmed');
  const stateClass = pending ? 'is-waiting' : (hasConfirmed || entries.length > 0 ? 'is-confirmed' : '');
  const cls = ['mycal-slot-card', stateClass, draft ? 'has-draft' : ''].filter(Boolean).join(' ');
  const headerActions = buildSlotHeaderActionsHtml(dateStr, slotId, entries);
  const confirmedCount = entries.filter(e=> resolveApprovalState(e, dateStr) === 'confirmed').length;
  const showCancelInRow = confirmedCount > 1;
  const studentsHtml = entries.map((entry, index)=> buildStudentLineHtml(entry, index === entries.length - 1, showCancelInRow, dateStr)).join('');
  const actionsHtml = headerActions ? `<div class="mycal-slot-head-actions">${headerActions}</div>` : '';
  return `<div class="${cls}">
    <div class="mycal-slot-head">
      <span class="mycal-slot-label">${slotLabel}</span>
      ${actionsHtml}
    </div>
    ${studentsHtml ? `<div class="mycal-slot-students">${studentsHtml}</div>` : ''}
  </div>`;
}

function buildDayHtml(dateStr, dayNum, wd, isToday, dayStatus){
  if(dayStatus.type !== 'open'){
    return `<div class="mycal-day is-closed">
      <div class="mycal-date-label">${S.curMonth + 1}月${dayNum}日（${wd}）${isToday ? '（今日）' : ''}</div>
      <div class="mycal-lesson-row closed"><div class="mycal-lesson-info mycal-closed-label">休校（${dayStatus.label}）</div></div>
    </div>`;
  }

  const entries = getEntriesForDate(dateStr);
  const bySlot = groupEntriesBySlot(entries);
  let cardsHtml = '';
  SLOTS.forEach(slot=>{
    const slotEntries = mergeSlotEntriesWithTickets(dateStr, slot.id, bySlot.get(slot.id) || []);
    cardsHtml += buildSlotCardHtml(dateStr, slot.id, slotEntries);
  });

  return `<div class="mycal-day">
    <div class="mycal-date-label ${isToday ? 'is-today' : ''}">${S.curMonth + 1}月${dayNum}日（${wd}）${isToday ? '（今日）' : ''}</div>
    ${cardsHtml}
  </div>`;
}

function formatLessonDraftDetail(drafts){
  let approve = 0, reject = 0;
  Object.values(drafts).forEach(d=>{
    if(d.action === 'approve') approve++;
    else if(d.action === 'reject') reject++;
  });
  const parts = [];
  if(approve) parts.push(`承認${approve}`);
  if(reject) parts.push(`辞退${reject}`);
  const count = approve + reject;
  if(count === 0) return '';
  return `${count}件（${parts.join('·')}）`;
}

function updateBanner(){
  pruneStaleResponseDrafts();
  const lessonBlock = document.getElementById('submitDockLesson');
  const kvEl = document.getElementById('submitDockLessonKv');
  const noticeWrap = document.getElementById('pendingBannerNotices');
  const draftAllBtn = document.getElementById('draftApproveAllBtn');
  const submitBtn = document.getElementById('submitResponsesBtn');
  const absenceBlock = document.getElementById('submitDockAbsence');
  const absenceBadges = document.getElementById('absenceDockBadges');
  const absenceBtn = document.getElementById('submitAbsenceBtn');

  const unreplied = countUnrepliedPendingSlots();
  const { lesson: lessonDrafts, absence: absenceDrafts } = splitResponseDrafts(S.responseDrafts);
  const lessonDraftCount = Object.keys(lessonDrafts).length;
  const absenceDraftCount = Object.keys(absenceDrafts).length;
  const notices = S.adminCancelledNotices || [];
  const showLesson = unreplied > 0 || lessonDraftCount > 0 || notices.length > 0;

  if(lessonBlock) lessonBlock.style.display = showLesson ? '' : 'none';
  if(absenceBlock) absenceBlock.style.display = absenceDraftCount > 0 ? '' : 'none';

  if(noticeWrap){
    if(notices.length > 0){
      noticeWrap.style.display = '';
      noticeWrap.innerHTML = notices.map(n=> `
        <div class="pending-banner-notice-row">
          <p class="pending-banner-line pending-banner-notice">【お知らせ】教室長が依頼を取り消しました — ${formatAdminCancelledNoticeLine(n)}</p>
          <button type="button" class="ghost pending-notice-dismiss-btn" data-notice-id="${n.id}">確認した</button>
        </div>
      `).join('');
    }else{
      noticeWrap.style.display = 'none';
      noticeWrap.innerHTML = '';
    }
  }

  if(kvEl){
    const rows = [];
    if(unreplied > 0){
      rows.push(`<dt>未対応</dt><dd class="is-alert">${unreplied}コマ</dd>`);
    }
    if(lessonDraftCount > 0){
      rows.push(`<dt>下書き</dt><dd class="is-draft">${formatLessonDraftDetail(lessonDrafts)}</dd>`);
    }
    kvEl.innerHTML = rows.join('');
    kvEl.style.display = rows.length ? '' : 'none';
  }

  if(absenceBadges){
    absenceBadges.innerHTML = absenceDraftCount > 0
      ? '<span class="status-badge change">欠勤申請下書き</span>'
      : '';
  }
  if(absenceBtn){
    absenceBtn.textContent = `欠勤申請を提出する（${absenceDraftCount}件）`;
  }

  if(draftAllBtn){
    draftAllBtn.style.display = unreplied > 0 ? '' : 'none';
    draftAllBtn.textContent = `残り${unreplied}コマをすべて承認`;
  }
  if(submitBtn){
    submitBtn.style.display = lessonDraftCount > 0 ? '' : 'none';
  }
}

function bindCalendarActions(wrap){
  wrap.querySelectorAll('.shift-pick-btn[data-shift-date]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const result = await handleShiftPickSelect(btn.dataset.shiftDate, btn.dataset.shiftSlot, btn.dataset.priority);
      if(result.rerender) renderMyCalendar();
    });
  });
  wrap.querySelectorAll('.mycal-approve-btn[data-slot-date]').forEach(btn=>{
    btn.addEventListener('click', ()=> setDraftForSlot(btn.dataset.slotDate, Number(btn.dataset.slotId), 'approve'));
  });
  wrap.querySelectorAll('.mycal-decline-btn[data-slot-date]').forEach(btn=>{
    btn.addEventListener('click', ()=> setDraftForSlot(btn.dataset.slotDate, Number(btn.dataset.slotId), 'reject'));
  });
  wrap.querySelectorAll('.mycal-cancel-btn[data-cancel-entry]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      try{
        setDraftForCancel(JSON.parse(decodeURIComponent(btn.dataset.cancelEntry)));
      }catch(e){
        console.error('キャンセル下書きエラー:', e);
      }
    });
  });
  wrap.querySelectorAll('.mycal-undo-btn[data-draft-key]').forEach(btn=>{
    btn.addEventListener('click', ()=> clearDraftByKey(btn.dataset.draftKey));
  });
}

function bindNoticeDismiss(){
  document.querySelectorAll('.pending-notice-dismiss-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      btn.disabled = true;
      await markAdminCancelledNoticeRead(btn.dataset.noticeId);
      renderMyCalendar();
    });
  });
}

function renderMyCalendar(){
  const wrap = document.getElementById('myCalWrap');
  if(!wrap) return;
  const titleEl = document.getElementById('calMonthTitle');
  if(titleEl) titleEl.textContent = `${S.curYear}年${S.curMonth + 1}月`;
  updateBanner();

  const total = daysInYearMonth(`${S.curYear}-${pad2(S.curMonth + 1)}`);
  const todayStr = toDateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  let html = '';

  for(let d = 1; d <= total; d++){
    const dateStr = `${S.curYear}-${pad2(S.curMonth + 1)}-${pad2(d)}`;
    const wd = WEEKDAY_JP[new Date(`${dateStr}T00:00:00`).getDay()];
    html += buildDayHtml(dateStr, d, wd, dateStr === todayStr, getDayStatus(dateStr));
  }

  wrap.innerHTML = html;
  bindCalendarActions(wrap);
  bindNoticeDismiss();
  updateShiftFormState();
}

function bindCalendarNav(){
  if(bindCalendarNav._bound) return;
  bindCalendarNav._bound = true;
  document.getElementById('calPrevBtn')?.addEventListener('click', ()=>{
    clearShiftLocalOverrides();
    S.curMonth--; if(S.curMonth < 0){ S.curMonth = 11; S.curYear--; }
    renderMyCalendar();
  });
  document.getElementById('calNextBtn')?.addEventListener('click', ()=>{
    clearShiftLocalOverrides();
    S.curMonth++; if(S.curMonth > 11){ S.curMonth = 0; S.curYear++; }
    renderMyCalendar();
  });
  document.getElementById('calTodayBtn')?.addEventListener('click', ()=>{
    clearShiftLocalOverrides();
    const t = new Date(); S.curYear = t.getFullYear(); S.curMonth = t.getMonth();
    renderMyCalendar();
  });
}

bindCalendarNav();

function setMyCalHelpOpen(open){
  const btn = document.getElementById('myCalHelpBtn');
  if(!btn) return;
  btn.classList.toggle('is-open', open);
  btn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function bindMyCalHelpTip(){
  if(bindMyCalHelpTip._bound) return;
  bindMyCalHelpTip._bound = true;
  document.addEventListener('click', (e)=>{
    const btn = document.getElementById('myCalHelpBtn');
    if(!btn) return;
    const onPanel = !!(e.target.closest && e.target.closest('#myCalHelpText'));
    const onBtn = btn.contains(e.target);
    if(onBtn && !onPanel){
      setMyCalHelpOpen(!btn.classList.contains('is-open'));
      return;
    }
    if(!onBtn) setMyCalHelpOpen(false);
  });
  document.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape') setMyCalHelpOpen(false);
  });
}
bindMyCalHelpTip();

function bindShiftFormActions(){
  if(bindShiftFormActions._bound) return;
  bindShiftFormActions._bound = true;
  document.getElementById('submitShiftBtn')?.addEventListener('click', async ()=>{
    await submitShiftMonth();
    renderMyCalendar();
  });
  document.getElementById('sendRequestBtn')?.addEventListener('click', ()=>{
    const sendBtn = document.getElementById('sendRequestBtn');
    const messageParts = buildShiftChangeConfirmMessage();
    if(!sendBtn || !messageParts) return;
    mountInlineConfirm(document.getElementById('submitDock'), sendBtn, {
      messageParts,
      confirmLabel: '提出する',
      variant: 'primary',
      mountSelector: '.submit-dock-block.is-shift',
      onConfirm: async ()=>{
        await sendPendingChanges();
        renderMyCalendar();
        return { ok: true };
      },
    });
  });
}
bindShiftFormActions();

export { renderMyCalendar, updateBanner };
