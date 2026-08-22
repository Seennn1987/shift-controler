import { SUBJECT_MAP, DAYS, SLOTS, WEEKDAY_JP, WEEK_FULL, SUBJECT_ABBR } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr, getTodayStr } from '../shared/date-utils.js';
import { firebaseConfig, fbAuth, fbDb, STORAGE_KEY, getSecondaryAuth, S } from './state.js';
import { findAbsenceFor, getEffectiveDayAssignments, getStudentDateRows } from './absences.js';
import { hasCalFocusFilter, registerCalFilterUiSync, resolveFilterStudent, resolveFilterTeacher, setCalFilterStudent } from './cal-filter.js';
import { refreshCalFilterOptions } from './filter-ui.js';
import { setSearchComboboxValue } from './search-combobox.js';
import { getWeekMonday, renderCalendarWeek, renderMatrix } from './finance-ui.js';
import { renderMatching } from './matching.js';
import { subjectColor } from './schedule-core.js';
import { findEffectiveAssignment, renderApprovalStatus, renderTeacherScheduleTab } from './teacher-schedule-tab.js';

// カレンダー（トップページ・TimeTree風シンプルUI）
// =====================================================================


// 指定日のステータスを判定する
// {type:'outside'|'custom-closed'|'closed-weekday'|'holiday'|'open', label, weekday, count, holidayName, closureLabel}
function findCustomClosure(dateStr){
  return S.customClosures.find(c=> dateStr>=c.startDate && dateStr<=c.endDate) || null;
}

function getDayStatus(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  const weekday = WEEKDAY_JP[d.getDay()];

  // 通常授業は常に開校期間（アプリ利用開始時から継続）。休校となるのは以下の例外のみ
  const closure = findCustomClosure(dateStr);
  if(closure){
    return {type:'custom-closed', label:closure.label, weekday, closureLabel:closure.label};
  }
  if(S.regularClosedDays.includes(weekday)){
    return {type:'closed-weekday', label:'定休日', weekday};
  }
  if(S.holidayAutoDetect){
    const h = HOLIDAYS_JP.find(x=>x.date===dateStr);
    if(h){
      return {type:'holiday', label:h.name, weekday, holidayName:h.name};
    }
  }
  // 日曜日はそもそも曜日パターンの対象外（DAYSに含まれない）ため、定休日指定がなければ常に0件の営業日として扱う
  const count = weekday==='日' ? 0 : S.assignments.filter(a=>a.day===weekday).length;
  return {type:'open', label:'', weekday, count};
}

function shortName(fullName){ return (fullName||'').split(/\s+/)[0]; }

// 生徒1コマ分の表示行（月間・週間で共通）
function studentRowToCalLine(r, student){
  const subAbbr = SUBJECT_ABBR[r.course.subject] || r.course.subject.slice(0,1);
  const sc = subjectColor(student.level, r.course.subject);
  if(r.isMakeupTarget){
    const teacher = S.teachers.find(t=>t.id===r.absence.makeup.teacherId);
    return {text:`${subAbbr}:${teacher?shortName(teacher.name):'?'}(振替)`, cls:'makeup', bg:sc.bg, color:sc.text};
  }
  if(r.absence){
    return {text:`${subAbbr}:欠席`, cls:'absent'};
  }
  if(r.existing){
    if(r.isPending){
      return {text:`${subAbbr}:確認待ち`, cls:'pending'};
    }
    const teacher = S.teachers.find(t=>t.id===r.existing.teacherId);
    return {text:`${subAbbr}:${teacher?shortName(teacher.name):'?'}`, cls:'confirmed', bg:sc.bg, color:sc.text};
  }
  return {text:`${subAbbr}:未確定`, cls:'pending'};
}

function calLineToHtml(l){
  const styleAttr = l.bg ? ` style="background:${l.bg};color:${l.color};"` : '';
  return `<div class="cal-entry ${l.cls}"${styleAttr}>${l.text}</div>`;
}

function calLinesToEntriesHtml(lines){
  if(!lines.length) return '';
  return `<div class="cal-entries">${lines.map(calLineToHtml).join('')}</div>`;
}

