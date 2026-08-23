import { SUBJECT_MAP, DAYS, SLOTS, WEEKDAY_JP, WEEK_FULL, LEVELS_ORDER, SUBJECT_ABBR } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr, getTodayStr } from '../shared/date-utils.js';
import { firebaseConfig, fbAuth, fbDb, STORAGE_KEY, getSecondaryAuth, S } from './state.js';
import { computeDayFinance, computeTeacherOpenings, costRatioColor, getEffectiveDayAssignments, getStudentDateRows } from './absences.js';
import { calLinesToEntriesHtml, computeSyncedWeekAnchor, getDayStatus, getUnassignedRowsForDate, refreshCalToolbarSecondary, renderCalendar, studentRowToCalLine, updateCalPeriodLabel } from './calendar.js';
import { resolveFilterTeacher } from './cal-filter.js';
import { renderMatching } from './matching.js';
import { abbr, gradeLabel, subjectColor, teacherHonorific } from './schedule-core.js';
import { scheduleSave } from './students-persistence.js';
import { renderTeacherScheduleTab } from './teacher-schedule-tab.js';
import { renderTeacherList } from './teachers.js';

// 収支タブ（講師コスト率の可視化：日・週・月）
// =====================================================================

function renderFinance(){
  scheduleSave();
  const grid = document.getElementById('finGrid');
  if(!grid) return;
  if(S.finYear===undefined){
    const t = new Date();
    S.finYear = t.getFullYear();
    S.finMonth = t.getMonth();
  }
  document.getElementById('finTitle').textContent = `${S.finYear}年${S.finMonth+1}月`;
  const legendEl = document.getElementById('finGradientLegendText');
  if(legendEl) legendEl.textContent = `${S.finGradientMin}%〜${S.finGradientMax}%`;

  if(!S.dataReady || !S.studentDataReady){
    grid.innerHTML = '<div class="loading">読み込み中…</div>';
    return;
  }

  const firstDay = new Date(S.finYear, S.finMonth, 1);
  const daysInMonth = new Date(S.finYear, S.finMonth+1, 0).getDate();
  const startWeekday = firstDay.getDay(); // 0=日

  let html = WEEKDAY_JP.map(w=>`<div class="fin-dow">${w}</div>`).join('') + `<div class="fin-dow week-col">週計</div>`;

  // 月全体の集計
  let monthRevenue = 0, monthLessonCost = 0, monthTransportCost = 0;

  // 週ごとの集計をしながらセルを描画するため、7日分ずつバッファする
  let weekBuf = [];
  const flushWeek = ()=>{
    let wRevenue = 0, wCost = 0;
    weekBuf.forEach(c=>{
      if(c){ wRevenue += c.revenue; wCost += c.cost; }
    });
    const wRatio = wRevenue>0 ? (wCost/wRevenue*100) : null;
    const col = costRatioColor(wRatio);
    const style = col ? `background:${col.bg};color:${col.text};` : '';
    html += `<div class="fin-cell week-total" style="${style}">
      <div class="fin-ratio">${wRatio!=null ? Math.round(wRatio)+'%' : '−'}</div>
    </div>`;
    weekBuf = [];
  };

  for(let i=0;i<startWeekday;i++){
    html += `<div class="fin-cell blank"></div>`;
    weekBuf.push(null);
  }

  for(let day=1; day<=daysInMonth; day++){
    const dateStr = toDateStr(S.finYear, S.finMonth, day);
    const status = getDayStatus(dateStr);
    let cellData = null;
    if(status.type==='open'){
      const fin = computeDayFinance(dateStr);
      cellData = fin;
      monthRevenue += fin.revenue;
      monthLessonCost += fin.lessonCost;
      monthTransportCost += fin.transportCost;
      const col = costRatioColor(fin.ratio);
      const style = col ? `background:${col.bg};color:${col.text};` : '';
      html += `<div class="fin-cell" style="${style}">
        <div class="fin-daynum">${day}</div>
        <div class="fin-ratio">${fin.ratio!=null ? Math.round(fin.ratio)+'%' : '−'}</div>
      </div>`;
    }else{
      html += `<div class="fin-cell none"><div class="fin-daynum">${day}</div><div class="fin-ratio">−</div></div>`;
    }
    weekBuf.push(cellData);

    const weekday = new Date(dateStr+'T00:00:00').getDay();
    if(weekday===6 || day===daysInMonth){ // 土曜、または月末で締める
      // 月末の場合、残りの空セルを埋めてから週計を出す
      if(day===daysInMonth && weekday!==6){
        for(let w=weekday+1; w<=6; w++){ html += `<div class="fin-cell blank"></div>`; weekBuf.push(null); }
      }
      flushWeek();
    }
  }

  grid.innerHTML = html;

  // 月次サマリー（講師コスト・交通費を分けて常時表示。コスト率のみトグルに応じて増減）
  const monthCostForRatio = monthLessonCost + (S.finIncludeTransport ? monthTransportCost : 0);
  const monthRatio = monthRevenue>0 ? (monthCostForRatio/monthRevenue*100) : null;
  const col = costRatioColor(monthRatio);
  document.getElementById('finMonthSummary').innerHTML = `
    <div class="fin-summary-item">
      <div class="fin-label">今月の売上</div>
      <div class="fin-value">¥${monthRevenue.toLocaleString()}</div>
    </div>
    <div class="fin-summary-item">
      <div class="fin-label">今月の講師コスト（コマ給）</div>
      <div class="fin-value">¥${monthLessonCost.toLocaleString()}</div>
    </div>
    <div class="fin-summary-item">
      <div class="fin-label">今月の交通費</div>
      <div class="fin-value">¥${monthTransportCost.toLocaleString()}</div>
    </div>
    <div class="fin-summary-item ratio">
      <div class="fin-label">コスト率（${S.finIncludeTransport?'交通費込':'交通費別'}）</div>
      <div class="fin-value" style="${col ? `color:${col.bg};` : ''}">${monthRatio!=null ? monthRatio.toFixed(1)+'%' : '−'}</div>
    </div>
  `;
}

