import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { daysInYearMonth, getTodayStr, pad2 } from '../shared/date-utils.js';
import { S } from './state.js';
import { getStudentDateRows } from './absences.js';
import { getDayStatus, renderCalendar } from './calendar.js';
import { refreshCalFilterOptions, clearCalFilter, setCalFilterStudent } from './filter-ui.js';
import { bulkAutoAssign, bulkCancelAuto, fillStudentFormForEdit, renderMatching, renderShortageDashboard, renderStudentList } from './matching.js';
import { renderTeacherList } from './teachers.js';
import { switchCalMode, switchView, renderCalendarWeek } from './finance-ui.js';
import { getDateSlotState, gradeLabel, subjectColor, teacherHonorific } from './schedule-core.js';
import { clearAllMatchingData, scheduleSave, scheduleSyncTeacherAssignments } from './students-persistence.js';
import { bindDayDetailEvents, getDayDetailTitle, renderDayDetailPanel } from './day-detail-panel.js';
import {
  addPreferredPair,
  confirmAssignment,
  countRoomSlot,
  countRoomSlotOnDate,
  countTeacherSlot,
  countTeacherSlotOnDate,
  findEffectiveAssignment,
  isPreferredPair,
  removePreferredPairFor,
  teacherHasSubmittedMonth,
  withdrawPendingAssignment,
} from './teacher-schedule-tab.js';
import { buildMatchCandidatesHtml } from './match-candidates-html.js';
import { buildPrefPairActionHtmlForTeacher, buildWaitingSlotCardHtml } from './match-candidate-ui.js';

function refreshPrefPairViews(){
  renderStudentList();
  renderTeacherList();
}

function monthHasSubmittedTeachers(yearMonth){
  return S.teachers.some(t=> teacherHasSubmittedMonth(t.id, yearMonth));
}

function closeCalActionPanels(){
  const studentDropdown = document.getElementById('studentAbsenceDropdown');
  const teacherDropdown = document.getElementById('teacherAbsenceDropdown');
  const studentPanel = document.getElementById('studentAbsenceQuickPanel');
  const teacherPanel = document.getElementById('teacherAbsenceQuickPanel');
  const studentBtn = document.getElementById('studentAbsenceActionBtn');
  const teacherBtn = document.getElementById('teacherAbsenceActionBtn');
  if(studentPanel) studentPanel.hidden = true;
  if(teacherPanel) teacherPanel.hidden = true;
  studentDropdown?.classList.remove('is-open');
  teacherDropdown?.classList.remove('is-open');
  studentBtn?.classList.remove('is-active');
  teacherBtn?.classList.remove('is-active');
  studentBtn?.setAttribute('aria-expanded', 'false');
  teacherBtn?.setAttribute('aria-expanded', 'false');
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
  renderMatchingPanelMenu();
  updateDrawerHeader();
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
  closeCalActionPanels();

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

function showMatchingMenuView(){
  S.calendarDrawerView = 'matching-menu';
  S.matchingPanelStudentId = null;
  S.matchingPanelSlot = null;
  renderDrawerContent();
  renderMatchingDesiredBar();
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
      alert(result.msg);
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

function bindStudentPickButtons(root){
  root.querySelectorAll('.matching-student-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> selectPanelStudent(btn.dataset.studentId));
  });
}

function bindBackToMenu(root){
  root.querySelector('#mpBackToMenu')?.addEventListener('click', ()=>{
    S.matchingPanelStudentId = null;
    S.matchingPanelSlot = null;
    matchingPanelFlashMsg = null;
    matchingPanelFutureOffer = null;
    matchingPanelPrefPairOffer = null;
    matchingPanelRenderedPeriodKey = '';
    clearCalFilter();
    S.calSelectedDate = null;
    refreshCalFilterOptions();
    showMatchingMenuView();
    renderCalendar();
    hideCalDetailCard();
  });
}

function buildCandidatesHtml(student, courseId, subject, day, slot, dateStr){
  return buildMatchCandidatesHtml(student, courseId, subject, day, slot, dateStr, {
    btnClass: 'confirm-btn mp-confirm-btn',
    showConfirm: true,
  });
}

function buildAssignmentFlashMessage({slotLabel, subject, teacherName, pending}){
  const detail = `${slotLabel || ''}（${subject}）`;
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

function bindChangeTeacherButtons(root){
  root.querySelectorAll('.mp-change-teacher-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      btn.disabled = true;
      const result = await withdrawPendingAssignment(
        btn.dataset.student,
        btn.dataset.course,
        btn.dataset.day,
        Number(btn.dataset.slot),
        btn.dataset.date || null,
      );
      btn.disabled = false;
      if(result.cancelled) return;
      if(!result.ok){
        window.alert(result.msg || '取り消しに失敗しました。');
        return;
      }
      matchingPanelFlashMsg = '依頼を取り消しました。別の講師を選んでください。';
      afterMatchingChange(btn.dataset.date || null);
    });
  });
}