// その日（曜日）に表示するテキスト行を組み立てる（生徒フィルターあり／なし共通）
function buildDayCellLines(dateStr, filterStudent){
  const status = getDayStatus(dateStr);
  const weekday = status.weekday;
  const lines = [];
  if(filterStudent){
    getStudentDateRows(filterStudent, dateStr).forEach(r=>{
      lines.push(studentRowToCalLine(r, filterStudent));
    });
  }else{
    getEffectiveDayAssignments(dateStr).forEach(a=>{
      const student = S.students.find(s=>s.id===a.studentId);
      const subAbbr = SUBJECT_ABBR[a.subject] || a.subject.slice(0,1);
      const suffix = a.kind==='makeup' ? '(振替)' : '';
      const sc = student ? subjectColor(student.level, a.subject) : {bg:'#eee', text:'#333'};
      lines.push({text:`${subAbbr}:${student?shortName(student.name):'?'}${suffix}`, cls: a.kind==='makeup' ? 'makeup' : 'confirmed', bg:sc.bg, color:sc.text});
    });
  }
  return lines;
}

// その日・コマで「希望登録はあるが未マッチ」の件数（生徒登録時の desiredSlots ベース）
function countUnassignedDesiredForSlot(dateStr, slotId){
  const status = getDayStatus(dateStr);
  if(status.type !== 'open') return 0;
  const weekday = status.weekday;
  const yearMonth = dateStr.slice(0, 7);
  let count = 0;
  S.students.forEach(student=>{
    student.courses.forEach(course=>{
      course.desiredSlots.forEach(ds=>{
        if(ds.day !== weekday || ds.slot !== slotId) return;
        if(findAbsenceFor(student.id, course.id, dateStr, ds.day, ds.slot)) return;
        if(findEffectiveAssignment(student.id, course.id, ds.day, ds.slot, yearMonth, dateStr)) return;
        count++;
      });
    });
  });
  return count;
}

function getUnassignedRowsForDate(dateStr){
  const status = getDayStatus(dateStr);
  if(status.type !== 'open') return [];
  const weekday = status.weekday;
  const yearMonth = dateStr.slice(0, 7);
  const rows = [];
  S.students.forEach(student=>{
    student.courses.forEach(course=>{
      course.desiredSlots.forEach(ds=>{
        if(ds.day !== weekday) return;
        if(findAbsenceFor(student.id, course.id, dateStr, ds.day, ds.slot)) return;
        if(findEffectiveAssignment(student.id, course.id, ds.day, ds.slot, yearMonth, dateStr)) return;
        const slot = SLOTS.find(sl=> sl.id === ds.slot);
        if(!slot) return;
        rows.push({ student, course, slot, weekday });
      });
    });
  });
  rows.sort((a, b)=> a.slot.id - b.slot.id || a.student.name.localeCompare(b.student.name, 'ja'));
  return rows;
}

function heatBoxTitle(h){
  const parts = [`${h.slotLabel} · 生徒${h.count}人`, `定員${S.roomCapacity}人`];
  if(h.pendingCount > 0) parts.push(`講師未決${h.pendingCount}人`);
  return parts.join(' · ');
}

/** 教室全体表示：4講〜7講を常に4行。v4 flex左詰め（4講 2人 未決） */
function heatBoxHtml(h){
  const isEmpty = h.count === 0;
  const hasPending = h.pendingCount > 0;
  const countHtml = isEmpty
    ? '<span class="cal-heat-count is-dash">—</span>'
    : `<span class="cal-heat-count">${h.count}人</span>`;
  const badge = hasPending
    ? `<span class="cal-heat-pending-badge">未決${h.pendingCount}</span>`
    : '';
  const cls = ['cal-heat-box', isEmpty ? 'is-empty' : ''].filter(Boolean).join(' ');
  return `<div class="${cls}" title="${heatBoxTitle(h)}"><span class="cal-heat-label">${h.slotLabel}</span>${countHtml}${badge}</div>`;
}

// 教室全体表示用：その実日付における4コマ(4講〜7講)それぞれの混雑度（確定＋未マッチの希望コマを反映）
function buildDayHeat(dateStr){
  const list = getEffectiveDayAssignments(dateStr);
  return SLOTS.map(slot=>{
    const confirmedCount = list.filter(a=>a.slot===slot.id).length;
    const pendingCount = countUnassignedDesiredForSlot(dateStr, slot.id);
    const count = confirmedCount + pendingCount;
    const ratio = S.roomCapacity>0 ? Math.min(count/S.roomCapacity, 1) : 0;
    return {slotLabel:slot.label, confirmedCount, pendingCount, count, ratio};
  });
}