// ---------- 週間時間割（確定済みのみ） ----------
// 月曜日の日付文字列を求める（週表示の基準日計算用）
function getWeekMonday(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  const dow = d.getDay(); // 0=日
  const diff = dow===0 ? -6 : (1-dow);
  d.setDate(d.getDate()+diff);
  return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}


function renderCalendarWeek(){
  renderCalendarWeekGrid(S.weekAxis);
}

function renderCalendarWeekGrid(axis){
  const wrap = document.getElementById('calWeekWrap');
  if(!wrap) return;
  if(!S.calWeekAnchor){
    S.calWeekAnchor = getWeekMonday(getTodayStr());
  }
  if(!S.dataReady || !S.studentDataReady){
    wrap.innerHTML = '<div class="loading">読み込み中…</div>';
    return;
  }

  const monday = new Date(S.calWeekAnchor+'T00:00:00');
  const weekDates = [];
  for(let i=0;i<6;i++){
    const d = new Date(monday);
    d.setDate(monday.getDate()+i);
    weekDates.push(toDateStr(d.getFullYear(), d.getMonth(), d.getDate()));
  }
  updateCalPeriodLabel();
  refreshCalToolbarSecondary();

  const filterStudent = S.calFilterStudentId ? S.students.find(s=>s.id===S.calFilterStudentId) : null;
  const filterTeacher = resolveFilterTeacher();

  const table = document.createElement('table');
  table.className = 'sched';

  let thead = '<thead><tr><th>\u6642\u9593\u5272</th>' + weekDates.map(ds=>{
    const status = getDayStatus(ds);
    const d = new Date(ds+'T00:00:00');
    const label = `${d.getMonth()+1}/${d.getDate()}(${WEEKDAY_JP[d.getDay()]})`;
    const closed = status.type!=='open';
    const headCls = closed ? 'closed-day-col' : 'week-date-head';
    const dateAttr = closed ? '' : ` data-date="${ds}"`;
    return `<th class="${headCls}"${dateAttr}>${label}${closed?`<br><span style="font-size:9px;font-weight:400;">${status.label||status.holidayName||status.closureLabel||'\u4f11'}</span>`:''}</th>`;
  }).join('') + '</tr></thead>';

  let tbody = '<tbody>';
  SLOTS.forEach((slot, si)=>{
    tbody += `<tr><th>${slot.label}<span class="time">${slot.time}</span></th>`;
    weekDates.forEach(ds=>{
      const status = getDayStatus(ds);
      if(status.type!=='open'){
        tbody += `<td class="sched-cell closed-day-col"><div class="cell-closed-label">${status.label||status.holidayName||status.closureLabel||'\u4f11\u6821'}</div></td>`;
        return;
      }
      if(filterStudent){
        const cellInner = buildWeekStudentFilterCell(filterStudent, ds, slot);
        tbody += `<td class="sched-cell week-date-cell" data-date="${ds}">${cellInner}</td>`;
        return;
      }
      if(filterTeacher){
        const cellInner = buildWeekTeacherFilterCell(filterTeacher, ds, slot);
        tbody += `<td class="sched-cell week-date-cell" data-date="${ds}">${cellInner}</td>`;
        return;
      }
      if(axis==='openings'){
        const cellInner = buildOpeningsAxisCell(ds, slot);
        if(!cellInner){
          tbody += `<td class="sched-cell week-date-cell" data-date="${ds}"><div class="sched-empty">\u7a7a\u304d\u306a\u3057</div></td>`;
        }else{
          tbody += `<td class="sched-cell week-date-cell" data-date="${ds}">${cellInner}</td>`;
        }
        return;
      }
      const list = getEffectiveDayAssignments(ds).filter(a=>a.slot===slot.id);
      const unassigned = getUnassignedRowsForDate(ds).filter(r=>r.slot.id===slot.id);
      if(list.length===0 && unassigned.length===0){
        tbody += `<td class="sched-cell week-date-cell is-empty" data-date="${ds}"><div class="sched-empty">\u4e88\u5b9a\u306a\u3057</div></td>`;
        return;
      }
      const totalCount = list.length + unassigned.length;
      const cellInner = axis==='student'
        ? buildStudentAxisCell(list) + buildWeekUnassignedStudentBoxes(unassigned)
        : buildTeacherAxisCell(list) + buildWeekUnassignedTeacherBlock(unassigned);
      tbody += `<td class="sched-cell week-date-cell" data-date="${ds}">
        <div class="sched-cell-inner">
          <div class="sched-total">\u5408\u8a08${totalCount}\u540d</div>
          <div class="sched-lesson-list">${cellInner}</div>
        </div>
      </td>`;
    });
    tbody += '</tr>';
  });
  tbody += '</tbody>';

  table.innerHTML = thead + tbody;
  wrap.innerHTML = '';
  const scrollDiv = document.createElement('div');
  scrollDiv.className = 'sched-scroll';
  scrollDiv.appendChild(table);
  wrap.appendChild(scrollDiv);
  bindWeekGridDateClicks(scrollDiv);
  document.dispatchEvent(new CustomEvent('calendar:rendered'));
}

