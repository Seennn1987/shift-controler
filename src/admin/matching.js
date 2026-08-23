import { DAYS, SLOTS, WEEKDAY_JP, WEEK_FULL, LEVELS_ORDER } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr, getTodayStr } from '../shared/date-utils.js';
import { firebaseConfig, fbAuth, fbDb, STORAGE_KEY, getSecondaryAuth, S } from './state.js';
import { findAbsenceFor } from './absences.js';
import { getDayStatus, getUnassignedRowsForDate, renderCalendar } from './calendar.js';
import { refreshCalFilterOptions, setCalFilterStudent, setCalFilterTeacher, refreshAllPersonComboboxes } from './filter-ui.js';
import { sortByNameKana } from '../shared/person-sort.js';
import { renderCalendarWeek, switchCalMode, switchView } from './finance-ui.js';
import { gradeLabel, isTeacherAvailableOnDate, subjectColor } from './schedule-core.js';
import { saveStudents, scheduleSave, scheduleSyncTeacherAssignments } from './students-persistence.js';
import { assignmentAppliesOnDate, buildCandidateInfo, confirmAssignment, countAssignmentsInMonth, cancelAllDrafts, cancelDraftAuto, findEffectiveAssignment, getActiveYearMonth, getPreferredTeachersForCourse, isAssignmentEffectiveInMonth, sendDraftAssignments, teacherHasSubmittedMonth } from './teacher-schedule-tab.js';
import { compareCandidateInfo, getMatchingPriority, MATCHING_FACTOR_META } from './matching-config.js';
import { showActiveTabNotice } from '../shared/inline-confirm.js';
import { dismissAppConfirmDialog, runAppConfirmDialog } from '../shared/app-confirm-dialog.js';
import {
  buildApprovalAlertRowHtml, buildCalAlertPersonHead, buildCalAlertPersonInline,
  buildCalAlertSubjectTag, buildCalAlertWhenPill,
  buildShortageAlertRowHtml, calAlertDateParts,
} from '../shared/cal-alert-row.js';
import {
  normalizeFormCoursesForSave,
  renderStudentCourseCalendar,
  resetCourseCalendarSelection,
} from './student-course-calendar.js';

// ---- 一括自動仮組み ----
// 表示中の月の各開校日について、未確定の希望コマを日付単位で自動的に埋める。
// 候補が少ない（融通が利かない）枠から優先。講師選定は compareCandidateInfo に従う。
function bulkAutoAssign(){
  const ym = S.referenceYearMonth;
  const pending = [];

  for(let d = 1; d <= daysInYearMonth(ym); d++){
    const dateStr = `${ym}-${pad2(d)}`;
    const status = getDayStatus(dateStr);
    if(status.type !== 'open') continue;
    const weekday = status.weekday;

    S.students.forEach(s=>{
      s.courses.forEach(course=>{
        course.desiredSlots.forEach(ds=>{
          if(ds.day !== weekday) return;
          if(S.regularClosedDays.includes(ds.day)) return;
          if(findAbsenceFor(s.id, course.id, dateStr, ds.day, ds.slot)) return;
          if(findEffectiveAssignment(s.id, course.id, ds.day, ds.slot, ym, dateStr)) return;

          const candidateCount = S.teachers
            .filter(t=> isTeacherAvailableOnDate(t.id, dateStr, ds.slot) &&
              t.subjects.some(ts=> ts.level === s.level && ts.subject === course.subject))
            .map(t=> buildCandidateInfo(s.id, course.id, s.level, course.subject, ds.day, ds.slot, t, dateStr))
            .filter(c=> !c.full).length;

          pending.push({
            dateStr, studentId: s.id, courseId: course.id, subject: course.subject,
            day: ds.day, slot: ds.slot, candidateCount,
          });
        });
      });
    });
  }

  pending.sort((a, b)=> a.candidateCount - b.candidateCount);

  let filled = 0, skipped = 0;
  pending.forEach(p=>{
    if(p.candidateCount === 0){ skipped++; return; }
    if(findEffectiveAssignment(p.studentId, p.courseId, p.day, p.slot, ym, p.dateStr)){ skipped++; return; }
    if(findAbsenceFor(p.studentId, p.courseId, p.dateStr, p.day, p.slot)){ skipped++; return; }

    const student = S.students.find(s=> s.id === p.studentId);
    if(!student){ skipped++; return; }

    const candidates = S.teachers
      .filter(t=> isTeacherAvailableOnDate(t.id, p.dateStr, p.slot) &&
        t.subjects.some(ts=> ts.level === student.level && ts.subject === p.subject))
      .map(t=> buildCandidateInfo(p.studentId, p.courseId, student.level, p.subject, p.day, p.slot, t, p.dateStr))
      .filter(c=> !c.full)
      .sort(compareCandidateInfo);

    if(candidates.length === 0){ skipped++; return; }

    const result = confirmAssignment(
      p.studentId, p.courseId, p.subject, p.day, p.slot,
      candidates[0].teacher.id, 'auto', { dateStr: p.dateStr },
    );
    if(result.ok) filled++; else skipped++;
  });

  return { filled, skipped, total: pending.length };
}

