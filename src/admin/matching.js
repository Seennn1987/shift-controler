import { DAYS, SLOTS, WEEKDAY_JP, WEEK_FULL, LEVELS_ORDER } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr, getTodayStr } from '../shared/date-utils.js';
import { firebaseConfig, fbAuth, fbDb, STORAGE_KEY, getSecondaryAuth, S } from './state.js';
import { cancelSubstitute, cancelTeacherAbsence, confirmSubstitute, findSubstituteCandidatesForStudent, findTeacherAbsence, getTeacherLessonsOnDate, recordTeacherAbsence, resolveSlotViaStudentAbsence } from './absences.js';
import { renderCalendar } from './calendar.js';
import { refreshCalFilterOptions, setCalFilterStudent, refreshPrefCourseCombobox, refreshPrefStudentCombobox, refreshPrefTeacherCombobox, refreshAllPersonComboboxes } from './filter-ui.js';
import { sortByNameKana } from '../shared/person-sort.js';
import { renderCalendarWeek, switchCalMode, switchView } from './finance-ui.js';
import { gradeLabel, isAvailable, subjectColor, teacherHonorific } from './schedule-core.js';
import { saveStudents, scheduleSave, scheduleSyncTeacherAssignments } from './students-persistence.js';
import { buildCandidateInfo, cancelAssignment, confirmAssignment, countCourseConfirmed, countRoomSlot, countTeacherSlot, findAlternativeSlots, findEffectiveAssignment, removePreferredPair, replaceDesiredSlot } from './teacher-schedule-tab.js';
import { compareCandidateInfo } from './matching-config.js';
import { renderMatchCandidateList } from './match-candidate-ui.js';
import { renderTeacherList } from './teachers.js';
import { analyzePendingMatchSlot } from './match-slot-status.js';
import {
  normalizeFormCoursesForSave,
  renderStudentCourseCalendar,
  resetCourseCalendarSelection,
} from './student-course-calendar.js';

// ---- 一括自動仮組み ----
// 未確定の希望枠をまとめて自動的に埋める。候補が少ない（融通が利かない）枠から優先的に処理する。
// 講師の選定は基本設定の「マッチングの優先順位」に従う（compareCandidateInfo）。
function bulkAutoAssign(){
  const pending = [];
  S.students.forEach(s=>{
    s.courses.forEach(course=>{
      course.desiredSlots.forEach(ds=>{
        if(findEffectiveAssignment(s.id, course.id, ds.day, ds.slot, S.referenceYearMonth)) return; // その月で既に確定済み
        if(S.regularClosedDays.includes(ds.day)) return; // 定休日はスキップ
        const candidates = S.teachers.filter(t =>
          isAvailable(t, ds.day, ds.slot) &&
          t.subjects.some(ts=>ts.level===s.level && ts.subject===course.subject) &&
          countTeacherSlot(t.id, ds.day, ds.slot, s.id) < S.teacherCapacity
        );
        pending.push({studentId:s.id, courseId:course.id, subject:course.subject, day:ds.day, slot:ds.slot, candidateCount:candidates.length});
      });
    });
  });

  // 候補が少ない（＝融通が利かない）枠から先に埋めることで、取り合いによる失敗を減らす
  pending.sort((a,b)=> a.candidateCount - b.candidateCount);

  let filled = 0, skipped = 0;
  pending.forEach(p=>{
    if(p.candidateCount===0){ skipped++; return; }
    const student = S.students.find(s=>s.id===p.studentId);
    // この時点で最新の空き状況を再評価し、優先順位に沿って最適な講師を選ぶ
    const candidates = S.teachers
      .filter(t => isAvailable(t, p.day, p.slot) && t.subjects.some(ts=>ts.level===student.level && ts.subject===p.subject))
      .map(t=> buildCandidateInfo(p.studentId, p.courseId, student.level, p.subject, p.day, p.slot, t))
      .filter(c=> !c.full)
      .sort(compareCandidateInfo);

    if(candidates.length===0){ skipped++; return; }

    const result = confirmAssignment(p.studentId, p.courseId, p.subject, p.day, p.slot, candidates[0].teacher.id, 'auto');
    if(result.ok) filled++; else skipped++;
  });

  return {filled, skipped, total:pending.length};
}