function bindWeekGridDateClicks(root){
  root.querySelectorAll('.week-date-head[data-date], .week-date-cell[data-date]').forEach(el=>{
    el.addEventListener('click', ()=>{
      const dateStr = el.dataset.date;
      if(!dateStr || getDayStatus(dateStr).type !== 'open') return;
      S.calSelectedDate = dateStr;
      document.dispatchEvent(new CustomEvent('calendar:show-day', { detail: { dateStr } }));
    });
  });
}

// \u8b1b\u5e2b\u8ef8\uff1a\u30de\u30b9\u76ee\u306e\u4e2d\u306b\u8b1b\u5e2b\u306e\u7bb1\u3092\u4f5c\u308a\u3001\u305d\u306e\u4e2d\u306b\u62c5\u5f53\u751f\u5f92\u3092\u4e26\u3079\u308b\uff08\u5f93\u6765\u901a\u308a\uff09
function buildTeacherAxisCell(list){
  const byTeacher = {};
  list.forEach(a=>{
    if(!byTeacher[a.teacherId]) byTeacher[a.teacherId] = [];
    byTeacher[a.teacherId].push(a);
  });
  let boxesHtml = '';
  Object.keys(byTeacher).forEach(teacherId=>{
    const teacher = S.teachers.find(t=>t.id===teacherId);
    const entries = byTeacher[teacherId];
    let studentsHtml = '';
    entries.forEach(a=>{
      const student = S.students.find(s=>s.id===a.studentId);
      const studentName = student ? student.name : '(\u524a\u9664\u3055\u308c\u305f\u751f\u5f92)';
      const gLabel = student ? gradeLabel(student) : '';
      const level = student ? student.level : '';
      const c = level ? subjectColor(level, a.subject) : {bg:'#eee', text:'#333'};
      const autoBadge = a.source==='auto' ? '<span class="auto-badge">\u81ea\u52d5</span>' : '';
      const makeupBadge = a.kind==='makeup' ? '<span class="auto-badge" style="background:#fff;color:var(--ink);border:1px dashed var(--ink);">\u632f\u66ff</span>' : '';
      studentsHtml += `<div class="sched-student-row">
        <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${a.subject}</span>
        <span>${studentName}<span class="grade-tag">${gLabel}</span></span>${autoBadge}${makeupBadge}
      </div>`;
    });
    boxesHtml += `<div class="sched-teacher-group">
      <div class="sched-teacher-head">${teacherHonorific(teacher)}<span class="sched-cap">\uff08${entries.length}/${S.teacherCapacity}\uff09</span></div>
      <div class="sched-teacher-students">${studentsHtml}</div>
    </div>`;
  });
  return boxesHtml;
}