// 下書きのうち source==='auto' だけをまとめて解除する（送信済み・確定済みには触れない）
function bulkCancelAuto(){
  return cancelDraftAuto();
}


function buildStudentLevelArea(){
  const area = document.getElementById('studentLevelArea');
  area.innerHTML = '';
  LEVELS_ORDER.forEach((lv, i)=>{
    const id = `slevel-${lv}`;
    const chip = document.createElement('label');
    chip.className = 'chip';
    chip.innerHTML = `<input type="radio" name="studentLevel" id="${id}" value="${lv}" ${i===0?'checked':''}><span>${lv}</span>`;
    area.appendChild(chip);
  });
  area.querySelectorAll('input[name=studentLevel]').forEach(r=>{
    r.addEventListener('change', ()=>{
      // 学年を変えると対象教科が変わるため、未確定の受講科目はリセットする
      S.formCourses = [];
      renderFormCourses();
    });
  });
}

function getSelectedStudentLevel(){
  const checked = document.querySelector('input[name=studentLevel]:checked');
  return checked ? checked.value : LEVELS_ORDER[0];
}

// ---- 受講科目（コース）ビルダー ----
// S.formCourses: フォーム入力中の作業用データ。保存時に student.courses として確定する。
function genCourseId(){ return 'c-'+Date.now()+'-'+Math.random().toString(36).slice(2,7); }

function renderFormCourses(){
  const level = getSelectedStudentLevel();
  const wrap = document.getElementById('courseList');
  if(!S.editingStudentId){
    wrap.innerHTML = '<p class="scc-locked-hint">先に「基本情報を登録」を押してください。登録後、ここで希望コマを選べます。</p>';
    renderStudentMatchingAction();
    return;
  }
  renderStudentCourseCalendar(wrap, {
    formCourses: S.formCourses,
    level,
    genCourseId,
    onChange: async ()=>{
      await persistFormCourses();
      renderFormCourses();
    },
  });
  renderStudentMatchingAction();
}

function updateStudentFormUi(){
  const name = document.getElementById('studentNameInput').value.trim();
  const isEdit = Boolean(S.editingStudentId);
  document.getElementById('studentFormModeTitle').textContent = isEdit ? `${name || '生徒'} さんを編集` : '生徒を登録';
  document.getElementById('studentSaveBtn').textContent = isEdit ? '基本情報を更新' : '基本情報を登録';
  document.getElementById('studentCancelBtn').style.display = isEdit ? 'inline-block' : 'none';
}