// 自動確定（source==='auto'）分だけをまとめて解除する
function bulkCancelAuto(){
  const targets = S.assignments.filter(a=>a.source==='auto');
  const count = targets.length;
  S.assignments = S.assignments.filter(a=>a.source!=='auto');
  return count;
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
    <button type="button" class="primary" id="studentGoMatchingBtn">担当講師を決める →</button>
    <p class="field-hint tight">カレンダー画面の右パネルで、候補講師から担当を決められます。</p>`;
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
    return { kind:'pending', label:`担当未決 ${pendingSlots}`, priority:1, pendingSlots, totalSlots };
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
      return `<span class="student-row-tag" style="background:${c.bg};color:${c.text};border:1px solid ${c.border};">${course.subject} 週${course.weeklyCount}</span>`;
    }).join('');
    const tagsHtml = tags
      ? `<div class="student-row-tags">${tags}</div>`
      : '<div class="student-row-tags is-empty"><span class="student-row-no-tags">希望コマ未設定</span></div>';
    const matchBtn = status.pendingSlots > 0
      ? `<button type="button" class="match-btn" data-id="${s.id}">担当を決める</button>`
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

// 生徒の受講科目（コース）ごとに、講師の対応可能条件を突き合わせる
function renderMatching(){
  scheduleSave();
  scheduleSyncTeacherAssignments();
  const wrap = document.getElementById('matchingWrap');
  if(!S.dataReady || !S.studentDataReady){
    wrap.innerHTML = '<div class="loading">読み込み中…</div>';
    return;
  }
  if(S.students.length===0){
    wrap.innerHTML = '<div class="empty-state">生徒が登録されるとここにマッチング候補が表示されます。</div>';
    return;
  }

  let html = '';
  S.students.forEach(s=>{
    let coursesHtml = '';

    s.courses.forEach(course=>{
      const c = subjectColor(s.level, course.subject);
      const confirmedCount = countCourseConfirmed(s.id, course.id);
      const need = course.weeklyCount;
      const fulfilled = confirmedCount >= need;

      let slotsHtml = '';
      course.desiredSlots.forEach(ds=>{
        const day = ds.day, slotId = ds.slot;
        const slot = SLOTS.find(sl=>sl.id===slotId);
        const existingEff = findEffectiveAssignment(s.id, course.id, day, slotId, S.referenceYearMonth);
        const existing = existingEff ? existingEff.entry : null;

        if(existing){
          const teacher = S.teachers.find(t=>t.id===existing.teacherId);
          const teacherName = teacher ? teacher.name : '(削除された講師)';
          const cap = teacher ? (S.teacherCapacity) : '-';
          const used = teacher ? countTeacherSlot(teacher.id, day, slotId, null) : 0;
          const autoBadge = existing.source==='auto' ? '<span class="auto-badge">自動</span>' : '';
          slotsHtml += `<div class="match-slot">
            <div class="ms-slot-label">${day}曜日 ${slot.label}（${slot.time}）</div>
            <div class="confirmed-box">
              <span class="cb-label">確定${autoBadge}</span>
              <span class="cb-teacher">講師：${teacherHonorific(teacher)}</span>
              <span class="cb-cap">（定員 ${used}/${cap}）</span>
              <button class="unconfirm-btn" data-student="${s.id}" data-course="${course.id}" data-day="${day}" data-slot="${slotId}">確定を解除</button>
            </div>
          </div>`;
          return;
        }

        if(S.regularClosedDays.includes(day)){
          slotsHtml += `<div class="match-slot">
            <div class="ms-slot-label">${day}曜日 ${slot.label}（${slot.time}）</div>
            <div class="match-none">この曜日は定休日のため授業を組めません（基本設定で変更できます）</div>
          </div>`;
          return;
        }

        // その日・コマにこの教科（学年一致）を教えられる講師を抽出し、優先順位で並べる
        const candidates = S.teachers
          .filter(t => isAvailable(t, day, slotId))
          .filter(t => t.subjects.some(ts=>ts.level===s.level && ts.subject===course.subject))
          .map(t => buildCandidateInfo(s.id, course.id, s.level, course.subject, day, slotId, t))
          .sort(compareCandidateInfo);

        const roomUsed = countRoomSlot(day, slotId, null);
        const roomFull = roomUsed >= S.roomCapacity;
        const slotAnalysis = analyzePendingMatchSlot(s, course, day, slotId, S.referenceYearMonth);

        let candHtml = '';
        if(candidates.length===0){
          const alternatives = findAlternativeSlots(s.level, course.subject, course.desiredSlots);
          candHtml = `<div class="match-none">${slotAnalysis.label}：${slotAnalysis.detailLines?.[0] || `対応できる講師がいません（${day}曜${slot.label}）`}</div>`;
          if(alternatives.length===0){
            candHtml += `<div class="match-none">他に空いている代替日程もありません。講師の追加登録をご検討ください。</div>`;
          }else{
            const panelId = `alt-${course.id}-${day}-${slotId}`;
            candHtml += `<button type="button" class="alt-toggle-btn" data-target="${panelId}">代替日程を提案（${alternatives.length}件）</button>
            <div class="alt-panel" id="${panelId}">
              ${alternatives.map(alt=>{
                const altSlot = SLOTS.find(sl=>sl.id===alt.slot);
                return `<button type="button" class="alt-option-btn"
                  data-student="${s.id}" data-course="${course.id}"
                  data-old-day="${day}" data-old-slot="${slotId}"
                  data-new-day="${alt.day}" data-new-slot="${alt.slot}">
                  ${alt.day}曜 ${altSlot.label}（${altSlot.time}）に変更
                </button>`;
              }).join('')}
            </div>`;
          }
        }else{
          candHtml = renderMatchCandidateList(candidates, {
            studentId: s.id,
            courseId: course.id,
            subject: course.subject,
            day,
            slot: slotId,
            roomFull,
          });
          if(!candHtml && !roomFull){
            candHtml = `<div class="match-none">定員に達しているため、候補講師はありません</div>`;
          }
        }

        slotsHtml += `<div class="match-slot">
          <div class="ms-slot-label">${day}曜日 ${slot.label}（${slot.time}）<span style="font-weight:400;color:var(--ink-soft);"> ／ 教室 ${roomUsed}/${S.roomCapacity}</span></div>
          ${candHtml}
        </div>`;
      });

      coursesHtml += `<div class="match-course">
        <div class="mc-head">
          <span class="cc-subject" style="background:${c.bg};color:${c.text};">${course.subject}</span>
          <span class="mc-progress ${fulfilled?'ok':'warn'}">確定 ${confirmedCount} / 週${need}コマ${fulfilled?' ✓充足':''}</span>
        </div>
        ${slotsHtml}
      </div>`;
    });

    html += `<div class="match-student" id="match-student-${s.id}">
      <div class="ms-head">
        <span class="ms-name">${s.name}</span>
        <span class="ms-meta">${s.level}</span>
      </div>
      ${coursesHtml}
    </div>`;
  });

  wrap.innerHTML = html;

  // 確定ボタン
  wrap.querySelectorAll('.confirm-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const {student, course, subject, day, teacher} = btn.dataset;
      const slot = Number(btn.dataset.slot);
      const result = confirmAssignment(student, course, subject, day, slot, teacher);
      if(!result.ok){
        alert(result.msg);
        return;
      }
      renderMatching();
    });
  });
  // 確定解除ボタン
  wrap.querySelectorAll('.unconfirm-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      cancelAssignment(btn.dataset.student, btn.dataset.course, btn.dataset.day, Number(btn.dataset.slot));
      renderMatching();
    });
  });
  // 代替日程パネルの開閉
  wrap.querySelectorAll('.alt-toggle-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const panel = document.getElementById(btn.dataset.target);
      if(panel) panel.classList.toggle('open');
    });
  });
  // 代替日程を選択
  wrap.querySelectorAll('.alt-option-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const {student, course} = btn.dataset;
      const oldDay = btn.dataset.oldDay, newDay = btn.dataset.newDay;
      const oldSlot = Number(btn.dataset.oldSlot), newSlot = Number(btn.dataset.newSlot);
      replaceDesiredSlot(student, course, oldDay, oldSlot, newDay, newSlot);
    });
  });

  renderShortageDashboard();
  renderTeacherList();
  renderPrefPairList();
  refreshPrefStudentOptions();
  refreshPrefCourseAndTeacherOptions();
  refreshAllPersonComboboxes();
  if(document.getElementById('view-calendar') && document.getElementById('view-calendar').classList.contains('active')){
    if(S.calMode==='week') renderCalendarWeek();
    else renderCalendar();
    if(S.calSelectedDate && S.matchingPanelOpen){
      document.dispatchEvent(new CustomEvent('calendar:refresh-day', { detail: { dateStr: S.calSelectedDate } }));
    }
  }
}

// ---- 優先ペアリング設定UI ----
function refreshPrefStudentOptions(){
  refreshPrefStudentCombobox();
}
function refreshPrefCourseAndTeacherOptions(){
  const studentId = document.getElementById('prefStudentSelect')?.value || '';
  const student = S.students.find(s=> s.id === studentId);
  refreshPrefCourseCombobox(student, { disabled: !student });
  refreshPrefTeacherCombobox(student, { disabled: !student });
}

function renderPrefPairList(){
  scheduleSave();
  const wrap = document.getElementById('prefPairList');
  if(S.preferredPairs.length===0){
    wrap.innerHTML = '<div class="empty-note">まだ優先ペアリングは設定されていません。</div>';
    return;
  }
  wrap.innerHTML = S.preferredPairs.map(p=>{
    const student = S.students.find(s=>s.id===p.studentId);
    const teacher = S.teachers.find(t=>t.id===p.teacherId);
    const course = student ? student.courses.find(c=>c.id===p.courseId) : null;
    const label = `${student ? student.name : '(削除済み生徒)'}｜${course ? course.subject : '(削除済み教科)'} → ${teacher ? teacher.name : '(削除済み講師)'}`;
    return `<div class="pref-pair-row">
      <span class="ppr-text">★ ${label}</span>
      <button type="button" class="ppr-remove" data-id="${p.id}">解除</button>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.ppr-remove').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      removePreferredPair(btn.dataset.id);
      renderPrefPairList();
      renderMatching();
    });
  });
}