function buildDayCellLinesForTeacher(dateStr, teacher){
  return getEffectiveDayAssignments(dateStr)
    .filter(a=> a.teacherId === teacher.id)
    .map(a=>{
      const student = S.students.find(s=> s.id === a.studentId);
      const subAbbr = SUBJECT_ABBR[a.subject] || a.subject.slice(0,1);
      const sc = student ? subjectColor(student.level, a.subject) : {bg:'#eee', text:'#333'};
      const suffix = a.kind==='makeup' ? '(振替)' : '';
      const studentLabel = student ? shortName(student.name) : '?';
      return {
        text: `${subAbbr}:${studentLabel}${suffix}`,
        cls: a.kind==='makeup' ? 'makeup' : 'confirmed',
        bg: sc.bg,
        color: sc.text,
      };
    });
}

function renderCalendar(){
  const grid = document.getElementById('calGrid');
  if(!grid) return;
  if(S.calYear===undefined){
    const t = new Date();
    S.calYear = t.getFullYear();
    S.calMonth = t.getMonth();
  }
  S.referenceYearMonth = `${S.calYear}-${pad2(S.calMonth+1)}`;
  updateCalPeriodLabel();

  if(!S.dataReady || !S.studentDataReady){
    grid.innerHTML = '<div class="loading">読み込み中…</div>';
    return;
  }

  const filterStudent = resolveFilterStudent();
  const filterTeacher = resolveFilterTeacher();
  const MAX_LINES = 3;

  const firstDay = new Date(S.calYear, S.calMonth, 1);
  const daysInMonth = new Date(S.calYear, S.calMonth+1, 0).getDate();
  const startWeekday = firstDay.getDay(); // 0=日
  const todayStr = getTodayStr();

  let html = WEEKDAY_JP.map((w,i)=>`<div class="cal-dow ${i===0?'sun':(i===6?'sat':'')}">${w}</div>`).join('');

  for(let i=0;i<startWeekday;i++){
    html += `<div class="cal-cell blank"></div>`;
  }

  for(let day=1; day<=daysInMonth; day++){
    const dateStr = toDateStr(S.calYear, S.calMonth, day);
    const status = getDayStatus(dateStr);
    const classes = ['cal-cell', status.type];
    if(dateStr===todayStr) classes.push('today');
    if(dateStr===S.calSelectedDate) classes.push('selected');

    let inner = `<div class="cal-daynum">${day}</div>`;
    if(status.type==='open'){
      if(filterStudent){
        // 生徒フィルター時：1人分は多くても週2-3コマなので、個別テキストのまま表示して問題ない
        const lines = buildDayCellLines(dateStr, filterStudent);
        const pendingCount = lines.filter(l=>l.cls==='pending').length;
        if(lines.length===0) classes.push('no-activity');

        let entriesHtml = '';
        lines.slice(0, MAX_LINES).forEach(l=>{
          entriesHtml += calLineToHtml(l);
        });
        if(lines.length>MAX_LINES){
          entriesHtml += `<div class="cal-entry-more">他${lines.length-MAX_LINES}件</div>`;
        }
        inner += `<div class="cal-entries">${entriesHtml}</div>`;
      }else if(filterTeacher){
        const lines = buildDayCellLinesForTeacher(dateStr, filterTeacher);
        if(lines.length===0) classes.push('no-activity');

        let entriesHtml = '';
        lines.slice(0, MAX_LINES).forEach(l=>{
          entriesHtml += calLineToHtml(l);
        });
        if(lines.length>MAX_LINES){
          entriesHtml += `<div class="cal-entry-more">他${lines.length-MAX_LINES}件</div>`;
        }
        inner += entriesHtml ? `<div class="cal-entries">${entriesHtml}</div>` : `<div class="cal-heat-empty">−</div>`;
      }else{
        const heat = buildDayHeat(dateStr);
        const total = heat.reduce((sum,h)=>sum+h.count, 0);
        if(total===0) classes.push('no-activity');
        if(heat.some(h=>h.pendingCount>0)){
          inner = inner.replace(
            `<div class="cal-daynum">${day}</div>`,
            `<div class="cal-daynum">${day}<span class="cal-day-pending-dot" aria-hidden="true"></span></div>`
          );
        }
        const heatBoxes = heat.map(h=>heatBoxHtml(h)).join('');
        inner += `<div class="cal-heat-stack">${heatBoxes}</div>`;
      }
    }else if(status.type==='holiday'){
      inner += `<div class="cal-sublabel">${status.holidayName}</div>`;
    }else if(status.type==='custom-closed'){
      inner += `<div class="cal-sublabel">${status.closureLabel}</div>`;
    }else if(status.type==='closed-weekday'){
      inner += `<div class="cal-sublabel">定休</div>`;
    }

    const clickable = (status.type==='open');
    html += `<div class="${classes.join(' ')}" ${clickable?`data-date="${dateStr}"`:''}>${inner}</div>`;
  }

  grid.innerHTML = html;
  grid.querySelectorAll('.cal-cell[data-date]').forEach(cell=>{
    cell.addEventListener('click', ()=>{
      S.calSelectedDate = cell.dataset.date;
      if(S.matchingPanelOpen && S.matchingPanelStudentId && S.calFilterStudentId !== S.matchingPanelStudentId){
        setCalFilterStudent(S.matchingPanelStudentId);
      }
      renderCalendar();
      document.dispatchEvent(new CustomEvent('calendar:show-day', { detail: { dateStr: cell.dataset.date } }));
    });
  });

  document.dispatchEvent(new CustomEvent('calendar:rendered'));

  refreshCalToolbarSecondary();
  renderApprovalStatus();
}