function renderStudentMatchingAction(){
  const el = document.getElementById('studentMatchingAction');
  if(!el) return;
  if(!S.editingStudentId){
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  const courses = normalizeFormCoursesForSave(S.formCourses);
  if(courses.length === 0){
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.hidden = false;
  el.innerHTML = `
    <button type="button" class="primary" id="studentGoMatchingBtn">コマを組む →</button>
    <p class="field-hint tight">カレンダー画面の右パネルで、候補講師から講師を決められます。</p>`;
  el.querySelector('#studentGoMatchingBtn')?.addEventListener('click', ()=>{
    if(S.editingStudentId) openStudentMatching(S.editingStudentId);
  });
}

async function persistFormCourses(){
  if(!S.editingStudentId) return;
  const idx = S.students.findIndex(s=> s.id === S.editingStudentId);
  if(idx < 0) return;
  const courses = normalizeFormCoursesForSave(S.formCourses);
  S.students[idx].courses = JSON.parse(JSON.stringify(courses));
  await saveStudents();
  renderStudentList();
  renderMatching();
}

function resetStudentForm(){
  S.editingStudentId = null;
  resetCourseCalendarSelection();
  document.getElementById('studentNameInput').value = '';
  document.getElementById('studentNameKanaInput').value = '';
  document.getElementById('studentGradeInput').value = '';
  document.querySelectorAll('input[name=studentLevel]').forEach((r,i)=> r.checked = (i===0));
  S.formCourses = [];
  renderFormCourses();
  document.getElementById('studentFormMsg').textContent = '';
  updateStudentFormUi();
  renderStudentMatchingAction();
  renderStudentList();
}

function fillStudentFormForEdit(s){
  S.editingStudentId = s.id;
  document.getElementById('studentNameInput').value = s.name;
  document.getElementById('studentNameKanaInput').value = s.nameKana || '';
  document.getElementById('studentGradeInput').value = s.grade ? String(s.grade) : '';
  document.querySelectorAll('input[name=studentLevel]').forEach(r=> r.checked = (r.value===s.level));
  S.formCourses = JSON.parse(JSON.stringify(s.courses));
  renderFormCourses();
  document.getElementById('studentFormMsg').textContent = '';
  updateStudentFormUi();
  renderStudentList();
  switchView('student');
  window.scrollTo({top:0, behavior:'smooth'});
}

async function handleStudentSave(){
  const msg = document.getElementById('studentFormMsg');
  const name = document.getElementById('studentNameInput').value.trim();
  if(!name){ msg.textContent = '生徒名を入力してください。'; return; }
  const nameKana = document.getElementById('studentNameKanaInput').value.trim();
  if(!nameKana){ msg.textContent = '読み仮名を入力してください。'; return; }

  const level = getSelectedStudentLevel();
  let grade = parseInt(document.getElementById('studentGradeInput').value, 10);
  if(!Number.isFinite(grade) || grade<1 || grade>6) grade = null;

  const courses = normalizeFormCoursesForSave(S.formCourses);
  const coursesCopy = JSON.parse(JSON.stringify(courses));

  if(S.editingStudentId){
    const idx = S.students.findIndex(s=>s.id===S.editingStudentId);
    if(idx>-1){
      S.students[idx] = { ...S.students[idx], name, nameKana, level, grade, courses: coursesCopy };
    }
    msg.textContent = '基本情報を更新しました。';
  }else{
    const id = 's-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);
    S.students.push({ id, name, nameKana, level, grade, courses: coursesCopy });
    S.editingStudentId = id;
    msg.textContent = '基本情報を登録しました。続けて希望コマを選んでください。';
  }
  await saveStudents();
  updateStudentFormUi();
  renderFormCourses();
  renderStudentList();
  renderMatching();
}

function getStudentListStatus(student){
  const ym = S.referenceYearMonth;
  let totalSlots = 0;
  let pendingSlots = 0;
  (student.courses || []).forEach(course=>{
    (course.desiredSlots || []).forEach(ds=>{
      totalSlots++;
      if(!findEffectiveAssignment(student.id, course.id, ds.day, ds.slot, ym)){
        pendingSlots++;
      }
    });
  });
  if(totalSlots === 0){
    return { kind:'no-slots', label:'希望未設定', priority:0, pendingSlots:0, totalSlots:0 };
  }
  if(pendingSlots > 0){
    return { kind:'pending', label:`未確定 ${pendingSlots}`, priority:1, pendingSlots, totalSlots };
  }
  return { kind:'done', label:'確定済み', priority:2, pendingSlots:0, totalSlots };
}

function openStudentMatching(studentId){
  S.matchingReturnToStudentId = studentId;
  switchView('calendar');
  switchCalMode('month');
  document.dispatchEvent(new CustomEvent('matching:go-student-month', {
    detail: { studentId },
  }));
}

function renderStudentList(){
  scheduleSave();
  const wrap = document.getElementById('studentList');
  const sorted = sortByNameKana(S.students, s=> s.nameKana, s=> s.name);
  const filterId = document.getElementById('studentListFilter')?.value || '';
  const visible = filterId
    ? sorted.filter(s=> s.id === filterId)
    : sorted;
  if(S.students.length===0){
    wrap.innerHTML = '<div class="empty-note">まだ生徒が登録されていません。上のフォームから登録してください。</div>';
    return;
  }
  if(visible.length===0){
    wrap.innerHTML = '<div class="empty-note">検索に一致する生徒がいません。</div>';
    return;
  }

  const rows = visible
    .map(student=>({ student, status: getStudentListStatus(student) }))
    .sort((a, b)=>{
      if(a.status.priority !== b.status.priority) return a.status.priority - b.status.priority;
      return sorted.indexOf(a.student) - sorted.indexOf(b.student);
    });

  wrap.innerHTML = rows.map(({ student:s, status })=>{
    const isEditing = S.editingStudentId === s.id;
    const tags = (s.courses || []).map(course=>{
      const c = subjectColor(s.level, course.subject);
      const prefTeachers = getPreferredTeachersForCourse(s.id, course.id);
      const prefLabel = prefTeachers.length
        ? prefTeachers.map(t=> `${t.name}先生`).join('、')
        : '未設定';
      return `<div class="student-row-course">
        <span class="student-row-tag" style="background:${c.bg};color:${c.text};border:1px solid ${c.border};">${course.subject} 週${course.weeklyCount}</span>
        <span class="student-row-pref">担当：${prefLabel}</span>
      </div>`;
    }).join('');
    const tagsHtml = tags
      ? `<div class="student-row-tags">${tags}</div>`
      : '<div class="student-row-tags is-empty"><span class="student-row-no-tags">希望コマ未設定</span></div>';
    const matchBtn = status.pendingSlots > 0
      ? `<button type="button" class="match-btn" data-id="${s.id}">講師を決める</button>`
      : '';
    return `<div class="student-row${isEditing ? ' is-editing' : ''}${status.priority < 2 ? ' needs-action' : ''}">
      <span class="student-row-status is-${status.kind}">${status.label}</span>
      <div class="student-row-main">
        <div class="student-row-head">
          <span class="student-row-name">${s.name}</span>
          <span class="student-level-badge">${gradeLabel(s)}</span>
          ${isEditing ? '<span class="student-row-editing-badge">編集中</span>' : ''}
        </div>
        ${tagsHtml}
      </div>
      <div class="row-actions student-row-actions">
        <button type="button" class="edit-btn" data-id="${s.id}">編集</button>
        ${matchBtn}
        <button type="button" class="del-btn" data-id="${s.id}">削除</button>
      </div>
    </div>`;
  }).join('');

  wrap.querySelectorAll('.edit-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      const s = S.students.find(x=>x.id===b.dataset.id);
      if(s) fillStudentFormForEdit(s);
    });
  });
  wrap.querySelectorAll('.match-btn').forEach(b=>{
    b.addEventListener('click', ()=> openStudentMatching(b.dataset.id));
  });
  wrap.querySelectorAll('.del-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(b.dataset.confirming){
        deleteStudent(b.dataset.id);
      }else{
        b.dataset.confirming = '1';
        b.textContent = '本当に削除しますか？';
        setTimeout(()=>{ b.dataset.confirming=''; b.textContent='削除'; }, 3000);
      }
    });
  });
}