function buildWeekFlowBadge(isPending, isDraft, isWaiting){
  if(isPending) return '<span class="cal-status-chip is-unassigned">講師なし</span>';
  if(isDraft) return '<span class="cal-status-chip is-tentative-outline">仮決め</span>';
  if(isWaiting) return '<span class="cal-status-chip is-waiting">承認待ち</span>';
  return '';
}

// 週間カレンダー：生徒カード（案R1 — 学年（小4）・フローバッジ右上・自動バッジなし）
function buildWeekLessonCard({ subject, subjectStyle, studentName, gradeLabel, teacher, isPending, isDraft = false, isWaiting = false, makeupBadge = '' }){
  const subjectAbbr = SUBJECT_ABBR[subject] || subject.slice(0, 1);
  const gradeHtml = gradeLabel ? `<span class="grade-tag">（${gradeLabel}）</span>` : '';
  const flowBadge = buildWeekFlowBadge(isPending, isDraft, isWaiting);
  const flowBadgeHtml = flowBadge ? `<span class="sched-card-flow-badge">${flowBadge}</span>` : '';
  const teacherText = isPending
    ? '<span class="sched-card-meta-value is-pending">—</span>'
    : `<span class="sched-card-meta-value">${teacherHonorific(teacher)}</span>`;
  return `<div class="sched-lesson-card${flowBadge ? ' has-flow-badge' : ''}">
    ${flowBadgeHtml}
    <div class="sched-card-row1 sched-card-row1--inline">
      <span class="sched-student-tag" style="background:${subjectStyle.bg};color:${subjectStyle.text};">${subjectAbbr}</span>
      <span class="sched-card-name-line">${studentName}${gradeHtml}${makeupBadge}</span>
    </div>
    <div class="sched-card-row2 sched-card-row2--grid">
      <span class="sched-card-meta-label">講師</span>
      ${teacherText}
    </div>
  </div>`;
}

// 生徒軸：マス目の中に生徒の箱を作り、その中に担当講師を入れる（主語を入れ替える）
function buildStudentAxisCell(list){
  return list.map(a=>{
    const student = S.students.find(s=>s.id===a.studentId);
    const studentName = student ? student.name : '(\u524a\u9664\u3055\u308c\u305f\u751f\u5f92)';
    const gLabel = student ? gradeLabel(student) : '';
    const level = student ? student.level : '';
    const c = level ? subjectColor(level, a.subject) : {bg:'#eee', text:'#333'};
    const teacher = S.teachers.find(t=>t.id===a.teacherId);
    const makeupBadge = a.kind==='makeup' ? '<span class="auto-badge" style="background:#fff;color:var(--ink);border:1px dashed var(--ink);">\u632f\u66ff</span>' : '';
    return buildWeekLessonCard({
      subject: a.subject,
      subjectStyle: c,
      studentName,
      gradeLabel: gLabel,
      teacher,
      isPending: false,
      isDraft: !!a.draft,
      isWaiting: !!a.pending,
      makeupBadge,
    });
  }).join('');
}