// 未充足コマ一覧（週の必要コマ数に対して確定が足りていない教科だけを抽出）
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
    wrap.innerHTML = '<div class="empty-state">生徒が登録されるとここに未充足の教科が表示されます。</div>';
    if(summaryLine) summaryLine.textContent = 'まだ生徒が登録されていません';
    statusBar?.classList.remove('is-warn');
    statusBar?.classList.add('is-ok');
    return;
  }

  const shortages = [];
  S.students.forEach(s=>{
    s.courses.forEach(course=>{
      const confirmed = countCourseConfirmed(s.id, course.id);
      const need = course.weeklyCount;
      if(confirmed < need){
        shortages.push({student:s, course, confirmed, need, gap: need-confirmed});
      }
    });
  });

  const pendingAbsences = S.absences.filter(a=>a.status==='pending').length;

  if(shortages.length===0){
    wrap.innerHTML = '<div class="shortage-ok">✓ すべての生徒・教科で、週の必要コマ数が確定しています</div>';
    if(summaryLine){
      summaryLine.textContent = pendingAbsences>0 ? `✓ コマは充足／未振替 ${pendingAbsences}件` : '✓ すべて確定です';
    }
    statusBar?.classList.toggle('is-warn', pendingAbsences>0);
    statusBar?.classList.toggle('is-ok', pendingAbsences===0);
    return;
  }
  if(summaryLine){
    const absPart = pendingAbsences>0 ? ` ／ 未振替 ${pendingAbsences}件` : '';
    summaryLine.textContent = `${shortages.length}件の教科で確定が不足しています${absPart}`;
  }
  statusBar?.classList.remove('is-ok');
  statusBar?.classList.add('is-warn');

  shortages.sort((a,b)=> b.gap - a.gap);

  let html = `<div class="shortage-summary">${shortages.length}件の教科で確定が不足しています（不足コマ数が多い順）</div>`;
  shortages.forEach(sh=>{
    const c = subjectColor(sh.student.level, sh.course.subject);
    const severe = sh.confirmed === 0;
    html += `<div class="shortage-row ${severe?'severe':''}">
      <span class="sr-name">${sh.student.name}</span>
      <span class="sr-subject" style="background:${c.bg};color:${c.text};">${sh.course.subject}</span>
      <span class="sr-status">確定 ${sh.confirmed} / 週${sh.need}コマ（あと${sh.gap}コマ）</span>
      <button class="sr-jump" data-student="${sh.student.id}" data-course="${sh.course.id}">候補を確認</button>
    </div>`;
  });
  wrap.innerHTML = html;

  wrap.querySelectorAll('.sr-jump').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      jumpToCalendarForStudent(btn.dataset.student, btn.dataset.course);
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
  if(!student){ alert('生徒データが見つかりませんでした（削除された可能性があります）。'); return; }
  const course = student.courses.find(c=>c.id===courseId);
  if(!course){ alert('教科データが見つかりませんでした（削除された可能性があります）。'); return; }
  if(!course.desiredSlots || course.desiredSlots.length===0){
    alert(`${student.name}さんの「${course.subject}」は、希望する曜日・コマがまだ登録されていません。「生徒登録」タブの編集画面から設定してください。`);
    return;
  }
  const pending = course.desiredSlots.find(ds=>{
    const nearDate = findNearestFutureDate(ds.day);
    const ym = nearDate ? nearDate.slice(0,7) : S.referenceYearMonth;
    return !findEffectiveAssignment(studentId, courseId, ds.day, ds.slot, ym);
  });
  const target = pending || course.desiredSlots[0];
  const dateStr = findNearestFutureDate(target.day);
  if(!dateStr){ alert('該当する日付が見つかりませんでした。'); return; }
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