async function deleteStudent(id){
  S.students = S.students.filter(s=>s.id!==id);
  S.assignments = S.assignments.filter(a=>a.studentId!==id);
  await saveStudents();
  if(S.editingStudentId===id) resetStudentForm();
  renderStudentList();
  renderMatching();
}

// マッチングデータ変更後に、関連画面をまとめて更新する（旧 renderMatching の副作用部分）
function refreshAfterMatchingChange(){
  scheduleSave();
  scheduleSyncTeacherAssignments();
  renderShortageDashboard();
  renderStudentList();
  renderTeacherList();
  refreshAllPersonComboboxes();
  if(document.getElementById('view-calendar') && document.getElementById('view-calendar').classList.contains('active')){
    if(S.calMode==='week') renderCalendarWeek();
    else renderCalendar();
    if(S.calSelectedDate && S.matchingPanelOpen){
      document.dispatchEvent(new CustomEvent('calendar:refresh-day', { detail: { dateStr: S.calSelectedDate } }));
    }
  }
}

/** @deprecated 互換用。refreshAfterMatchingChange を呼ぶ */
function renderMatching(){
  refreshAfterMatchingChange();
}

// 未確定コマ一覧：日付詳細パネルと同じ getUnassignedRowsForDate で列挙
function collectUpcomingUnassignedByDate(){
  const ym = getActiveYearMonth();
  const today = getTodayStr();
  const groups = [];
  const days = daysInYearMonth(ym);
  for(let d = 1; d <= days; d++){
    const dateStr = `${ym}-${pad2(d)}`;
    if(dateStr < today) continue;
    const rows = getUnassignedRowsForDate(dateStr);
    if(rows.length === 0) continue;
    groups.push({ dateStr, rows });
  }
  return groups;
}

function collectUpcomingUnassignedFlat(){
  const flat = [];
  collectUpcomingUnassignedByDate().forEach(group=>{
    group.rows.forEach(row=> flat.push({ dateStr: group.dateStr, row }));
  });
  return flat;
}

function collectUpcomingDraftsFlat(){
  const ym = getActiveYearMonth();
  const today = getTodayStr();
  const flat = [];
  const days = daysInYearMonth(ym);
  for(let d = 1; d <= days; d++){
    const dateStr = `${ym}-${pad2(d)}`;
    if(dateStr < today) continue;
    if(getDayStatus(dateStr).type !== 'open') continue;
    S.draftAssignments.forEach(a=>{
      if(!isAssignmentEffectiveInMonth(a, ym)) return;
      if(!assignmentAppliesOnDate(a, dateStr)) return;
      if(findAbsenceFor(a.studentId, a.courseId, dateStr, a.day, a.slot)) return;
      const student = S.students.find(s=> s.id === a.studentId);
      if(!student) return;
      const course = student.courses.find(c=> c.id === a.courseId);
      if(!course) return;
      const slot = SLOTS.find(sl=> sl.id === a.slot);
      if(!slot) return;
      const teacher = S.teachers.find(t=> t.id === a.teacherId);
      flat.push({ dateStr, student, course, slot, teacher, assignment: a });
    });
  }
  flat.sort((a, b)=>
    a.dateStr.localeCompare(b.dateStr)
    || a.slot.id - b.slot.id
    || a.student.name.localeCompare(b.student.name, 'ja'),
  );
  return flat;
}

function shortageRowAriaLabel(dateStr, slot, student, course){
  const { md, weekday } = calAlertDateParts(dateStr, getDayStatus);
  const gLabel = gradeLabel(student);
  return `${md}（${weekday}）${slot.label} ${student.name}（${gLabel}）${course.subject}`;
}

function monthHasSubmittedTeachers(yearMonth){
  return S.teachers.some(t=> teacherHasSubmittedMonth(t.id, yearMonth));
}

function expandShortageBar(){
  const detail = document.getElementById('shortageDetailWrap');
  const btn = document.getElementById('shortageToggleBtn');
  if(!detail || !btn) return;
  detail.style.display = 'block';
  btn.setAttribute('aria-expanded', 'true');
  const chevron = btn.querySelector('.cal-status-chevron');
  if(chevron) chevron.textContent = '▴';
}