// refreshCalFilterOptions は filter-ui.js で定義


// 月移動時に、カレンダー・マッチング系すべてに対象月の変更を反映する
// S.calYear/calMonthで選ばれている月に合わせて、週間予定の表示週を同期する
// 「今日」がその月に含まれるなら今日を含む週へ、そうでなければその月の1日を含む週へ
function computeSyncedWeekAnchor(year, month){
  const todayStr = getTodayStr();
  const todayDate = new Date(todayStr+'T00:00:00');
  if(todayDate.getFullYear()===year && todayDate.getMonth()===month){
    return getWeekMonday(todayStr);
  }
  return getWeekMonday(toDateStr(year, month, 1));
}

function syncMonthChange(){
  S.referenceYearMonth = `${S.calYear}-${pad2(S.calMonth+1)}`;
  // 週間予定の表示週（S.calWeekAnchor）は独立した状態のため、月間側の見出しとズレないよう毎回同期する
  S.calWeekAnchor = computeSyncedWeekAnchor(S.calYear, S.calMonth);
  renderCalendar();
  if(S.calMode==='week') renderCalendarWeek();
  renderTeacherScheduleTab();
  renderMatrix();
  renderMatching();
}

function updateCalPeriodLabel(){
  const label = document.getElementById('calPeriodLabel');
  const todayBtn = document.getElementById('calTodayBtn');
  const modeBtn = document.getElementById('calModeToggleBtn');
  if(!label) return;

  if(S.calMode==='week'){
    const monday = new Date((S.calWeekAnchor || getWeekMonday(getTodayStr()))+'T00:00:00');
    const weekDates = [];
    for(let i=0;i<6;i++){
      const d = new Date(monday);
      d.setDate(monday.getDate()+i);
      weekDates.push(toDateStr(d.getFullYear(), d.getMonth(), d.getDate()));
    }
    const fmt = ds=>{ const d=new Date(ds+'T00:00:00'); return `${d.getMonth()+1}/${d.getDate()}`; };
    label.textContent = `${fmt(weekDates[0])} 〜 ${fmt(weekDates[5])}`;
    if(todayBtn) todayBtn.textContent = '今週';
    if(modeBtn) modeBtn.textContent = '週間表示 ▾';
  }else{
    label.textContent = `${S.calYear}年${S.calMonth+1}月`;
    if(todayBtn) todayBtn.textContent = '今月';
    if(modeBtn) modeBtn.textContent = '月間表示 ▾';
  }
}

function refreshCalToolbarSecondary(){
  const axisBar = document.getElementById('calWeekAxisBar');
  const showAxis = S.calMode==='week' && !hasCalFocusFilter();
  if(axisBar) axisBar.style.display = showAxis ? 'flex' : 'none';
  const toggleWrap = document.getElementById('calOpeningsSubjectToggleWrap');
  const toggle = document.getElementById('calOpeningsShowSubjectsToggle');
  const showSubjectToggle = showAxis && S.weekAxis === 'openings';
  if(toggleWrap) toggleWrap.hidden = !showSubjectToggle;
  if(toggle) toggle.checked = !!S.calOpeningsShowSubjects;
}

// =====================================================================

export { findCustomClosure, getDayStatus, shortName, studentRowToCalLine, calLineToHtml, calLinesToEntriesHtml, buildDayCellLines, buildDayCellLinesForTeacher, buildDayHeat, getUnassignedRowsForDate, renderCalendar, computeSyncedWeekAnchor, syncMonthChange, updateCalPeriodLabel, refreshCalToolbarSecondary };
export { getCalFilterValue, setCalFilterFromSelect, setCalFilterStudent, clearCalFilter, hasCalFocusFilter, resolveFilterStudent, resolveFilterTeacher } from './cal-filter.js';
export { refreshCalFilterOptions, refreshCalFilterOptions as refreshCalStudentFilterOptions } from './filter-ui.js';