function buildWeekUnassignedStudentBoxes(unassignedRows){
  return unassignedRows.map(row=>{
    const { student, course } = row;
    const c = subjectColor(student.level, course.subject);
    return buildWeekLessonCard({
      subject: course.subject,
      subjectStyle: c,
      studentName: student.name,
      gradeLabel: gradeLabel(student),
      teacher: null,
      isPending: true,
    });
  }).join('');
}

function buildWeekUnassignedTeacherBlock(unassignedRows){
  return unassignedRows.map(row=>{
    const c = subjectColor(row.student.level, row.course.subject);
    return buildWeekLessonCard({
      subject: row.course.subject,
      subjectStyle: c,
      studentName: row.student.name,
      gradeLabel: gradeLabel(row.student),
      teacher: null,
      isPending: true,
    });
  }).join('');
}

// \u751f\u5f92\u7d5e\u308a\u8fbc\u307f\u6642\uff1a\u6708\u9593\u30ab\u30ec\u30f3\u30c0\u30fc\u3068\u540c\u3058 cal-entry \u5f62\u5f0f\u3067\u8868\u793a\u3059\u308b
function buildWeekStudentFilterCell(student, dateStr, slot){
  const rows = getStudentDateRows(student, dateStr).filter(r=>r.slot.id===slot.id);
  if(rows.length===0){
    return '<div class="sched-empty">—</div>';
  }
  const lines = rows.map(r=> studentRowToCalLine(r, student));
  return calLinesToEntriesHtml(lines);
}

function buildWeekTeacherFilterCell(teacher, dateStr, slot){
  const list = getEffectiveDayAssignments(dateStr).filter(a=>a.teacherId===teacher.id && a.slot===slot.id);
  if(list.length===0){
    return '<div class="sched-empty">—</div>';
  }
  let studentsHtml = '';
  list.forEach(a=>{
    const student = S.students.find(s=>s.id===a.studentId);
    const studentName = student ? student.name : '(削除された生徒)';
    const gLabel = student ? gradeLabel(student) : '';
    const level = student ? student.level : '';
    const c = level ? subjectColor(level, a.subject) : {bg:'#eee', text:'#333'};
    const autoBadge = a.source==='auto' ? '<span class="auto-badge">自動</span>' : '';
    const makeupBadge = a.kind==='makeup' ? '<span class="auto-badge" style="background:#fff;color:var(--ink);border:1px dashed var(--ink);">振替</span>' : '';
    const stateBadge = a.draft
      ? '<span class="week-status-tag tentative">仮</span>'
      : (a.pending ? '<span class="week-status-tag waiting">承認待ち</span>' : '');
    studentsHtml += `<div class="sched-student-row">
      <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${a.subject}</span>
      <span>${studentName}<span class="grade-tag">${gLabel}</span></span>${autoBadge}${makeupBadge}${stateBadge}
    </div>`;
  });
  return `<div class="sched-teacher-group">
    <div class="sched-teacher-head">${teacherHonorific(teacher)}<span class="sched-cap">（${list.length}/${S.teacherCapacity}）</span></div>
    <div class="sched-teacher-students">${studentsHtml}</div>
  </div>`;
}

// 学年×教科の人数サマリーグリッド（講師基本スケジュール・週間空き状況で共用）
function buildSubjectSummaryGrid(teachers, opts = {}){
  const { filterLevel = null, filterSubject = null } = opts;
  const subjectColCount = (filterLevel && filterSubject) ? 1 : 5;
  let gridCells = '';
  LEVELS_ORDER.forEach(lv=>{
    if(filterLevel && filterLevel !== lv) return;
    gridCells += `<span class="cell-summary-level">${lv}</span>`;
    SUBJECT_MAP[lv].forEach(sub=>{
      if(filterSubject && filterSubject !== sub) return;
      const n = teachers.filter(t=>t.subjects.some(s=>s.level===lv && s.subject===sub)).length;
      const c = subjectColor(lv, sub);
      if(n===0){
        gridCells += `<span class="sum-tag sum-tag-empty" style="border-color:${c.border};color:${c.border};">${SUBJECT_ABBR[sub]}0</span>`;
      }else{
        gridCells += `<span class="sum-tag" style="background:${c.bg};color:${c.text};border-color:${c.border};">${SUBJECT_ABBR[sub]}${n}</span>`;
      }
    });
  });
  if(!gridCells) return '';
  return `<div class="cell-summary-grid" style="--sum-cols:${subjectColCount}">${gridCells}</div>`;
}

