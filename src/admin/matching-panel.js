import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { daysInYearMonth, getTodayStr, pad2 } from '../shared/date-utils.js';
import { S } from './state.js';
import { getStudentDateRows } from './absences.js';
import { getDayStatus, renderCalendar } from './calendar.js';
import { refreshCalFilterOptions, clearCalFilter, setCalFilterStudent } from './filter-ui.js';
import { resolveFilterStudent } from './cal-filter.js';
import { expandShortageBar, fillStudentFormForEdit, renderMatching, renderShortageDashboard, renderStudentList } from './matching.js';
import { renderTeacherList } from './teachers.js';
import { switchCalMode, switchView, renderCalendarWeek } from './finance-ui.js';
import { getDateSlotState, gradeLabel, subjectColor, teacherHonorific } from './schedule-core.js';
import { scheduleSave, scheduleSyncTeacherAssignments } from './students-persistence.js';
import { bindDayDetailEvents, getDayDetailTitle, renderDayDetailPanel } from './day-detail-panel.js';
import { buildAbsentTeacherFollowupHtml, bindAbsentTeacherFollowup } from './teacher-absence-panel.js';
import {
  addPreferredPair,
  cancelAssignment,
  cancelDualAssignment,
  confirmAssignment,
  confirmDualAssignment,
  countRoomSlot,
  countRoomSlotOnDate,
  countTeacherSlot,
  countTeacherSlotOnDate,
  findEffectiveAssignment,
  isPreferredPair,
  removePreferredPairFor,
  withdrawPendingAssignment,
} from './teacher-schedule-tab.js';
import { buildDualMatchCandidatesHtml, buildMatchCandidatesHtml } from './match-candidates-html.js';
import { buildDraftSlotCardHtml, buildPrefPairActionHtmlForTeacher, buildWaitingSlotCardHtml, buildMpSlotSubjectRow } from './match-candidate-ui.js';
import { buildDualSubjectTagsHtml, findDualPairForStudent } from './dual-subject.js';
import { mountWithdrawConfirm } from './withdraw-pending-ui.js';
import { mountInlineConfirm, showInlineNotice } from '../shared/inline-confirm.js';

function refreshPrefPairViews(){
  renderStudentList();
  renderTeacherList();
}

function hideCalDetailCard(){
  const card = document.getElementById('calDetailCard');
  if(card){
    card.hidden = true;
    card.setAttribute('aria-hidden', 'true');
  }
}

function updateMatchingReturnBar(){
  const bar = document.getElementById('matchingReturnBar');
  const btn = document.getElementById('matchingReturnToStudentBtn');
  if(!bar || !btn) return;
  const id = S.matchingReturnToStudentId;
  if(!id || !S.matchingPanelOpen){
    bar.hidden = true;
    return;
  }
  const student = S.students.find(s=> s.id === id);
  if(!student){
    S.matchingReturnToStudentId = null;
    bar.hidden = true;
    return;
  }
  bar.hidden = false;
  btn.textContent = `← ${student.name}さんの登録に戻る`;
}

function returnToStudentRegistration(){
  const id = S.matchingReturnToStudentId;
  S.matchingReturnToStudentId = null;
  closeMatchingPanel();
  const student = id ? S.students.find(s=> s.id === id) : null;
  if(student){
    fillStudentFormForEdit(student);
    return;
  }
  switchView('student');
}

function updateDrawerHeader(dateStr){
  const titleEl = document.getElementById('matchingDrawerTitle');
  if(!titleEl) return;
  if(S.calendarDrawerView === 'matching-menu'){
    titleEl.textContent = 'コマを組む';
    return;
  }
  if(S.calendarDrawerView === 'matching-student' && S.matchingPanelStudentId){
    const student = S.students.find(s=> s.id === S.matchingPanelStudentId);
    titleEl.textContent = student ? `${student.name}さん — 月間一覧` : '月間一覧';
    return;
  }
  if(S.calendarDrawerView === 'day' && dateStr){
    const { title, subtitle } = getDayDetailTitle(dateStr);
    titleEl.textContent = subtitle ? `${title} — ${subtitle}` : title;
    return;
  }
  titleEl.textContent = 'カレンダー';
}

function renderDayDetailInDrawer(dateStr){
  const body = document.getElementById('matchingPanelBody');
  if(!body || !dateStr) return;
  body.scrollTop = 0;
  body.innerHTML = `<div class="day-detail-post-assign-banners">${buildPostAssignBannersHtml()}</div><div id="dayDetailPanelRoot"></div>`;
  const root = body.querySelector('#dayDetailPanelRoot');
  renderDayDetailPanel(root, dateStr);
  bindDayDetailEvents(root, dateStr, refreshedDateStr=>{
    renderCalendar();
    if(S.calMode === 'week') renderCalendarWeek();
    renderDayDetailInDrawer(refreshedDateStr);
    updateDrawerHeader(refreshedDateStr);
  });
  bindConfirmButtons(body);
  bindChangeTeacherButtons(body);
  bindPrefPairButtons(body, ()=>{
    renderCalendar();
    if(S.calMode === 'week') renderCalendarWeek();
    renderDayDetailInDrawer(dateStr);
    updateDrawerHeader(dateStr);
  });
  bindPrefPairOffer(body);
  bindFutureWeeksOffer(body);
}