// ---- 講師の欠勤・代講パネル ----
function renderTeacherAbsencePanel(teacherId, dateStr){
  const panel = document.getElementById('teacherAbsencePanel');
  const teacher = S.teachers.find(t=>t.id===teacherId);
  if(!panel || !teacher) return;
  panel.style.display = '';

  const lessonsBySlot = getTeacherLessonsOnDate(teacherId, dateStr);
  const slotIds = Object.keys(lessonsBySlot).map(Number).sort((a,b)=>a-b);
  const ta = findTeacherAbsence(teacherId, dateStr);

  if(slotIds.length===0){
    panel.innerHTML = `<div class="card">
      <h2>${teacher.name}先生の欠勤対応（${dateStr}）</h2>
      <p class="desc">この日、${teacher.name}先生に確定している授業はありません。</p>
      <button type="button" class="ghost" id="closeTeacherAbsenceBtn">閉じる</button>
    </div>`;
    document.getElementById('closeTeacherAbsenceBtn').addEventListener('click', ()=>{ panel.style.display='none'; panel.innerHTML=''; });
    return;
  }

  let rowsHtml = '';
  slotIds.forEach(slotId=>{
    const slot = SLOTS.find(s=>s.id===slotId);
    const studentEntries = lessonsBySlot[slotId];
    const isMarked = ta && ta.slots.includes(slotId);

    let studentRowsHtml = '';
    studentEntries.forEach(e=>{
      const st = S.students.find(s=>s.id===e.studentId);
      const studentLabel = `${st?st.name:'?'}（${e.subject}）`;
      const sub = S.teacherSubstitutions.find(s=>s.teacherId===teacherId && s.date===dateStr && s.slot===slotId && s.studentId===e.studentId);
      let stStatusHtml = '';
      if(sub){
        const subTeacher = S.teachers.find(t=>t.id===sub.substituteTeacherId);
        stStatusHtml = `<span class="ta-resolved-inline">代講：${subTeacher?subTeacher.name:'?'}先生 <button type="button" class="cancel-absence-btn" data-cancel-sub="${slotId}" data-cancel-student="${e.studentId}">取り消す</button></span>`;
      }
      studentRowsHtml += `<div class="ta-student-row" data-slot="${slotId}" data-student="${e.studentId}" data-subject="${e.subject}">
        <span class="ta-student-label">${studentLabel}</span>
        ${!sub ? `<button type="button" class="ghost ta-find-sub-btn" data-slot="${slotId}" data-student="${e.studentId}" data-subject="${e.subject}">代講を探す</button>` : ''}
        ${stStatusHtml}
        <div class="ta-cand-area" id="taCand-${slotId}-${e.studentId}" style="display:none;"></div>
      </div>`;
    });

    rowsHtml += `<div class="ta-slot-row">
      <label class="ta-slot-check">
        <input type="checkbox" class="ta-slot-checkbox" data-slot="${slotId}" ${isMarked?'checked disabled':''}>
        <span><b>${slot.label}（${slot.time}）</b></span>
      </label>
      ${studentRowsHtml}
      ${isMarked ? `<div class="ta-resolved">この枠は欠勤対応済みです</div>` : ''}
    </div>`;
  });

  panel.innerHTML = `<div class="card">
    <h2>${teacher.name}先生の欠勤対応（${dateStr}）</h2>
    <p class="desc">1コマに複数の生徒がいる場合は、生徒ごとに個別に代講を探せます（同じ先生でも別の先生でも構いません）。見つからない場合は「代講せず欠席にする」から、その生徒だけ既存の振替フローに乗せられます。</p>
    <label class="chip" style="display:inline-flex;margin-bottom:10px;">
      <input type="checkbox" id="taAllSlotsCheckbox">
      <span>全コマ欠勤にする</span>
    </label>
    ${rowsHtml}
    <button type="button" class="ghost" id="closeTeacherAbsenceBtn">閉じる</button>
  </div>`;

  document.getElementById('closeTeacherAbsenceBtn').addEventListener('click', ()=>{ panel.style.display='none'; panel.innerHTML=''; });

  document.getElementById('taAllSlotsCheckbox').addEventListener('change', (e)=>{
    panel.querySelectorAll('.ta-slot-checkbox:not(:disabled)').forEach(cb=>{ cb.checked = e.target.checked; });
  });

  panel.querySelectorAll('.ta-find-sub-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const slotId = Number(btn.dataset.slot);
      const studentId = btn.dataset.student;
      const subject = btn.dataset.subject;
      const candArea = document.getElementById(`taCand-${slotId}-${studentId}`);
      const isOpen = candArea.style.display !== 'none';
      if(isOpen){ candArea.style.display = 'none'; return; }

      const candidates = findSubstituteCandidatesForStudent(dateStr, slotId, teacherId, studentId, subject);
      let html = '';
      if(candidates.length===0){
        html = `<div class="match-none">対応できる代講候補が見つかりませんでした。</div>
          <button type="button" class="no-makeup-btn" data-fallback-slot="${slotId}" data-fallback-student="${studentId}">代講せず欠席にする</button>`;
      }else{
        candidates.forEach(c=>{
          html += `<div class="match-cand">
            <span>${c.name}先生</span>
            <button type="button" class="confirm-makeup-btn" data-confirm-sub="${slotId}" data-confirm-student="${studentId}" data-sub-teacher="${c.id}">この先生に代講してもらう</button>
          </div>`;
        });
        html += `<button type="button" class="no-makeup-btn" data-fallback-slot="${slotId}" data-fallback-student="${studentId}" style="margin-top:6px;">代講せず欠席にする</button>`;
      }
      candArea.innerHTML = html;
      candArea.style.display = 'block';

      candArea.querySelectorAll('[data-confirm-sub]').forEach(cbtn=>{
        cbtn.addEventListener('click', ()=>{
          const s = Number(cbtn.dataset.confirmSub);
          const sid = cbtn.dataset.confirmStudent;
          confirmSubstitute(teacherId, dateStr, s, cbtn.dataset.subTeacher, sid);
          recordTeacherAbsence(teacherId, dateStr, [s]);
          renderMatching();
          renderTeacherAbsencePanel(teacherId, dateStr);
        });
      });
      candArea.querySelectorAll('[data-fallback-slot]').forEach(fbtn=>{
        fbtn.addEventListener('click', ()=>{
          const s = Number(fbtn.dataset.fallbackSlot);
          const sid = fbtn.dataset.fallbackStudent;
          const entry = lessonsBySlot[s].find(e=>e.studentId===sid);
          if(entry) resolveSlotViaStudentAbsence(teacherId, dateStr, s, [entry]);
          recordTeacherAbsence(teacherId, dateStr, [s]);
          renderMatching();
          renderTeacherAbsencePanel(teacherId, dateStr);
        });
      });
    });
  });

  panel.querySelectorAll('[data-cancel-sub]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const slotId = Number(btn.dataset.cancelSub);
      const studentId = btn.dataset.cancelStudent;
      cancelSubstitute(teacherId, dateStr, slotId, studentId);
      if(ta){ ta.slots = ta.slots.filter(s=>s!==slotId); if(ta.slots.length===0) cancelTeacherAbsence(ta.id); }
      renderMatching();
      renderTeacherAbsencePanel(teacherId, dateStr);
    });
  });
}

// =====================================================================

export { bulkAutoAssign, bulkCancelAuto, buildStudentLevelArea, getSelectedStudentLevel, genCourseId, renderFormCourses, resetStudentForm, fillStudentFormForEdit, handleStudentSave, renderStudentList, deleteStudent, renderMatching, refreshPrefStudentOptions, refreshPrefCourseAndTeacherOptions, renderPrefPairList, renderShortageDashboard, findNearestFutureDate, jumpToCalendarForStudent, jumpToCalendarForDate, renderTeacherAbsencePanel };