// 空き状況軸：マス目の中に「講師の箱」を作り、その講師が対応可能な教科タグ＋あと何人入れるかを表示する
function buildOpeningsAxisCell(dateStr, slot){
  const {rows} = computeTeacherOpenings(dateStr, null);
  const slotRows = rows.filter(r=>r.slot.id===slot.id && r.kind!=='full');
  if(slotRows.length===0) return null;
  const availTeachers = slotRows.map(r=>r.teacher);
  const summaryGrid = buildSubjectSummaryGrid(availTeachers);
  const showSubjects = S.calOpeningsShowSubjects;
  let boxesHtml = '';
  slotRows.forEach(r=>{
    const mark = r.state==='preferred' ? '\u25cb' : '\u25b3';
    const label = r.kind==='empty' ? '\u7a7a\u304d' : `\u3042\u3068${r.remaining}\u4eba`;
    const subjectTags = r.teacher.subjects.map(s=>{
      const c = subjectColor(s.level, s.subject);
      return `<span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${abbr(s.level, s.subject)}</span>`;
    }).join('');
    const tagsRow = showSubjects
      ? `<div class="sched-student-row opening-subject-tags">${subjectTags}</div>`
      : '';
    boxesHtml += `<div class="sched-teacher-box opening-box ${r.kind}">
      <div class="sched-teacher-name">${teacherHonorific(r.teacher)}<span class="opening-mark ${r.kind}">${mark} ${label}</span></div>
      ${tagsRow}
    </div>`;
  });
  return `<div class="opening-cell-inner">
    <div class="cell-summary opening-cell-summary">
      <div class="cell-total cell-total-openings">空き：${slotRows.length}人</div>
      ${summaryGrid}
    </div>
    <div class="opening-cell-teachers">${boxesHtml}</div>
  </div>`;
}

// ---------- matrix ----------
function renderMatrix(){
  const wrap = document.getElementById('matrixWrap');
  if(!S.dataReady){
    wrap.innerHTML = '<div class="loading">読み込み中…</div>';
    return;
  }
  if(S.teachers.length===0){
    wrap.innerHTML = '<div class="empty-state">講師が登録されるとここに一覧表が表示されます。<br>まずは「講師登録」タブから登録してください。</div>';
    return;
  }
  const filterVal = document.getElementById('subjectFilter').value;
  let filterLevel = null, filterSubject = null, filterAbbr = null;
  if(filterVal){
    [filterLevel, filterSubject] = filterVal.split('-');
    filterAbbr = abbr(filterLevel, filterSubject);
  }

  const table = document.createElement('table');
  table.className = 'matrix';

  let thead = '<thead><tr><th>時間割</th>' + DAYS.map(d=>`<th data-day="${d}" class="${S.regularClosedDays.includes(d)?'closed-day-col':''}">${d}曜日${S.regularClosedDays.includes(d)?'<br><span style="font-size:9px;font-weight:400;">定休日</span>':''}</th>`).join('') + '</tr></thead>';

  let tbody = '<tbody>';
  SLOTS.forEach((slot, si)=>{
    tbody += `<tr class="${si===0?'day-start':''}"><th>${slot.label}<span class="time">${slot.time}</span></th>`;
    DAYS.forEach(day=>{
      if(S.regularClosedDays.includes(day)){
        tbody += `<td class="cell closed-day-col" data-day="${day}"><div class="cell-closed-label">定休日</div></td>`;
        return;
      }
      // その曜日・コマに「基本的に対応可能」と登録時に申告している講師を抽出（実際の月次提出とは無関係）
      let avail = S.teachers.filter(t => (t.baseAvailability||[]).some(e=>e.day===day && e.slot===slot.id));
      if(filterVal){
        avail = avail.filter(t => t.subjects.some(s=>s.level===filterLevel && s.subject===filterSubject));
      }

      if(avail.length===0){
        tbody += `<td class="cell"><div class="cell-empty">対応可能な講師なし</div></td>`;
        return;
      }

      // 講師名（○/△付き、1行・改行なし）
      let teacherLines = '';
      avail.forEach(t=>{
        const entry = (t.baseAvailability||[]).find(e=>e.day===day && e.slot===slot.id);
        const isPreferred = entry && entry.priority==='preferred';
        const mark = isPreferred ? '○' : '△';
        teacherLines += `<div class="cell-t"><span class="t-mark ${isPreferred?'mark-preferred':'mark-normal'}">${mark}</span><span class="t-name">${t.name}</span></div>`;
      });

      // 学年別・全5教科の対応可能人数（0人の教科は点線枠で「人がいない」ことを強調）
      const summaryGrid = buildSubjectSummaryGrid(avail, { filterLevel, filterSubject });

      tbody += `<td class="cell">
        <div class="cell-summary">
          <div class="cell-total">コマ合計：${avail.length}人</div>
          ${summaryGrid}
        </div>
        <div class="cell-teachers">${teacherLines}</div>
      </td>`;
    });
    tbody += '</tr>';
  });
  tbody += '</tbody>';

  table.innerHTML = thead + tbody;
  wrap.innerHTML = '';
  const scrollDiv = document.createElement('div');
  scrollDiv.className = 'matrix-scroll';
  scrollDiv.appendChild(table);
  wrap.appendChild(scrollDiv);
}