function renderDrawerContent(){
  if(!S.matchingPanelOpen) return;
  if(S.calendarDrawerView === 'day'){
    renderDayDetailInDrawer(S.calSelectedDate);
    updateDrawerHeader(S.calSelectedDate);
    return;
  }
  if(S.calendarDrawerView === 'matching-student' && S.matchingPanelStudentId){
    renderStudentPeriodSlots(S.matchingPanelStudentId, S.calSelectedDate);
    updateDrawerHeader();
    return;
  }
  closeMatchingPanel();
}

function showDayDetail(dateStr){
  if(!dateStr) return;
  S.calSelectedDate = dateStr;
  S.calendarDrawerView = 'day';
  S.matchingPanelSlot = null;
  S.matchingPanelOpen = true;
  applyPanelLayout();
  hideCalDetailCard();
  renderDrawerContent();
  renderMatchingDesiredBar();
}

function showMatchingStudentView(studentId){
  showMatchingStudentAtDate(studentId, null);
}

function showMatchingStudentAtDate(studentId, dateStr){
  if(!studentId) return;
  S.matchingPanelStudentId = studentId;
  S.matchingPanelSlot = null;
  S.calendarDrawerView = 'matching-student';
  setCalFilterStudent(studentId);
  S.matchingPanelOpen = true;
  switchView('calendar');
  switchCalMode('month');

  if(dateStr){
    syncCalMonthToDate(dateStr);
    S.calSelectedDate = dateStr;
  }else{
    const firstPending = findFirstPendingDate(studentId);
    if(firstPending){
      syncCalMonthToDate(firstPending);
      S.calSelectedDate = firstPending;
    }else{
      const fallback = findFirstOpenDateInMonth();
      if(fallback) S.calSelectedDate = fallback;
    }
  }

  refreshCalFilterOptions();
  applyPanelLayout();
  hideCalDetailCard();
  renderMatchingDesiredBar();
  renderCalendar();
  scrollCalendarIntoView();
  renderDrawerContent();
}

function getActiveYearMonth(){
  if(S.referenceYearMonth) return S.referenceYearMonth;
  return `${S.calYear}-${pad2(S.calMonth + 1)}`;
}

function syncCalMonthToDate(dateStr){
  if(!dateStr) return;
  const d = new Date(dateStr + 'T00:00:00');
  S.calYear = d.getFullYear();
  S.calMonth = d.getMonth();
  S.referenceYearMonth = dateStr.slice(0, 7);
}

function rowIsPendingMatch(r){
  return !r.existing && !r.absence && !r.isMakeupTarget;
}

function findFirstPendingDate(studentId){
  const student = S.students.find(s=> s.id === studentId);
  if(!student) return null;
  const ym = getActiveYearMonth();
  const total = daysInYearMonth(ym);
  const today = getTodayStr();

  const isPendingDay = (dateStr)=>{
    if(getDayStatus(dateStr).type !== 'open') return false;
    return getStudentDateRows(student, dateStr).some(rowIsPendingMatch);
  };

  for(let d = 1; d <= total; d++){
    const dateStr = `${ym}-${pad2(d)}`;
    if(dateStr < today) continue;
    if(isPendingDay(dateStr)) return dateStr;
  }
  for(let d = 1; d <= total; d++){
    const dateStr = `${ym}-${pad2(d)}`;
    if(isPendingDay(dateStr)) return dateStr;
  }
  return null;
}

function findFirstOpenDateInMonth(){
  const ym = getActiveYearMonth();
  const total = daysInYearMonth(ym);
  for(let d = 1; d <= total; d++){
    const dateStr = `${ym}-${pad2(d)}`;
    if(getDayStatus(dateStr).type === 'open') return dateStr;
  }
  return null;
}

let matchingPanelFlashMsg = null;
let matchingPanelFutureOffer = null;
let matchingPanelPrefPairOffer = null;
let matchingPanelRenderedPeriodKey = '';

function getPeriodKey(){
  return `${getActiveYearMonth()}-${S.calMode}-${S.calWeekAnchor || ''}-${S.matchingPanelStudentId || ''}`;
}