function buildShortageSummaryLine({ draftCount, unassignedCount, pendingCount, pendingAbsences }){
  const parts = [];
  if(draftCount > 0) parts.push(`仮決め ${draftCount}件`);
  if(unassignedCount > 0) parts.push(`未確定 ${unassignedCount}コマ`);
  if(pendingCount > 0) parts.push(`承認待ち ${pendingCount}件`);
  if(pendingAbsences > 0) parts.push(`未振替 ${pendingAbsences}件`);
  return parts.join(' ／ ') || '✓ すべて確定です';
}

function getUpcomingAutoDraftIds(){
  const ids = new Set();
  collectUpcomingDraftsFlat().forEach(entry=>{
    if(entry.assignment.source === 'auto') ids.add(entry.assignment.id);
  });
  return ids;
}

function cancelUpcomingAutoDrafts(){
  const ids = getUpcomingAutoDraftIds();
  const count = S.draftAssignments.filter(a=> ids.has(a.id)).length;
  S.draftAssignments = S.draftAssignments.filter(a=> !ids.has(a.id));
  return count;
}

function buildMatchingAlgorithmExtraHtml(){
  const priority = getMatchingPriority();
  const enabled = priority.filter(item=> item.enabled);
  if(enabled.length === 0){
    return `<div class="app-confirm-algorithm">
      <div class="app-confirm-algorithm-label">自動マッチングの決め方</div>
      <p class="app-confirm-algorithm-empty">有効な条件がありません。「設定で変更」から見直してください。</p>
      <button type="button" class="app-confirm-settings-link" id="appConfirmSettingsLink">設定で変更</button>
    </div>`;
  }
  const pickItems = enabled.map((item, idx)=>{
    const meta = MATCHING_FACTOR_META[item.id];
    const title = meta?.title || meta?.label || item.id;
    const desc = meta?.description || '';
    return `<li class="app-confirm-algorithm-pick">
      <span class="app-confirm-algorithm-pick-title">${idx + 1}. ${title}</span>
      ${desc ? `<span class="app-confirm-algorithm-pick-desc">${desc}</span>` : ''}
    </li>`;
  }).join('');
  return `<div class="app-confirm-algorithm">
    <div class="app-confirm-algorithm-label">自動マッチングの決め方</div>
    <ol class="app-confirm-algorithm-steps">
      <li>未確定コマのうち、対応できる講師が<strong>少ないコマ</strong>から順に埋めます。</li>
      <li>各コマでは、シフト提出済み・その日そのコマに対応可・教科・学年が合い・定員に空きがある講師だけを候補にします。</li>
      <li>候補の中から、次の優先順位で1人を選び、「仮決め」に入れます（講師への依頼はまだ出ません）。</li>
    </ol>
    <div class="app-confirm-algorithm-picks-label">講師を選ぶ優先順位</div>
    <ol class="app-confirm-algorithm-picks">${pickItems}</ol>
    <button type="button" class="app-confirm-settings-link" id="appConfirmSettingsLink">設定で変更</button>
  </div>`;
}