// ---------- legend ----------
function renderLegend(){
  const el = document.getElementById('colorLegend');
  if(!el) return;
  const subjectsShown = ['国語','数学','英語','理科','社会']; // 算数は数学と同色のため代表表示
  let html = '<span class="legend-note">色＝教科／濃さ＝小・中・高</span>';
  subjectsShown.forEach(sub=>{
    const shades = ['小学','中学','高校'].map(lv=>subjectColor(lv, sub==='数学' && lv==='小学' ? '算数' : sub).bg);
    html += `<span class="legend-item"><span class="legend-label">${sub}</span><span class="legend-shades">${shades.map(bg=>`<span style="background:${bg};"></span>`).join('')}</span></span>`;
  });
  el.innerHTML = html;
}

function switchView(name){
  if(name !== 'calendar'){
    document.dispatchEvent(new CustomEvent('matching:force-close'));
  }
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b.dataset.view===name));
  document.getElementById('view-calendar').classList.toggle('active', name==='calendar');
  document.getElementById('view-manage').classList.toggle('active', name==='manage');
  document.getElementById('view-teacherSchedule').classList.toggle('active', name==='teacherSchedule');
  document.getElementById('view-student').classList.toggle('active', name==='student');
  document.getElementById('view-finance').classList.toggle('active', name==='finance');
  document.getElementById('view-settings').classList.toggle('active', name==='settings');
  if(name==='calendar') renderCalendar();
  if(name==='student') renderMatching();
  if(name==='manage'){ renderTeacherList(); renderMatrix(); }
  if(name==='teacherSchedule') renderTeacherScheduleTab();
  if(name==='finance') renderFinance();
}

// カレンダー内の表示モード切替（月間予定／週間予定／講師空き状況）
function switchCalMode(mode){
  S.calMode = mode;
  document.getElementById('calModeMonth').style.display = (mode==='month') ? '' : 'none';
  document.getElementById('calModeWeek').style.display = (mode==='week') ? '' : 'none';
  if(mode==='month') renderCalendar();
  if(mode==='week'){
    const monthStart = toDateStr(S.calYear, S.calMonth, 1);
    const monthEnd = toDateStr(S.calYear, S.calMonth+1, 0);
    if(!S.calWeekAnchor || S.calWeekAnchor < monthStart || S.calWeekAnchor > monthEnd){
      S.calWeekAnchor = computeSyncedWeekAnchor(S.calYear, S.calMonth);
    }
    renderCalendarWeek();
  }else{
    refreshCalToolbarSecondary();
    updateCalPeriodLabel();
  }
}

function toggleCalMode(){
  switchCalMode(S.calMode==='month' ? 'week' : 'month');
}


export { renderFinance, getWeekMonday, renderCalendarWeek, renderCalendarWeekGrid, buildTeacherAxisCell, buildStudentAxisCell, buildOpeningsAxisCell, buildWeekStudentFilterCell, renderMatrix, renderLegend, switchView, switchCalMode, toggleCalMode };