function getPeriodDateStrings(){
  if(S.calMode === 'week' && S.calWeekAnchor){
    const monday = new Date(S.calWeekAnchor + 'T00:00:00');
    const dates = [];
    for(let i = 0; i < 6; i++){
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      dates.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`);
    }
    return dates;
  }
  const ym = getActiveYearMonth();
  const total = daysInYearMonth(ym);
  const dates = [];
  for(let d = 1; d <= total; d++){
    dates.push(`${ym}-${pad2(d)}`);
  }
  return dates;
}

function scrollToDrawerDate(dateStr){
  if(!dateStr) return;
  const run = ()=>{
    const section = document.getElementById(`mp-day-${dateStr}`);
    const body = document.getElementById('matchingPanelBody');
    if(!section || !body) return false;
    const top = section.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 8;
    body.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    return true;
  };
  if(run()) return;
  requestAnimationFrame(()=>{
    if(!run()) setTimeout(run, 60);
  });
}

function highlightSelectedDaySection(dateStr){
  document.querySelectorAll('.matching-panel-day-section').forEach(el=>{
    el.classList.toggle('is-selected', el.dataset.date === dateStr);
  });
}

function shouldOfferPrefPair(studentId, courseId, teacherId){
  if(isPreferredPair(studentId, courseId, teacherId)) return false;
  const existing = S.preferredPairs.find(p=> p.studentId === studentId && p.courseId === courseId);
  if(existing) return false;
  return true;
}

function buildPrefPairFollowUpHtml(offer){
  if(!offer || !shouldOfferPrefPair(offer.studentId, offer.courseId, offer.teacherId)) return '';
  return `<div class="matching-panel-flash-followup" id="mpPrefPairOffer">
    <span class="matching-panel-flash-followup-text">${offer.teacherName}先生を、この生徒の${offer.subject}の担当生徒にしますか？</span>
    <div class="matching-panel-flash-followup-actions">
      <button type="button" class="ghost matching-panel-flash-btn" id="mpSetPrefPairBtn">担当生徒にする</button>
      <button type="button" class="matching-panel-flash-dismiss" id="mpDismissPrefPairBtn">あとで</button>
    </div>
  </div>`;
}

function buildFutureWeeksFollowUpHtml(offer){
  if(!offer) return '';
  const slotDef = SLOTS.find(s=> s.id === offer.slot);
  const monthText = offer.monthLabels.length ? offer.monthLabels.join('・') : '対象月なし';
  return `<div class="matching-panel-flash-followup" id="mpFutureOffer">
    <span class="matching-panel-flash-followup-text">この講師は、${monthText}の${offer.day}曜${slotDef?.label || ''}に、あと<strong>${offer.dateCount}回</strong>担当できます。</span>
    <div class="matching-panel-flash-followup-actions">
      <button type="button" class="ghost matching-panel-flash-btn" id="mpApplyFutureBtn">翌週以降も同じ講師にする</button>
      <button type="button" class="matching-panel-flash-dismiss" id="mpDismissFutureBtn">閉じる</button>
    </div>
  </div>`;
}

function buildPostAssignBannersHtml(){
  const prefOffer = matchingPanelPrefPairOffer &&
    shouldOfferPrefPair(matchingPanelPrefPairOffer.studentId, matchingPanelPrefPairOffer.courseId, matchingPanelPrefPairOffer.teacherId)
    ? matchingPanelPrefPairOffer
    : null;
  const followUpHtml = `${buildPrefPairFollowUpHtml(prefOffer)}${buildFutureWeeksFollowUpHtml(matchingPanelFutureOffer)}`;
  if(matchingPanelFlashMsg){
    return `<div class="matching-panel-result-msg ok">
      <div class="matching-panel-flash-main">${matchingPanelFlashMsg}</div>
      ${followUpHtml}
    </div>`;
  }
  if(followUpHtml){
    return `<div class="matching-panel-result-msg ok">${followUpHtml}</div>`;
  }
  return '';
}

function bindFutureWeeksOffer(root){
  root.querySelector('#mpApplyFutureBtn')?.addEventListener('click', ()=>{
    const offer = matchingPanelFutureOffer;
    if(!offer) return;
    const result = confirmAssignment(offer.studentId, offer.courseId, offer.subject, offer.day, offer.slot, offer.teacherId, 'manual', { recurring: true, dateStr: offer.dateStr });
    if(!result.ok){
      showInlineNotice(root, result.msg, { variant: 'warn' });
      return;
    }
    scheduleSave();
    const slotDef = SLOTS.find(s=> s.id === offer.slot);
    const monthText = offer.monthLabels.length ? offer.monthLabels.join('・') : '対象月なし';
    matchingPanelFlashMsg = `✓ ${offer.day}曜${slotDef?.label || ''}は、${monthText}の提出済みシフトがある週すべてで${offer.teacherName}先生に設定しました。`;
    matchingPanelFutureOffer = null;
    afterMatchingChange(offer.dateStr);
  });
  root.querySelector('#mpDismissFutureBtn')?.addEventListener('click', ()=>{
    matchingPanelFutureOffer = null;
    refreshPostAssignView();
  });
}

function bindPrefPairOffer(root){
  root.querySelector('#mpSetPrefPairBtn')?.addEventListener('click', ()=>{
    const offer = matchingPanelPrefPairOffer;
    if(!offer) return;
    addPreferredPair(offer.studentId, offer.courseId, offer.teacherId);
    scheduleSave();
    scheduleSyncTeacherAssignments();
    refreshPrefPairViews();
    matchingPanelFlashMsg = `✓ ${offer.teacherName}先生を担当生徒にしました。`;
    matchingPanelPrefPairOffer = null;
    afterMatchingChange(offer.dateStr);
  });
  root.querySelector('#mpDismissPrefPairBtn')?.addEventListener('click', ()=>{
    matchingPanelPrefPairOffer = null;
    refreshPostAssignView();
  });
}

function refreshPostAssignView(){
  if(S.calendarDrawerView === 'day' && S.calSelectedDate){
    renderDayDetailInDrawer(S.calSelectedDate);
    updateDrawerHeader(S.calSelectedDate);
  }else if(S.calendarDrawerView === 'matching-student' && S.matchingPanelStudentId){
    renderStudentPeriodSlots(S.matchingPanelStudentId, S.calSelectedDate);
    updateDrawerHeader();
  }
}

function bindBackToMenu(root){
  root.querySelector('#mpBackToMenu')?.addEventListener('click', ()=>{
    matchingPanelFlashMsg = null;
    matchingPanelFutureOffer = null;
    matchingPanelPrefPairOffer = null;
    matchingPanelRenderedPeriodKey = '';
    closeMatchingPanel();
  });
}

function buildCandidatesHtml(student, r, weekday, dateStr){
  if(r.dualPair){
    return buildDualMatchCandidatesHtml(student, r.dualPair, weekday, r.slot.id, dateStr, {
      btnClass: 'confirm-btn mp-confirm-btn',
      showConfirm: true,
    });
  }
  return buildMatchCandidatesHtml(student, r.course.id, r.course.subject, weekday, r.slot.id, dateStr, {
    btnClass: 'confirm-btn mp-confirm-btn',
    showConfirm: true,
  });
}

function buildRowSubjectTagHtml(student, r){
  if(r.dualPair && r.courses?.length === 2){
    return buildDualSubjectTagsHtml(student.level, r.courses.map(c=> c.subject), subjectColor);
  }
  const c = subjectColor(student.level, r.course.subject);
  return `<span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span>`;
}

function cancelRowDraftOrAssignment(btn){
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(btn.dataset.date || '') ? btn.dataset.date : null;
  if(btn.dataset.dual === '1'){
    const student = S.students.find(s=> s.id === btn.dataset.student);
    const dualPair = findDualPairForStudent(student, btn.dataset.day, Number(btn.dataset.slot));
    if(dualPair) cancelDualAssignment(btn.dataset.student, dualPair, btn.dataset.day, Number(btn.dataset.slot), dateStr);
    return;
  }
  cancelAssignment(btn.dataset.student, btn.dataset.course, btn.dataset.day, Number(btn.dataset.slot), dateStr);
}

function buildAssignmentFlashMessage({slotLabel, subject, teacherName, draft, pending}){
  const detail = `${slotLabel || ''}（${subject}）`;
  if(draft){
    return `✓ ${detail}を${teacherName}先生で下書き保存しました。「講師にスケジュールを送信」で依頼できます。`;
  }
  if(pending){
    return `✓ ${detail}を${teacherName}先生に依頼しました（承認待ち）。`;
  }
  return `✓ ${detail}を${teacherName}先生で確定しました。`;
}

function bindPrefPairButtons(root, onChanged){
  root.querySelectorAll('.pref-pair-set-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      addPreferredPair(btn.dataset.student, btn.dataset.course, btn.dataset.teacher);
      scheduleSave();
      scheduleSyncTeacherAssignments();
      refreshPrefPairViews();
      renderMatching();
      onChanged?.();
    });
  });
  root.querySelectorAll('.pref-pair-unset-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      removePreferredPairFor(btn.dataset.student, btn.dataset.course, btn.dataset.teacher);
      scheduleSave();
      scheduleSyncTeacherAssignments();
      refreshPrefPairViews();
      renderMatching();
      onChanged?.();
    });
  });
}

function resolvePendingTeacherName(btn, dateStr){
  const ym = dateStr ? dateStr.slice(0, 7) : getActiveYearMonth();
  const eff = findEffectiveAssignment(
    btn.dataset.student,
    btn.dataset.course,
    btn.dataset.day,
    Number(btn.dataset.slot),
    ym,
    btn.dataset.date || dateStr || null,
  );
  const teacher = S.teachers.find(t=> t.id === eff?.entry?.teacherId);
  return teacher?.name || '';
}

function bindChangeTeacherButtons(root){
  root.querySelectorAll('.cancel-draft-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      cancelRowDraftOrAssignment(btn);
      scheduleSave();
      matchingPanelFlashMsg = '下書きを解除しました。別の講師を選んでください。';
      afterMatchingChange(btn.dataset.date || null);
    });
  });
  root.querySelectorAll('.mp-change-teacher-btn:not(.cancel-draft-btn)').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      mountWithdrawConfirm(root, btn, {
        teacherName: resolvePendingTeacherName(btn, btn.dataset.date || null),
        onConfirm: async ()=>{
          const result = await withdrawPendingAssignment(
            btn.dataset.student,
            btn.dataset.course,
            btn.dataset.day,
            Number(btn.dataset.slot),
            btn.dataset.date || null,
          );
          if(!result.ok) return result;
          matchingPanelFlashMsg = '依頼を取り消しました。別の講師を選んでください。';
          afterMatchingChange(btn.dataset.date || null);
          return result;
        },
      });
    });
  });
}

function bindConfirmButtons(root){
  root.querySelectorAll('.mp-confirm-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const teacher = S.teachers.find(t=> t.id === btn.dataset.teacher);
      let result;
      if(btn.dataset.dual === '1'){
        const student = S.students.find(s=> s.id === btn.dataset.student);
        const dualPair = findDualPairForStudent(student, btn.dataset.day, Number(btn.dataset.slot));
        if(!dualPair){
          showInlineNotice(root, '2教科の登録が見つかりません。', { variant: 'warn' });
          return;
        }
        result = confirmDualAssignment(
          btn.dataset.student,
          dualPair,
          btn.dataset.day,
          Number(btn.dataset.slot),
          btn.dataset.teacher,
          'manual',
          { dateStr: btn.dataset.date || null },
        );
      }else{
        result = confirmAssignment(
          btn.dataset.student,
          btn.dataset.course,
          btn.dataset.subject,
          btn.dataset.day,
          Number(btn.dataset.slot),
          btn.dataset.teacher,
          'manual',
          { dateStr: btn.dataset.date || null },
        );
      }
      if(!result.ok){
        showInlineNotice(root, result.msg, { variant: 'warn' });
        return;
      }
      scheduleSave();
      const slotDef = SLOTS.find(s=> s.id === Number(btn.dataset.slot));
      const subjectLabel = result.subjects?.join('・') || btn.dataset.subject;
      const ctx = {
        studentId: btn.dataset.student,
        courseId: btn.dataset.course,
        subject: subjectLabel,
        day: btn.dataset.day,
        slot: Number(btn.dataset.slot),
        teacherId: btn.dataset.teacher,
        dateStr: btn.dataset.date,
        teacherName: teacher?.name || '',
      };
      matchingPanelFlashMsg = buildAssignmentFlashMessage({
        slotLabel: slotDef?.label || '',
        subject: subjectLabel,
        teacherName: ctx.teacherName,
        draft: result.draft,
        pending: result.pending,
      });
      const future = countFutureWeeksForTeacher(ctx.teacherId, ctx.day, ctx.slot, ctx.dateStr);
      matchingPanelFutureOffer = future.dateCount > 0 ? { ...ctx, ...future } : null;
      matchingPanelPrefPairOffer = shouldOfferPrefPair(ctx.studentId, ctx.courseId, ctx.teacherId)
        ? { ...ctx }
        : null;
      afterMatchingChange(ctx.dateStr);
    });
  });
}

function countFutureWeeksForTeacher(teacherId, day, slot, fromDateStr){
  const startYm = fromDateStr.slice(0, 7);
  const months = [...new Set(S.teacherSchedules
    .filter(s=> s.teacherId === teacherId && s.status === 'submitted' && s.yearMonth >= startYm)
    .map(s=> s.yearMonth))].sort();

  let dateCount = 0;
  const monthLabels = [];
  months.forEach(ym=>{
    let monthHasDate = false;
    const total = daysInYearMonth(ym);
    for(let d = 1; d <= total; d++){
      const dateStr = `${ym}-${pad2(d)}`;
      if(dateStr <= fromDateStr) continue;
      const wd = WEEKDAY_JP[new Date(dateStr + 'T00:00:00').getDay()];
      if(wd !== day) continue;
      if(getDayStatus(dateStr).type !== 'open') continue;
      if(getDateSlotState(teacherId, dateStr, slot) === 'none') continue;
      dateCount++;
      monthHasDate = true;
    }
    if(monthHasDate) monthLabels.push(`${Number(ym.slice(5))}月`);
  });
  return { dateCount, monthLabels };
}

function buildMatchingSlotCard(r, student, dateStr, weekday){
  const subjectTag = buildRowSubjectTagHtml(student, r);
  const detailYearMonth = dateStr.slice(0, 7);
  const roomUsed = countRoomSlotOnDate(dateStr, r.slot.id, null);
  const isDual = !!r.dualPair;

  if(r.isMakeupTarget){
    const teacher = S.teachers.find(t=> t.id === r.absence.makeup.teacherId);
    const waiting = r.isPending;
    return `<div class="match-slot mp-slot-readonly">
      <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
      <div class="confirmed-box makeup-box">
        <span class="cb-label makeup-label">${waiting ? '振替（承認待ち）' : '振替授業'}</span>
        ${subjectTag}
        <span class="cb-teacher">講師：${teacherHonorific(teacher)}</span>
      </div>
    </div>`;
  }

  if(r.absence){
    return `<div class="match-slot mp-slot-readonly">
      <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
      <div class="absence-box">
        <span class="cb-label absence-label">欠席</span>
        ${subjectTag}
        <span class="mp-slot-note">欠席・振替の操作はマッチング終了後、日付詳細から行えます</span>
      </div>
    </div>`;
  }

  if(r.existing){
    const teacher = S.teachers.find(t=> t.id === r.existing.teacherId);
    const autoBadge = r.existing.source === 'auto' ? '<span class="auto-badge">自動</span>' : '';
    if(r.isDraft){
      return buildDraftSlotCardHtml({
        slotLabel: r.slot.label,
        slotTime: r.slot.time,
        roomUsed,
        roomCapacity: S.roomCapacity,
        subjectTagHtml: subjectTag,
        teacherName: teacher?.name || '不明',
        studentId: student.id,
        courseId: r.course.id,
        weekday,
        slotId: r.slot.id,
        dateStr,
        autoBadge,
        dual: isDual,
      });
    }
    if(r.isPending){
      return buildWaitingSlotCardHtml({
        slotLabel: r.slot.label,
        slotTime: r.slot.time,
        roomUsed,
        roomCapacity: S.roomCapacity,
        subjectTagHtml: subjectTag,
        teacherName: teacher?.name || '不明',
        studentId: student.id,
        courseId: r.course.id,
        weekday,
        slotId: r.slot.id,
        dateStr,
        dual: isDual,
      });
    }
    const used = teacher ? countTeacherSlotOnDate(teacher.id, dateStr, r.slot.id, null) : 0;
    const prefHtml = buildPrefPairActionHtmlForTeacher(student.id, r.course.id, r.existing.teacherId);
    return `<div class="match-slot mp-slot-readonly">
      <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
      <div class="confirmed-box">
        <span class="cb-label">確定</span>
        ${subjectTag}
        <span class="cb-teacher">講師：${teacherHonorific(teacher)}（${used}/${S.teacherCapacity}）</span>
        <div class="confirmed-box-actions">${prefHtml}</div>
      </div>
    </div>`;
  }

  if(r.missingTeacher){
    return `<div class="match-slot">
      <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
      ${buildMpSlotSubjectRow(subjectTag, 'pending')}
      ${buildAbsentTeacherFollowupHtml({
        dateStr,
        slotId: r.slot.id,
        studentId: student.id,
        courseId: r.course.id,
        subject: r.course.subject,
        originalTeacherId: r.missingTeacher.teacherId,
      })}
    </div>`;
  }

  return `<div class="match-slot matching-pick-slot mp-slot-card">
    <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）<span class="mp-slot-meta">教室 ${roomUsed}/${S.roomCapacity}</span></div>
    ${buildMpSlotSubjectRow(subjectTag, 'pending')}
    <div class="matching-panel-cand-list">${buildCandidatesHtml(student, r, weekday, dateStr)}</div>
  </div>`;
}

function applyPanelLayout(){
  const shell = document.getElementById('calViewShell');
  const panel = document.getElementById('matchingPanel');
  const open = S.matchingPanelOpen;
  shell?.classList.toggle('drawer-open', open);
  panel?.classList.toggle('is-open', open);
  panel?.setAttribute('aria-hidden', open ? 'false' : 'true');
  document.body.classList.toggle('cal-drawer-open', open);
  updateMatchingReturnBar();
}

function scrollCalendarIntoView(){
  requestAnimationFrame(()=>{
    setTimeout(()=>{
      const target = document.querySelector('.cal-toolbar');
      if(!target) return;
      const y = target.getBoundingClientRect().top + window.scrollY - 8;
      window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
    }, 100);
  });
}

function openMatchingPanel(){
  switchView('calendar');
  switchCalMode('month');

  const filterStudent = resolveFilterStudent();
  if(filterStudent){
    showMatchingStudentView(filterStudent.id);
    scrollCalendarIntoView();
    return;
  }

  if(S.calSelectedDate){
    S.matchingPanelOpen = true;
    applyPanelLayout();
    showDayDetail(S.calSelectedDate);
    renderCalendar();
    hideCalDetailCard();
    scrollCalendarIntoView();
    return;
  }

  S.matchingPanelOpen = false;
  applyPanelLayout();
  expandShortageBar();
  renderShortageDashboard();
  scrollCalendarIntoView();
}

function closeMatchingPanel(){
  S.matchingPanelOpen = false;
  S.matchingPanelStudentId = null;
  S.matchingPanelSlot = null;
  S.matchingReturnToStudentId = null;
  S.calendarDrawerView = 'day';
  applyPanelLayout();
  renderMatchingDesiredBar();
  renderCalendar();
}

function renderStudentPeriodSlots(studentId, scrollToDateStr){
  const body = document.getElementById('matchingPanelBody');
  const student = S.students.find(s=> s.id === studentId);
  if(!body || !student) return;

  S.matchingPanelSlot = null;

  const periodDates = getPeriodDateStrings();
  const selectedDate = scrollToDateStr || S.calSelectedDate;
  let totalPending = 0;
  let dayCount = 0;
  let daySectionsHtml = '';

  periodDates.forEach(dateStr=>{
    const status = getDayStatus(dateStr);
    const rows = getStudentDateRows(student, dateStr);
    if(rows.length === 0) return;

    dayCount++;
    const d = new Date(dateStr + 'T00:00:00');
    const label = `${d.getMonth() + 1}月${d.getDate()}日（${status.weekday}）`;
    const pendingCount = rows.filter(rowIsPendingMatch).length;
    totalPending += pendingCount;

    let slotsHtml = '';
    if(status.type !== 'open'){
      slotsHtml = `<div class="cal-empty-day">休校日</div>`;
    }else{
      rows.forEach(r=>{
        slotsHtml += buildMatchingSlotCard(r, student, dateStr, status.weekday);
      });
    }

    const isSelected = dateStr === selectedDate;
    daySectionsHtml += `
      <section class="matching-panel-day-section${isSelected ? ' is-selected' : ''}" id="mp-day-${dateStr}" data-date="${dateStr}">
        <div class="matching-panel-day-head">${label}</div>
        <div class="matching-panel-slot-list">${slotsHtml}</div>
      </section>`;
  });

  const periodLabel = S.calMode === 'week' ? '今週' : `${Number(getActiveYearMonth().slice(5))}月`;

  body.innerHTML = `
    <button type="button" class="ghost mp-back-btn" id="mpBackToMenu">← 閉じる</button>
    <div class="matching-panel-student-head">
      <div class="matching-panel-student-name">${student.name}さん</div>
      <div class="matching-panel-student-grade">${gradeLabel(student)}</div>
    </div>
    ${buildPostAssignBannersHtml()}
    <p class="matching-panel-hint">${periodLabel}のコマ一覧（${dayCount}日分）${totalPending > 0 ? ` — 講師なし <strong>${totalPending}コマ</strong>` : ''}</p>
    ${daySectionsHtml
      ? `<div class="matching-panel-period-list">${daySectionsHtml}</div>`
      : `<p class="matching-panel-hint">この期間に表示できるコマがありません。</p>`}
  `;

  bindBackToMenu(body);
  bindConfirmButtons(body);
  bindChangeTeacherButtons(body);
  bindPrefPairButtons(body, ()=> afterMatchingChange(S.calSelectedDate));
  bindPrefPairOffer(body);
  bindFutureWeeksOffer(body);
  bindAbsentTeacherFollowup(body, ()=> afterMatchingChange(S.calSelectedDate));

  matchingPanelRenderedPeriodKey = getPeriodKey();

  if(selectedDate) scrollToDrawerDate(selectedDate);
  updateDrawerHeader();
}

function selectPanelStudent(studentId){
  S.matchingPanelStudentId = studentId;
  S.matchingPanelSlot = null;
  S.calendarDrawerView = 'matching-student';
  setCalFilterStudent(studentId);
  switchCalMode('month');
  refreshCalFilterOptions();

  const firstPending = findFirstPendingDate(studentId);
  if(firstPending){
    syncCalMonthToDate(firstPending);
    S.calSelectedDate = firstPending;
  }else{
    const fallback = findFirstOpenDateInMonth();
    if(fallback) S.calSelectedDate = fallback;
  }

  renderMatchingDesiredBar();
  renderCalendar();
  hideCalDetailCard();
  scrollCalendarIntoView();
  renderDrawerContent();
}

function afterMatchingChange(scrollToDateStr){
  if(scrollToDateStr) S.calSelectedDate = scrollToDateStr;
  matchingPanelRenderedPeriodKey = '';
  renderMatching();
  renderShortageDashboard();
  renderCalendar();
  hideCalDetailCard();
  if(!S.matchingPanelOpen) return;
  if(S.calendarDrawerView === 'day' && S.calSelectedDate){
    renderDayDetailInDrawer(S.calSelectedDate);
    updateDrawerHeader(S.calSelectedDate);
  }else if(S.calendarDrawerView === 'matching-student' && S.matchingPanelStudentId){
    renderStudentPeriodSlots(S.matchingPanelStudentId, S.calSelectedDate);
    updateDrawerHeader();
  }
}

function onShowDay(e){
  const dateStr = e.detail?.dateStr;
  const studentId = e.detail?.studentId;
  if(studentId){
    setCalFilterStudent(studentId);
    refreshCalFilterOptions();
  }
  showDayDetail(dateStr);
}

function onRefreshDay(e){
  const dateStr = e.detail?.dateStr || S.calSelectedDate;
  if(!S.matchingPanelOpen || S.calendarDrawerView !== 'day' || !dateStr) return;
  renderDayDetailInDrawer(dateStr);
  updateDrawerHeader(dateStr);
}

function renderMatchingDesiredBar(){
  const bar = document.getElementById('matchingDesiredSlotsBar');
  if(!bar) return;
  if(!S.matchingPanelOpen || !S.matchingPanelStudentId){
    bar.style.display = 'none';
    bar.innerHTML = '';
    return;
  }
  const student = S.students.find(s=>s.id===S.matchingPanelStudentId);
  if(!student){
    bar.style.display = 'none';
    return;
  }

  const ym = S.referenceYearMonth;
  const chips = [];
  student.courses.forEach(course=>{
    course.desiredSlots.forEach(ds=>{
      const slot = SLOTS.find(s=>s.id===ds.slot);
      const eff = findEffectiveAssignment(student.id, course.id, ds.day, ds.slot, ym);
      const c = subjectColor(student.level, course.subject);
      let status = 'pending';
      let label = '講師なし';
      if(eff){
        if(eff.isDraft){
          status = 'draft';
          label = '仮決め';
        }else if(eff.isPending){
          status = 'waiting';
          label = '承認待ち';
        }else{
          status = 'done';
          label = '確定';
        }
      }
      const active = !!(S.calSelectedDate &&
        S.calSelectedDate.startsWith(ym) &&
        getDayStatus(S.calSelectedDate).weekday === ds.day);
      chips.push(`<span class="desired-slot-chip ${status}${active?' active':''}" data-course="${course.id}" data-day="${ds.day}" data-slot="${ds.slot}" data-subject="${course.subject}">
        <span class="dsc-sub" style="background:${c.bg};color:${c.text};">${course.subject}</span>
        ${ds.day}${slot?.label||''} <span class="dsc-status">${label}</span>
      </span>`);
    });
  });

  if(chips.length===0){
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';
  bar.innerHTML = `<span class="desired-bar-label">${student.name}さんの希望コマ：</span>${chips.join('')}`;

  bar.querySelectorAll('.desired-slot-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      const dateStr = findNearestDateForWeekday(chip.dataset.day);
      if(!dateStr) return;
      S.calSelectedDate = dateStr;
      syncCalMonthToDate(dateStr);
      renderCalendar();
      hideCalDetailCard();
      showDayDetail(dateStr);
    });
  });
}

function findNearestDateForWeekday(weekday){
  const ym = S.referenceYearMonth;
  if(!ym) return null;
  const total = new Date(Number(ym.slice(0,4)), Number(ym.slice(5,7)), 0).getDate();
  const today = new Date();
  today.setHours(0,0,0,0);
  for(let d=1; d<=total; d++){
    const dateStr = `${ym}-${String(d).padStart(2,'0')}`;
    const wd = ['日','月','火','水','木','金','土'][new Date(dateStr+'T00:00:00').getDay()];
    if(wd!==weekday) continue;
    if(getDayStatus(dateStr).type !== 'open') continue;
    const dt = new Date(dateStr+'T00:00:00');
    if(dt >= today || d===total) return dateStr;
  }
  for(let d=1; d<=total; d++){
    const dateStr = `${ym}-${String(d).padStart(2,'0')}`;
    const wd = ['日','月','火','水','木','金','土'][new Date(dateStr+'T00:00:00').getDay()];
    if(wd!==weekday) continue;
    if(getDayStatus(dateStr).type !== 'open') return dateStr;
  }
  return null;
}

function onCalendarRendered(){
  renderMatchingDesiredBar();
  if(!S.matchingPanelOpen || S.calendarDrawerView !== 'matching-student' || !S.matchingPanelStudentId) return;
  const key = getPeriodKey();
  if(key !== matchingPanelRenderedPeriodKey){
    renderStudentPeriodSlots(S.matchingPanelStudentId, S.calSelectedDate);
  }else if(S.calSelectedDate){
    highlightSelectedDaySection(S.calSelectedDate);
  }
}

function initMatchingPanel(){
  document.getElementById('openMatchingPanelBtn')?.addEventListener('click', openMatchingPanel);
  document.getElementById('matchingPanelCloseBtn')?.addEventListener('click', closeMatchingPanel);
  document.getElementById('matchingReturnToStudentBtn')?.addEventListener('click', returnToStudentRegistration);
  document.addEventListener('keydown', e=>{
    if(e.key === 'Escape' && S.matchingPanelOpen) closeMatchingPanel();
  });
  document.addEventListener('matching:force-close', ()=>{
    if(S.matchingPanelOpen) closeMatchingPanel();
  });
  document.addEventListener('calendar:show-day', onShowDay);
  document.addEventListener('calendar:refresh-day', onRefreshDay);
  document.addEventListener('matching:go-student-month', e=>{
    showMatchingStudentView(e.detail?.studentId);
  });
  document.addEventListener('matching:go-student-date', e=>{
    showMatchingStudentAtDate(e.detail?.studentId, e.detail?.dateStr);
  });
  document.addEventListener('calendar:rendered', onCalendarRendered);
  document.addEventListener('matching:refresh-panel', ()=>{
    if(S.matchingPanelOpen && S.calendarDrawerView === 'matching-student' && S.matchingPanelStudentId){
      renderStudentPeriodSlots(S.matchingPanelStudentId, S.calSelectedDate);
    }
  });
}

export { initMatchingPanel, openMatchingPanel, closeMatchingPanel, renderMatchingDesiredBar, showDayDetail };