function bindConfirmButtons(root){
  root.querySelectorAll('.mp-confirm-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const teacher = S.teachers.find(t=> t.id === btn.dataset.teacher);
      const result = confirmAssignment(
        btn.dataset.student,
        btn.dataset.course,
        btn.dataset.subject,
        btn.dataset.day,
        Number(btn.dataset.slot),
        btn.dataset.teacher,
        'manual',
        { dateStr: btn.dataset.date || null }
      );
      if(!result.ok){
        alert(result.msg);
        return;
      }
      scheduleSave();
      const slotDef = SLOTS.find(s=> s.id === Number(btn.dataset.slot));
      const ctx = {
        studentId: btn.dataset.student,
        courseId: btn.dataset.course,
        subject: btn.dataset.subject,
        day: btn.dataset.day,
        slot: Number(btn.dataset.slot),
        teacherId: btn.dataset.teacher,
        dateStr: btn.dataset.date,
        teacherName: teacher?.name || '',
      };
      matchingPanelFlashMsg = buildAssignmentFlashMessage({
        slotLabel: slotDef?.label || '',
        subject: ctx.subject,
        teacherName: ctx.teacherName,
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
  const c = subjectColor(student.level, r.course.subject);
  const detailYearMonth = dateStr.slice(0, 7);
  const roomUsed = countRoomSlotOnDate(dateStr, r.slot.id, null);

  if(r.isMakeupTarget){
    const teacher = S.teachers.find(t=> t.id === r.absence.makeup.teacherId);
    return `<div class="match-slot mp-slot-readonly">
      <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
      <div class="confirmed-box makeup-box">
        <span class="cb-label makeup-label">振替授業</span>
        <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span>
        <span class="cb-teacher">講師：${teacherHonorific(teacher)}</span>
      </div>
    </div>`;
  }

  if(r.absence){
    return `<div class="match-slot mp-slot-readonly">
      <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
      <div class="absence-box">
        <span class="cb-label absence-label">欠席</span>
        <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span>
        <span class="mp-slot-note">欠席・振替の操作はマッチング終了後、日付詳細から行えます</span>
      </div>
    </div>`;
  }

  if(r.existing){
    const teacher = S.teachers.find(t=> t.id === r.existing.teacherId);
    if(r.isPending){
      const subjectTag = `<span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span>`;
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
      });
    }
    const used = teacher ? countTeacherSlotOnDate(teacher.id, dateStr, r.slot.id, null) : 0;
    const prefHtml = buildPrefPairActionHtmlForTeacher(student.id, r.course.id, r.existing.teacherId);
    return `<div class="match-slot mp-slot-readonly">
      <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
      <div class="confirmed-box">
        <span class="cb-label">確定</span>
        <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span>
        <span class="cb-teacher">講師：${teacherHonorific(teacher)}（${used}/${S.teacherCapacity}）</span>
        <div class="confirmed-box-actions">${prefHtml}</div>
      </div>
    </div>`;
  }

  return `<div class="match-slot matching-pick-slot mp-slot-card">
    <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）<span class="mp-slot-meta">教室 ${roomUsed}/${S.roomCapacity}</span></div>
    <div class="mp-slot-subject"><span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span><span class="mp-slot-badge pending">未確定</span></div>
    <div class="matching-panel-cand-list">${buildCandidatesHtml(student, r.course.id, r.course.subject, weekday, r.slot.id, dateStr)}</div>
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
  S.matchingPanelOpen = true;
  S.matchingPanelStudentId = null;
  S.matchingPanelSlot = null;
  S.matchingReturnToStudentId = null;
  S.calendarDrawerView = 'matching-menu';
  closeCalActionPanels();
  applyPanelLayout();
  switchView('calendar');
  switchCalMode('month');
  renderDrawerContent();
  renderMatchingDesiredBar();
  renderCalendar();
  hideCalDetailCard();
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

function renderMatchingPanelMenu(){
  const body = document.getElementById('matchingPanelBody');
  if(!body || !S.matchingPanelOpen) return;
  if(S.calendarDrawerView !== 'matching-menu' || S.matchingPanelStudentId) return;

  const ym = S.referenceYearMonth || '';
  const monthLabel = ym ? `${Number(ym.slice(5))}月` : 'この月';
  const monthSubmitted = ym ? monthHasSubmittedTeachers(ym) : false;

  body.innerHTML = `
    <p class="matching-panel-intro">左のカレンダーで日程を、右のパネルで講師を決めます。</p>
    ${!monthSubmitted && ym ? `<div class="matching-panel-warn">${monthLabel}は講師のシフト提出がまだないため、自動で組めません。</div>` : ''}
    <div class="matching-panel-section-label">一括</div>
    <div class="matching-panel-actions">
      <button type="button" class="primary mp-action" id="mpBulkAutoBtn" ${!monthSubmitted?'disabled':''}>全コマを自動で組む</button>
    </div>
    <div class="matching-panel-section-label">取り消し</div>
    <div class="matching-panel-actions">
      <button type="button" class="ghost mp-action" id="mpBulkCancelAutoBtn">自動で組んだ分だけ解除</button>
      <button type="button" class="ghost mp-action danger-ghost" id="mpBulkCancelBtn">すべての組みを解除</button>
    </div>
    <div class="matching-panel-divider">または</div>
    <div class="matching-panel-label">生徒名を選択</div>
    <div class="matching-student-list">
      ${S.students.length === 0
        ? '<p class="matching-panel-hint">生徒が登録されていません。</p>'
        : S.students.map(s=>`
          <button type="button" class="matching-student-btn" data-student-id="${s.id}">
            <span class="matching-student-btn-name">${s.name}</span>
            <span class="matching-student-btn-grade">${gradeLabel(s)}</span>
          </button>
        `).join('')}
    </div>
    <div id="mpBulkResult" class="matching-panel-result"></div>
  `;

  body.querySelector('#mpBulkAutoBtn')?.addEventListener('click', handlePanelBulkAuto);
  body.querySelector('#mpBulkCancelAutoBtn')?.addEventListener('click', handlePanelBulkCancelAuto);
  body.querySelector('#mpBulkCancelBtn')?.addEventListener('click', handlePanelBulkCancel);
  bindStudentPickButtons(body);
}

function handlePanelBulkCancelAuto(){
  const resultEl = document.getElementById('mpBulkResult');
  const autoCount = S.assignments.filter(a=> a.source === 'auto').length
    + S.pendingAssignments.filter(a=> a.source === 'auto').length;
  if(autoCount === 0){
    if(resultEl) resultEl.innerHTML = '<div class="matching-panel-result-msg">自動で組んだコマはありません。</div>';
    return;
  }
  if(!confirm(`自動で組んだ${autoCount}件を解除しますか？`)) return;
  const count = bulkCancelAuto();
  scheduleSave();
  if(resultEl) resultEl.innerHTML = `<div class="matching-panel-result-msg partial">自動で組んだ${count}件を解除しました。</div>`;
  afterMatchingChange();
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
    <button type="button" class="ghost mp-back-btn" id="mpBackToMenu">← メニューに戻る</button>
    <div class="matching-panel-student-head">
      <div class="matching-panel-student-name">${student.name}さん</div>
      <div class="matching-panel-student-grade">${gradeLabel(student)}</div>
    </div>
    ${buildPostAssignBannersHtml()}
    <p class="matching-panel-hint">${periodLabel}のコマ一覧（${dayCount}日分）${totalPending > 0 ? ` — 未確定 <strong>${totalPending}コマ</strong>` : ''}</p>
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

function handlePanelBulkAuto(){
  const resultEl = document.getElementById('mpBulkResult');
  const ym = S.referenceYearMonth;
  if(!monthHasSubmittedTeachers(ym)){
    if(resultEl) resultEl.innerHTML = '<div class="matching-panel-result-msg warn">この月は講師のシフト提出がないため、自動で組めません。</div>';
    return;
  }
  const {filled, skipped, total} = bulkAutoAssign();
  if(total===0){
    if(resultEl) resultEl.innerHTML = '<div class="matching-panel-result-msg">未確定のコマはありません。</div>';
  }else if(filled===0){
    if(resultEl) resultEl.innerHTML = `<div class="matching-panel-result-msg warn">対応できる講師が見つからず、${skipped}件とも自動で講師を決められませんでした。</div>`;
  }else if(skipped===0){
    if(resultEl) resultEl.innerHTML = `<div class="matching-panel-result-msg ok">✓ 未確定だった${filled}件すべて講師を決めました。</div>`;
  }else{
    if(resultEl) resultEl.innerHTML = `<div class="matching-panel-result-msg partial">${filled}件の講師を決めました。${skipped}件は未確定のままです。</div>`;
  }
  afterMatchingChange();
}

function handlePanelBulkCancel(){
  const resultEl = document.getElementById('mpBulkResult');
  const totalCount = S.assignments.length + S.pendingAssignments.length
    + S.absences.length + S.teacherAbsences.length + S.teacherSubstitutions.length;
  if(totalCount === 0){
    if(resultEl) resultEl.innerHTML = '<div class="matching-panel-result-msg">マッチングデータはありません。</div>';
    return;
  }
  if(!confirm(`確定・承認待ち・欠席・代講を含む${totalCount}件のデータをすべて削除しますか？\n（生徒・講師・シフトの登録は残ります）`)) return;
  clearAllMatchingData().then(()=>{
    if(resultEl) resultEl.innerHTML = '<div class="matching-panel-result-msg partial">マッチングデータをすべて削除しました。</div>';
    afterMatchingChange();
  });
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
  }else if(S.calendarDrawerView === 'matching-menu'){
    renderMatchingPanelMenu();
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
      let label = '未確定';
      if(eff){
        status = eff.isPending ? 'waiting' : 'done';
        label = eff.isPending ? '承認待ち' : '確定';
      }
      const active = !!(S.calSelectedDate &&
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
    const dt = new Date(dateStr+'T00:00:00');
    if(dt >= today || d===total) return dateStr;
  }
  for(let d=1; d<=total; d++){
    const dateStr = `${ym}-${String(d).padStart(2,'0')}`;
    const wd = ['日','月','火','水','木','金','土'][new Date(dateStr+'T00:00:00').getDay()];
    if(wd===weekday) return dateStr;
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

export { initMatchingPanel, openMatchingPanel, closeMatchingPanel, renderMatchingDesiredBar, renderMatchingPanelMenu, showDayDetail };
