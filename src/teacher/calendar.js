import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { collapseTeacherCalendarEntries, ticketSubjectMatchesEntry, buildDualSubjectTagsHtml } from '../admin/dual-subject.js';
import { subjectColor } from '../admin/schedule-core.js';
import { pad2, daysInYearMonth, toDateStr } from '../shared/date-utils.js';
import { S } from './state.js';
import { getDayStatus } from './day-status.js';
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
  summarizeDrafts,
  pruneStaleResponseDrafts,
  getSlotPendingTickets,
} from './approvals.js';

function getEntriesForDate(dateStr){
  const wd = WEEKDAY_JP[new Date(`${dateStr}T00:00:00`).getDay()];
  return collapseTeacherCalendarEntries(
    S.myAssignmentEntries.filter(e=> (e.oneTimeDate ? e.oneTimeDate === dateStr : e.day === wd))
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

function buildStudentLineHtml(entry, isLast){
  const approvalState = resolveApprovalState(entry);
  const isPending = approvalState === 'pending';
  const ticket = isPending ? findPendingTicket(entry.day, entry.slot, entry.subject, entry.studentName, entry.oneTimeDate) : null;
  if(isPending && !ticket){
    const gradePart = entry.studentGrade ? `（${entry.studentGrade}）` : '';
    return `<div class="mycal-slot-student is-orphan${isLast ? '' : ' has-divider'}">
      ${buildSubjectTagsHtml(entry)}
      <span class="mycal-slot-student-name"><b>${entry.studentName}</b>${gradePart}</span>
      <span class="mycal-orphan-note">反映待ち</span>
    </div>`;
  }

  const gradePart = entry.studentGrade ? `（${entry.studentGrade}）` : '';
  const assignedBadge = entry.isPreferredPair ? '<span class="pref-pair-assigned-badge">担当生徒</span>' : '';
  return `<div class="mycal-slot-student${isPending ? ' is-pending' : ''}${isLast ? '' : ' has-divider'}">
    ${buildSubjectTagsHtml(entry)}
    <span class="mycal-slot-student-name"><b>${entry.studentName}</b>${gradePart}</span>
    ${assignedBadge}
  </div>`;
}

function buildCancelActionHtml(entry){
  const pendingCancel = findPendingCancellation(entry);
  const cancelKey = draftKeyForCancel(entry);
  const cancelDraft = S.responseDrafts[cancelKey];
  if(pendingCancel){
    return '<span class="schedule-cancel-note">キャンセル待ち</span>';
  }
  if(cancelDraft){
    return `<button type="button" class="mycal-undo-btn" data-draft-key="${cancelKey}">取り消す</button>`;
  }
  const payload = encodeURIComponent(JSON.stringify({
    day: entry.day, slot: entry.slot, subject: entry.subject,
    studentName: entry.studentName, studentGrade: entry.studentGrade || '',
    oneTimeDate: entry.oneTimeDate || null,
  }));
  return `<button type="button" class="mycal-cancel-btn schedule-cancel-btn" data-cancel-entry="${payload}">キャンセルを依頼</button>`;
}

function buildPendingHeaderActionsHtml(dateStr, slotId){
  const draft = getSlotDraft(dateStr, slotId);
  const slotKey = draftKeyForSlot(dateStr, slotId);
  if(draft){
    if(draft.action === 'approve'){
      return `<span class="mycal-draft-label">承認（選択済）</span>
        <button type="button" class="mycal-undo-btn" data-draft-key="${slotKey}">取り消す</button>`;
    }
    return `<span class="mycal-draft-label">辞退（選択済）</span>
      <button type="button" class="mycal-undo-btn" data-draft-key="${slotKey}">取り消す</button>`;
  }
  return `<button type="button" class="mycal-approve-btn" data-slot-date="${dateStr}" data-slot-id="${slotId}">承認</button>
    <button type="button" class="mycal-decline-btn" data-slot-date="${dateStr}" data-slot-id="${slotId}">辞退</button>`;
}

function buildConfirmedHeaderActionsHtml(entries){
  const confirmedEntries = entries.filter(e=> resolveApprovalState(e) === 'confirmed');
  if(confirmedEntries.length === 0) return '';
  const cancelHtml = confirmedEntries.map(buildCancelActionHtml).join('');
  return `<span class="mycal-confirmed-pill">確定</span>${cancelHtml}`;
}

function buildSlotHeaderActionsHtml(dateStr, slotId, entries){
  if(getSlotPendingTickets(dateStr, slotId).length > 0){
    return buildPendingHeaderActionsHtml(dateStr, slotId);
  }
  return buildConfirmedHeaderActionsHtml(entries);
}

function buildSlotCardHtml(dateStr, slotId, entries){
  const slotDef = SLOTS.find(s=> Number(s.id) === Number(slotId));
  const slotLabel = slotDef ? slotDef.label : `${slotId}講`;
  const pending = getSlotPendingTickets(dateStr, slotId).length > 0;
  const draft = getSlotDraft(dateStr, slotId);
  const hasConfirmed = entries.some(e=> resolveApprovalState(e) === 'confirmed');
  const stateClass = pending ? 'is-waiting' : (hasConfirmed || entries.length > 0 ? 'is-confirmed' : '');
  const cls = ['mycal-slot-card', stateClass, draft ? 'has-draft' : ''].filter(Boolean).join(' ');
  const headerActions = buildSlotHeaderActionsHtml(dateStr, slotId, entries);
  const studentsHtml = entries.map((entry, index)=> buildStudentLineHtml(entry, index === entries.length - 1)).join('');
  return `<div class="${cls}">
    <div class="mycal-slot-head">
      <span class="mycal-slot-label">${slotLabel}</span>
      <div class="mycal-slot-head-actions">${headerActions}</div>
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
    if(slotEntries.length === 0 && getSlotPendingTickets(dateStr, slot.id).length === 0) return;
    cardsHtml += buildSlotCardHtml(dateStr, slot.id, slotEntries);
  });

  if(!cardsHtml){
    cardsHtml = `<div class="mycal-lesson-row empty"><div class="mycal-lesson-info mycal-empty-label">確定授業なし</div></div>`;
  }

  return `<div class="mycal-day">
    <div class="mycal-date-label ${isToday ? 'is-today' : ''}">${S.curMonth + 1}月${dayNum}日（${wd}）${isToday ? '（今日）' : ''}</div>
    ${cardsHtml}
  </div>`;
}

function updateBanner(){
  pruneStaleResponseDrafts();
  const bannerCard = document.getElementById('pendingBannerCard');
  const requestLine = document.getElementById('pendingBannerRequest');
  const draftLine = document.getElementById('pendingBannerDraft');
  const noticeWrap = document.getElementById('pendingBannerNotices');
  const draftAllBtn = document.getElementById('draftApproveAllBtn');
  const submitBtn = document.getElementById('submitResponsesBtn');

  const unreplied = countUnrepliedPendingSlots();
  const draftCount = Object.keys(S.responseDrafts).length;
  const notices = S.adminCancelledNotices || [];
  const show = unreplied > 0 || draftCount > 0 || notices.length > 0;

  if(!bannerCard) return;
  bannerCard.style.display = show ? '' : 'none';

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

  if(requestLine){
    if(unreplied > 0){
      requestLine.style.display = '';
      requestLine.textContent = `【返事が必要】あと${unreplied}コマ、授業依頼への返事が必要です`;
    }else{
      requestLine.style.display = 'none';
      requestLine.textContent = '';
    }
  }

  if(draftLine){
    if(draftCount > 0){
      draftLine.style.display = '';
      const summary = summarizeDrafts(S.responseDrafts);
      draftLine.textContent = `【教室長に送る】${draftCount}件、まだ送っていません${summary ? `（${summary}）` : ''}`;
    }else{
      draftLine.style.display = 'none';
      draftLine.textContent = '';
    }
  }

  if(draftAllBtn){
    draftAllBtn.style.display = unreplied > 0 ? '' : 'none';
    draftAllBtn.textContent = `残り${unreplied}コマをすべて承認`;
  }
  if(submitBtn){
    submitBtn.style.display = draftCount > 0 ? '' : 'none';
    submitBtn.textContent = `${draftCount}件を教室長に送信する`;
  }
}

function bindCalendarActions(wrap){
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
}

function bindCalendarNav(){
  if(bindCalendarNav._bound) return;
  bindCalendarNav._bound = true;
  document.getElementById('calPrevBtn')?.addEventListener('click', ()=>{
    S.curMonth--; if(S.curMonth < 0){ S.curMonth = 11; S.curYear--; }
    renderMyCalendar();
    syncShiftMonthTitle();
  });
  document.getElementById('calNextBtn')?.addEventListener('click', ()=>{
    S.curMonth++; if(S.curMonth > 11){ S.curMonth = 0; S.curYear++; }
    renderMyCalendar();
    syncShiftMonthTitle();
  });
  document.getElementById('calTodayBtn')?.addEventListener('click', ()=>{
    const t = new Date(); S.curYear = t.getFullYear(); S.curMonth = t.getMonth();
    renderMyCalendar();
    syncShiftMonthTitle();
  });
}

function syncShiftMonthTitle(){
  const el = document.getElementById('monthTitle');
  if(el) el.textContent = `${S.curYear}年${S.curMonth + 1}月`;
}

bindCalendarNav();

export { renderMyCalendar, updateBanner };