let appConfirmExtrasWired = false;
function wireAppConfirmExtras(){
  if(appConfirmExtrasWired) return;
  const extra = document.getElementById('appConfirmExtra');
  if(!extra) return;
  appConfirmExtrasWired = true;
  extra.addEventListener('click', (ev)=>{
    const link = ev.target.closest('#appConfirmSettingsLink');
    if(!link) return;
    dismissAppConfirmDialog(false);
    switchView('settings');
    requestAnimationFrame(()=>{
      document.getElementById('matchingPriorityList')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function bindShortageDashboardActions(wrap){
  wireAppConfirmExtras();
  const ym = getActiveYearMonth();
  const monthSubmitted = monthHasSubmittedTeachers(ym);
  const resultEl = wrap.querySelector('#shortageActionResult');

  wrap.querySelector('#shortageBulkAutoBtn')?.addEventListener('click', async ()=>{
    if(!monthSubmitted){
      if(resultEl) resultEl.textContent = 'この月は講師のシフト提出がないため、自動で組めません。';
      return;
    }
    const unassignedCount = collectUpcomingUnassignedFlat().length;
    if(unassignedCount === 0){
      if(resultEl) resultEl.textContent = '未確定のコマはありません。';
      return;
    }
    const result = await runAppConfirmDialog({
      title: '全コマを自動で組みますか？',
      message: `未確定 ${unassignedCount}コマを、次のルールで講師を割り当てます。`,
      extraHtml: buildMatchingAlgorithmExtraHtml(),
      confirmLabel: '自動で決める',
      variant: 'primary',
    }, async ()=>{
      const { filled, skipped, total } = bulkAutoAssign();
      scheduleSave();
      refreshAfterMatchingChange();
      if(total === 0){
        if(resultEl) resultEl.textContent = '未確定のコマはありません。';
      }else if(filled === 0){
        if(resultEl) resultEl.textContent = `対応できる講師が見つからず、${skipped}件とも自動で組めませんでした。`;
      }else if(skipped === 0){
        if(resultEl) resultEl.textContent = `✓ 未確定だった${filled}件を仮決めしました。「講師にスケジュールを送信」から依頼できます。`;
      }else{
        if(resultEl) resultEl.textContent = `${filled}件を仮決めしました。${skipped}件は未確定のままです。`;
      }
      return { ok: true };
    });
    if(result && result.msg && resultEl) resultEl.textContent = result.msg;
  });

  wrap.querySelector('#shortageSendBtn')?.addEventListener('click', async ()=>{
    const draftCount = S.draftAssignments.length;
    if(draftCount === 0){
      if(resultEl) resultEl.textContent = '送信する仮決めがありません。';
      return;
    }
    const noLoginTeachers = [...new Set(
      S.draftAssignments
        .map(a=> S.teachers.find(t=> t.id === a.teacherId))
        .filter(t=> t && !t.loginUid)
        .map(t=> t.name),
    )];
    let sendMessage = `仮決め ${draftCount}件を講師に依頼します。\n講師がOKするまで承認待ち（講師の返事待ち）です。`;
    if(noLoginTeachers.length > 0){
      sendMessage += `\n\n${noLoginTeachers.join('、')} はまだログインできないため、依頼できません。「講師管理」でログインを用意してください。`;
    }
    const result = await runAppConfirmDialog({
      title: '講師にスケジュールを送信しますか？',
      message: sendMessage,
      confirmLabel: '送信する',
      variant: 'primary',
    }, async ()=>{
      const { sent, skippedNoLogin, noLoginTeachers: skippedNames } = await sendDraftAssignments();
      scheduleSave();
      scheduleSyncTeacherAssignments();
      refreshAfterMatchingChange();
      if(resultEl){
        if(sent === 0 && skippedNoLogin > 0){
          resultEl.textContent = `送れませんでした。${skippedNames.join('、')} のログインを「講師管理」で用意してください。`;
        }else if(skippedNoLogin > 0){
          resultEl.textContent = `✓ ${sent}件を依頼しました。${skippedNames.join('、')} 分はログインがないため仮決めのままです。`;
        }else{
          resultEl.textContent = `✓ ${sent}件を講師に依頼しました（講師の返事待ち）。`;
        }
      }
      return { ok: true };
    });
    if(result && result.msg && resultEl) resultEl.textContent = result.msg;
  });

  wrap.querySelector('#shortageCancelAutoBtn')?.addEventListener('click', async ()=>{
    const autoIds = getUpcomingAutoDraftIds();
    const autoCount = autoIds.size;
    if(autoCount === 0){
      if(resultEl) resultEl.textContent = 'この月で解除できる自動の仮決めはありません。';
      return;
    }
    const flatAutoSlots = collectUpcomingDraftsFlat().filter(e=> e.assignment.source === 'auto').length;
    const result = await runAppConfirmDialog({
      title: '自動で決めた仮決めを解除しますか？',
      message: `この月の自動マッチング ${flatAutoSlots}件を取り消し、未確定に戻します。\n自分で決めた仮決めはそのままです。`,
      confirmLabel: '解除する',
      variant: 'danger',
    }, async ()=>{
      const count = cancelUpcomingAutoDrafts();
      scheduleSave();
      refreshAfterMatchingChange();
      if(resultEl) resultEl.textContent = `自動で決めた仮決め ${count}件を解除しました。`;
      return { ok: true };
    });
    if(result && result.msg && resultEl) resultEl.textContent = result.msg;
  });

  wrap.querySelector('#shortageCancelDraftsBtn')?.addEventListener('click', async ()=>{
    const draftCount = S.draftAssignments.length;
    if(draftCount === 0){
      if(resultEl) resultEl.textContent = '仮決めはありません。';
      return;
    }
    const result = await runAppConfirmDialog({
      title: '仮決めをすべて解除しますか？',
      message: `${draftCount}件の仮決めを取り消し、未確定に戻します。\nすでに講師に送った分はそのままです。`,
      confirmLabel: 'すべて解除',
      variant: 'danger',
    }, async ()=>{
      const count = cancelAllDrafts();
      scheduleSave();
      refreshAfterMatchingChange();
      if(resultEl) resultEl.textContent = `仮決め ${count}件を解除しました。`;
      return { ok: true };
    });
    if(result && result.msg && resultEl) resultEl.textContent = result.msg;
  });
}

function renderShortageListBlock(label, count, unit, itemsHtml, ariaLabel, emptyMessage){
  const scrollHtml = itemsHtml || `<div class="approval-col-empty">${emptyMessage}</div>`;
  return `<div class="approval-detail-well shortage-list-block">
    <div class="approval-col">
      <div class="approval-col-label">${label} <span class="approval-col-num">${count}${unit}</span></div>
      <div class="approval-scroll" aria-label="${ariaLabel}">${scrollHtml}</div>
    </div>
  </div>`;
}

function renderShortageActionsHtml(ym){
  const monthSubmitted = monthHasSubmittedTeachers(ym);
  const monthLabel = ym ? `${Number(ym.slice(5))}月` : 'この月';
  return `<div class="shortage-actions">
    ${!monthSubmitted && ym ? `<div class="shortage-actions-warn">${monthLabel}は講師のシフト提出がまだないため、自動で組めません。</div>` : ''}
    <div class="shortage-actions-grid">
      <button type="button" class="ghost mp-action shortage-action-btn" id="shortageBulkAutoBtn" ${!monthSubmitted ? 'disabled' : ''}>全コマを自動で組む</button>
      <button type="button" class="primary mp-action shortage-action-btn" id="shortageSendBtn">講師にスケジュールを送信</button>
      <button type="button" class="danger-ghost mp-action shortage-action-btn" id="shortageCancelAutoBtn">自動マッチングで解除</button>
      <button type="button" class="danger-ghost mp-action shortage-action-btn" id="shortageCancelDraftsBtn">仮決めをすべて解除</button>
    </div>
    <div id="shortageActionResult" class="shortage-action-result" aria-live="polite"></div>
  </div>`;
}

function renderShortageDashboardItem(entry){
  const { dateStr, row } = entry;
  const { student, course, slot } = row;
  const { md, weekday } = calAlertDateParts(dateStr, getDayStatus);
  const gLabel = gradeLabel(student);
  const aria = shortageRowAriaLabel(dateStr, slot, student, course);
  return buildShortageAlertRowHtml({
    whenPill: buildCalAlertWhenPill(md, weekday, slot.label),
    personHead: buildCalAlertPersonHead(student.name, gLabel),
    subjectTag: buildCalAlertSubjectTag(subjectColor, student.level, course.subject),
    badgeHtml: '<span class="approval-badge pending">未確定</span>',
    dataAttrs: ` data-student="${student.id}" data-date="${dateStr}" aria-label="${aria}"`,
  });
}

function renderDraftDashboardItem(entry){
  const { dateStr, student, course, slot, teacher, assignment } = entry;
  const { md, weekday } = calAlertDateParts(dateStr, getDayStatus);
  const gLabel = gradeLabel(student);
  const teacherName = teacher?.name || '不明';
  const autoBadge = assignment.source === 'auto' ? ' <span class="auto-badge">自動</span>' : '';
  const aria = `${md}（${weekday}）${slot.label} ${teacherName} ${student.name}（${gLabel}）${course.subject} 仮決め`;
  return buildApprovalAlertRowHtml({
    whenPill: buildCalAlertWhenPill(md, weekday, slot.label),
    teacherHead: `<span class="cal-alert-row-head">${teacherName}${autoBadge}</span>`,
    personInline: buildCalAlertPersonInline(student.name, gLabel),
    subjectTag: buildCalAlertSubjectTag(subjectColor, student.level, course.subject),
    badgeHtml: '<span class="approval-badge tentative">仮決め</span>',
    dataAttrs: ` data-student="${student.id}" data-date="${dateStr}" aria-label="${aria}"`,
    tag: 'button',
  });
}

function renderShortageDashboard(){
  const wrap = document.getElementById('shortageWrap');
  const summaryLine = document.getElementById('shortageSummaryLine');
  const statusBar = document.getElementById('calStatusBar');
  if(!wrap) return;
  if(!S.dataReady || !S.studentDataReady){
    wrap.innerHTML = '<div class="loading">読み込み中…</div>';
    if(summaryLine) summaryLine.textContent = '読み込み中…';
    statusBar?.classList.remove('is-ok', 'is-warn');
    return;
  }
  if(S.students.length===0){
    wrap.innerHTML = '<div class="empty-state">生徒が登録されると、未確定のコマが日付順で表示されます。</div>';
    if(summaryLine) summaryLine.textContent = 'まだ生徒が登録されていません';
    statusBar?.classList.remove('is-warn');
    statusBar?.classList.add('is-ok');
    return;
  }

  const ym = getActiveYearMonth();
  const flatItems = collectUpcomingUnassignedFlat();
  const draftItems = collectUpcomingDraftsFlat();
  const pendingAbsences = S.absences.filter(a=> a.status === 'pending').length;
  const draftCount = draftItems.length;
  const pendingCount = countAssignmentsInMonth(S.pendingAssignments, ym);
  const unassignedCount = flatItems.length;
  const hasWork = unassignedCount > 0 || draftCount > 0 || pendingCount > 0 || pendingAbsences > 0;

  if(summaryLine){
    summaryLine.textContent = buildShortageSummaryLine({
      draftCount,
      unassignedCount,
      pendingCount,
      pendingAbsences,
    });
  }
  statusBar?.classList.toggle('is-warn', hasWork);
  statusBar?.classList.toggle('is-ok', !hasWork);

  if(!hasWork){
    wrap.innerHTML = `${renderShortageActionsHtml(ym)}<div class="shortage-ok">✓ この月の未確定コマはありません</div>`;
    bindShortageDashboardActions(wrap);
    return;
  }

  const unassignedHtml = renderShortageListBlock(
    '未確定', unassignedCount, 'コマ',
    flatItems.length > 0 ? flatItems.map(renderShortageDashboardItem).join('') : '',
    '未確定のコマ',
    '未確定のコマはありません',
  );

  const draftHtml = renderShortageListBlock(
    '仮決め', draftCount, '件',
    draftItems.length > 0 ? draftItems.map(renderDraftDashboardItem).join('') : '',
    '仮決めのコマ',
    '仮決めはありません',
  );

  const noteHtml = (unassignedCount === 0 && draftCount === 0)
    ? '<div class="shortage-ok">未確定・仮決めのコマはありません（承認待ちは下の承認バーを確認してください）</div>'
    : '';

  wrap.innerHTML = `${renderShortageActionsHtml(ym)}<div class="shortage-two-col">${unassignedHtml}${draftHtml}</div>${noteHtml}`;
  bindShortageDashboardActions(wrap);

  wrap.querySelectorAll('.approval-item-btn[data-student]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      jumpToCalendarForDate(btn.dataset.student, btn.dataset.date);
    });
  });
}

// 曜日から、今日以降で最も近い実日付を求める（未充足コマ確認→カレンダー遷移用）
function findNearestFutureDate(weekday){
  const start = new Date();
  for(let i=0;i<14;i++){
    const d = new Date(start);
    d.setDate(start.getDate()+i);
    if(WEEKDAY_JP[d.getDay()]===weekday){
      return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
    }
  }
  return null;
}

// 未充足コマ一覧・生徒一覧などから、カレンダーの該当生徒・該当日にジャンプする
function jumpToCalendarForStudent(studentId, courseId){
  const student = S.students.find(s=>s.id===studentId);
  if(!student){ showActiveTabNotice('生徒データが見つかりませんでした（削除された可能性があります）。', { variant: 'warn' }); return; }
  const course = student.courses.find(c=>c.id===courseId);
  if(!course){ showActiveTabNotice('教科データが見つかりませんでした（削除された可能性があります）。', { variant: 'warn' }); return; }
  if(!course.desiredSlots || course.desiredSlots.length===0){
    showActiveTabNotice(`${student.name}さんの「${course.subject}」は、希望する曜日・コマがまだ登録されていません。「生徒登録」タブの編集画面から設定してください。`, { variant: 'warn' });
    return;
  }
  const pending = course.desiredSlots.find(ds=>{
    const nearDate = findNearestFutureDate(ds.day);
    const ym = nearDate ? nearDate.slice(0,7) : S.referenceYearMonth;
    return !findEffectiveAssignment(studentId, courseId, ds.day, ds.slot, ym);
  });
  const target = pending || course.desiredSlots[0];
  const dateStr = findNearestFutureDate(target.day);
  if(!dateStr){ showActiveTabNotice('該当する日付が見つかりませんでした。', { variant: 'warn' }); return; }
  const d = new Date(dateStr+'T00:00:00');
  S.calYear = d.getFullYear();
  S.calMonth = d.getMonth();
  setCalFilterStudent(studentId);
  S.calSelectedDate = dateStr;

  switchView('calendar');
  switchCalMode('month');
  refreshCalFilterOptions();
  renderCalendar();
  document.dispatchEvent(new CustomEvent('calendar:show-day', { detail: { dateStr, studentId } }));
}

// 指定した生徒・指定した日付で、カレンダーの日付詳細パネルに直接ジャンプする
// （欠席・振替クイック登録、および「全体」表示の生徒行からのジャンプで共用）
function jumpToCalendarForDate(studentId, dateStr){
  const student = S.students.find(s=>s.id===studentId);
  if(!student || !dateStr) return;
  const d = new Date(dateStr+'T00:00:00');
  S.calYear = d.getFullYear();
  S.calMonth = d.getMonth();
  setCalFilterStudent(studentId);
  S.calSelectedDate = dateStr;

  switchView('calendar');
  switchCalMode('month');
  refreshCalFilterOptions();
  renderCalendar();
  document.dispatchEvent(new CustomEvent('calendar:show-day', { detail: { dateStr, studentId } }));
  window.scrollTo({top:0, behavior:'smooth'});
}

function jumpToCalendarForTeacher(teacherId, dateStr){
  const teacher = S.teachers.find(t=> t.id === teacherId);
  if(!teacher || !dateStr) return;
  const d = new Date(`${dateStr}T00:00:00`);
  S.calYear = d.getFullYear();
  S.calMonth = d.getMonth();
  setCalFilterTeacher(teacherId);
  S.calSelectedDate = dateStr;

  switchView('calendar');
  switchCalMode('month');
  refreshCalFilterOptions();
  renderCalendar();
  document.dispatchEvent(new CustomEvent('calendar:show-day', { detail: { dateStr } }));
  window.scrollTo({top:0, behavior:'smooth'});
}

// =====================================================================

export { bulkAutoAssign, bulkCancelAuto, buildStudentLevelArea, getSelectedStudentLevel, genCourseId, renderFormCourses, resetStudentForm, fillStudentFormForEdit, handleStudentSave, renderStudentList, deleteStudent, renderMatching, refreshAfterMatchingChange, renderShortageDashboard, expandShortageBar, findNearestFutureDate, jumpToCalendarForStudent, jumpToCalendarForDate, jumpToCalendarForTeacher };
