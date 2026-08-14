import { SUBJECT_MAP, DAYS, SLOTS, WEEKDAY_JP, WEEK_FULL, LEVELS_ORDER } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr, getTodayStr } from '../shared/date-utils.js';
import { firebaseConfig, fbAuth, fbDb, STORAGE_KEY, getSecondaryAuth, S } from './state.js';
import { cancelSubstitute, cancelTeacherAbsence, confirmSubstitute, findSubstituteCandidatesForStudent, findTeacherAbsence, getTeacherLessonsOnDate, recordTeacherAbsence, resolveSlotViaStudentAbsence } from './absences.js';
import { refreshCalStudentFilterOptions, renderCalendar, renderCalendarDetail } from './calendar.js';
import { renderCalendarWeek, switchCalMode, switchView } from './finance-ui.js';
import { countAvailSlots, gradeLabel, isAvailable, subjectColor, teacherHonorific } from './schedule-core.js';
import { applyClosedDayStyling } from './settings.js';
import { saveStudents, scheduleSave, scheduleSyncTeacherAssignments } from './students-persistence.js';
import { buildCandidateInfo, cancelAssignment, compareCandidateInfo, confirmAssignment, countCourseConfirmed, countRoomSlot, countTeacherSlot, findAlternativeSlots, findEffectiveAssignment, removePreferredPair, replaceDesiredSlot } from './teacher-schedule-tab.js';
import { renderTeacherList } from './teachers.js';

// ---- 一括自動仮組み ----
// 未確定の希望枠をまとめて自動的に埋める。候補が少ない（融通が利かない）枠から優先的に処理する。
// 講師の選定は「①教室長の優先ペア ②得意科目 ③優先希望日 ④穴埋め ⑤稼働集約 ⑥人件費最小化 ⑦残り定員」の順で決める。
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
      refreshCourseSubjectOptions();
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

function refreshCourseSubjectOptions(){
  const level = getSelectedStudentLevel();
  const sel = document.getElementById('courseSubjectSelect');
  const already = S.formCourses.map(c=>c.subject);
  const remain = (SUBJECT_MAP[level]||[]).filter(sub=>!already.includes(sub));
  sel.innerHTML = remain.map(sub=>`<option value="${sub}">${sub}</option>`).join('');
  document.getElementById('addCourseBtn').disabled = remain.length===0;
}

function buildCourseAvailGrid(course){
  const table = document.createElement('table');
  table.className = 'avail-grid';
  let thead = '<thead><tr><th class="slot-h">時間割</th>' + DAYS.map(d=>`<th data-day="${d}">${d}</th>`).join('') + '</tr></thead>';
  let tbody = '<tbody>';
  SLOTS.forEach(slot=>{
    tbody += `<tr><th class="slot-h" style="border:1px solid var(--border);background:#fff;font-weight:600;">${slot.label}<br><span style="color:var(--ink-soft);font-weight:400;">${slot.time}</span></th>`;
    DAYS.forEach(day=>{
      const checked = course.desiredSlots.some(ds=>ds.day===day && ds.slot===slot.id);
      const id = `cavail-${course.id}-${day}-${slot.id}`;
      tbody += `<td data-day="${day}"><label for="${id}"><input type="checkbox" id="${id}" data-course="${course.id}" data-day="${day}" data-slot="${slot.id}" ${checked?'checked':''}><span class="dot"></span></label></td>`;
    });
    tbody += '</tr>';
  });
  tbody += '</tbody>';
  table.innerHTML = thead + tbody;
  return table;
}

function renderFormCourses(){
  const level = getSelectedStudentLevel();
  const wrap = document.getElementById('courseList');
  wrap.innerHTML = '';
  S.formCourses.forEach(course=>{
    const c = subjectColor(level, course.subject);
    const card = document.createElement('div');
    card.className = 'course-card';

    const head = document.createElement('div');
    head.className = 'cc-head';
    head.innerHTML = `
      <span class="cc-subject" style="background:${c.bg};color:${c.text};">${course.subject}</span>
      <span class="cc-weekly">週<input type="text" inputmode="numeric" value="${course.weeklyCount}" data-course="${course.id}" class="course-weekly-input">コマ希望</span>
      <button type="button" class="cc-remove" data-course="${course.id}">✕ この教科を削除</button>
    `;
    card.appendChild(head);

    const label = document.createElement('label');
    label.className = 'field-label';
    label.style.fontSize = '11.5px';
    label.textContent = '希望する曜日・コマ（週コマ数とちょうど同じ数を選んでください）';
    card.appendChild(label);

    card.appendChild(buildCourseAvailGrid(course));

    const hint = document.createElement('div');
    const picked = course.desiredSlots.length;
    const need = course.weeklyCount;
    let hintText, hintWarn;
    if(picked < need){
      hintText = `あと${need-picked}枠選んでください（現在${picked}／週${need}コマ）`;
      hintWarn = true;
    }else if(picked > need){
      hintText = `週${need}コマに対して${picked}枠選ばれています。ちょうど${need}枠になるよう外してください。`;
      hintWarn = true;
    }else{
      hintText = `✓ 週${need}コマ分、ちょうど選択できています`;
      hintWarn = false;
    }
    hint.className = 'cc-hint' + (hintWarn ? ' warn' : '');
    hint.textContent = hintText;
    card.appendChild(hint);

    wrap.appendChild(card);
  });

  // イベント登録
  wrap.querySelectorAll('.course-weekly-input').forEach(inp=>{
    inp.addEventListener('change', (e)=>{
      const course = S.formCourses.find(c=>c.id===e.target.dataset.course);
      let v = parseInt(e.target.value, 10);
      if(!Number.isFinite(v) || v < 1) v = 1;
      course.weeklyCount = v;
      renderFormCourses();
    });
  });
  wrap.querySelectorAll('.cc-remove').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      S.formCourses = S.formCourses.filter(c=>c.id!==btn.dataset.course);
      refreshCourseSubjectOptions();
      renderFormCourses();
    });
  });
  wrap.querySelectorAll('input[type=checkbox][data-course]').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      const course = S.formCourses.find(c=>c.id===cb.dataset.course);
      const day = cb.dataset.day, slot = Number(cb.dataset.slot);
      if(cb.checked){
        if(!course.desiredSlots.some(ds=>ds.day===day && ds.slot===slot)){
          course.desiredSlots.push({day, slot});
        }
      }else{
        course.desiredSlots = course.desiredSlots.filter(ds=>!(ds.day===day && ds.slot===slot));
      }
      renderFormCourses();
    });
  });
  applyClosedDayStyling();
}

function resetStudentForm(){
  S.editingStudentId = null;
  document.getElementById('studentNameInput').value = '';
  document.getElementById('studentGradeInput').value = '';
  document.querySelectorAll('input[name=studentLevel]').forEach((r,i)=> r.checked = (i===0));
  S.formCourses = [];
  refreshCourseSubjectOptions();
  renderFormCourses();
  document.getElementById('studentFormModeTitle').textContent = '生徒を登録';
  document.getElementById('studentSaveBtn').textContent = '登録する';
  document.getElementById('studentCancelBtn').style.display = 'none';
  document.getElementById('studentFormMsg').textContent = '';
}

function fillStudentFormForEdit(s){
  S.editingStudentId = s.id;
  document.getElementById('studentNameInput').value = s.name;
  document.getElementById('studentGradeInput').value = s.grade ? String(s.grade) : '';
  document.querySelectorAll('input[name=studentLevel]').forEach(r=> r.checked = (r.value===s.level));
  S.formCourses = JSON.parse(JSON.stringify(s.courses));
  refreshCourseSubjectOptions();
  renderFormCourses();
  document.getElementById('studentFormModeTitle').textContent = `${s.name} さんを編集`;
  document.getElementById('studentSaveBtn').textContent = '更新する';
  document.getElementById('studentCancelBtn').style.display = 'inline-block';
  document.getElementById('studentFormMsg').textContent = '';
  switchView('student');
  window.scrollTo({top:0, behavior:'smooth'});
}

async function handleStudentSave(){
  const msg = document.getElementById('studentFormMsg');
  const name = document.getElementById('studentNameInput').value.trim();
  if(!name){ msg.textContent = '生徒名を入力してください。'; return; }

  const level = getSelectedStudentLevel();
  let grade = parseInt(document.getElementById('studentGradeInput').value, 10);
  if(!Number.isFinite(grade) || grade<1 || grade>6) grade = null;
  if(S.formCourses.length===0){ msg.textContent = '受講科目を1つ以上追加してください。'; return; }
  const mismatchCourse = S.formCourses.find(c=>c.desiredSlots.length !== c.weeklyCount);
  if(mismatchCourse){
    msg.textContent = `「${mismatchCourse.subject}」は週${mismatchCourse.weeklyCount}コマに対して希望曜日が${mismatchCourse.desiredSlots.length}枠になっています。ちょうど${mismatchCourse.weeklyCount}枠を選んでください。`;
    return;
  }

  const courses = JSON.parse(JSON.stringify(S.formCourses));

  if(S.editingStudentId){
    const idx = S.students.findIndex(s=>s.id===S.editingStudentId);
    if(idx>-1) S.students[idx] = {id:S.editingStudentId, name, level, grade, courses};
  }else{
    S.students.push({id:'s-'+Date.now()+'-'+Math.random().toString(36).slice(2,7), name, level, grade, courses});
  }
  await saveStudents();
  resetStudentForm();
  renderStudentList();
  renderMatching();
}

function renderStudentList(){
  scheduleSave();
  const wrap = document.getElementById('studentList');
  if(S.students.length===0){
    wrap.innerHTML = '<div class="empty-note">まだ生徒が登録されていません。上のフォームから登録してください。</div>';
    return;
  }
  wrap.innerHTML = '';
  S.students.forEach(s=>{
    const tags = s.courses.map(course=>{
      const c = subjectColor(s.level, course.subject);
      return `<span class="mini-tag" style="background:${c.bg};color:${c.text};border:1px solid ${c.border};">${course.subject} 週${course.weeklyCount}</span>`;
    }).join('');
    const row = document.createElement('div');
    row.className = 'teacher-row';
    row.innerHTML = `
      <div class="name">${s.name}<span class="student-level-badge">${gradeLabel(s)}</span></div>
      <div class="tags">${tags}</div>
      <div class="row-actions">
        <button class="edit-btn" data-id="${s.id}">編集</button>
        <button class="del-btn" data-id="${s.id}">削除</button>
      </div>`;
    wrap.appendChild(row);
  });
  wrap.querySelectorAll('.edit-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      const s = S.students.find(x=>x.id===b.dataset.id);
      if(s) fillStudentFormForEdit(s);
    });
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
              <span class="cb-label">確定済み${autoBadge}</span>
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

        let candHtml = '';
        if(candidates.length===0){
          const alternatives = findAlternativeSlots(s.level, course.subject, course.desiredSlots);
          candHtml = `<div class="match-none">対応できる講師がいません（${day}曜${slot.label}は希望通りには組めません）</div>`;
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
          candidates.forEach(cand=>{
            const blocked = cand.full || roomFull;
            const prefBadges = [
              cand.prefPair ? '<span class="pref-badge pref-pair">★教室長おすすめ</span>' : '',
              cand.prefSubject ? '<span class="pref-badge pref-subject">得意科目</span>' : '',
              cand.prefDay ? '<span class="pref-badge pref-day">◎優先希望日</span>' : '',
              cand.fillBonus ? '<span class="pref-badge pref-fill">穴埋め</span>' : '',
              cand.dayConsolidation ? '<span class="pref-badge pref-consolidate">稼働集約</span>' : '',
            ].join('');
            candHtml += `<div class="match-cand">
              <span class="match-badge full">対応可</span>
              <span>${cand.teacher.name}</span>
              ${prefBadges}
              <span class="cap-note ${cand.full?'full':''}">${cand.used}/${S.teacherCapacity}人</span>
              <button class="confirm-btn" data-student="${s.id}" data-course="${course.id}" data-subject="${course.subject}" data-day="${day}" data-slot="${slotId}" data-teacher="${cand.teacher.id}" ${blocked?'disabled':''}>
                ${cand.full ? '満席' : (roomFull ? '教室満席' : '確定')}
              </button>
            </div>`;
          });
        }
        if(roomFull){
          candHtml += `<div class="match-none">教室全体の定員（${S.roomCapacity}人）に達しています</div>`;
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
  refreshCalStudentFilterOptions();
  if(document.getElementById('view-calendar') && document.getElementById('view-calendar').classList.contains('active')){
    if(S.calMode==='week') renderCalendarWeek();
    else renderCalendar();
    if(S.calSelectedDate) renderCalendarDetail(S.calSelectedDate);
  }
}

// ---- 優先ペアリング設定UI ----
function refreshPrefStudentOptions(){
  const sel = document.getElementById('prefStudentSelect');
  const cur = sel.value;
  sel.innerHTML = '<option value="">生徒を選択</option>' +
    S.students.map(s=>`<option value="${s.id}">${s.name}（${s.level}）</option>`).join('');
  if(S.students.some(s=>s.id===cur)) sel.value = cur;
}
function refreshPrefCourseAndTeacherOptions(){
  const studentSel = document.getElementById('prefStudentSelect');
  const courseSel = document.getElementById('prefCourseSelect');
  const teacherSel = document.getElementById('prefTeacherSelect');
  const student = S.students.find(s=>s.id===studentSel.value);

  if(!student){
    courseSel.innerHTML = '<option value="">先に生徒を選択</option>';
    courseSel.disabled = true;
    teacherSel.innerHTML = '<option value="">先に生徒を選択</option>';
    teacherSel.disabled = true;
    return;
  }
  courseSel.disabled = false;
  courseSel.innerHTML = student.courses.map(c=>`<option value="${c.id}">${c.subject}</option>`).join('');

  teacherSel.disabled = false;
  // その生徒の学年に対応できる講師を優先的に上に出す（対応不可でも選べるようにはする）
  const capable = S.teachers.filter(t=> t.subjects.some(ts=>ts.level===student.level));
  const others = S.teachers.filter(t=> !capable.includes(t));
  teacherSel.innerHTML = [...capable, ...others].map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
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
  if(!wrap) return;
  if(!S.dataReady || !S.studentDataReady){
    wrap.innerHTML = '<div class="loading">読み込み中…</div>';
    if(summaryLine) summaryLine.textContent = '読み込み中…';
    return;
  }
  if(S.students.length===0){
    wrap.innerHTML = '<div class="empty-state">生徒が登録されるとここに未充足の教科が表示されます。</div>';
    if(summaryLine){ summaryLine.textContent = 'まだ生徒が登録されていません'; summaryLine.classList.remove('warn'); }
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
    wrap.innerHTML = '<div class="shortage-ok">✓ すべての生徒・教科で、週の必要コマ数が確定済みです</div>';
    if(summaryLine){
      summaryLine.textContent = pendingAbsences>0 ? `✓ 確定は充足／未振替 ${pendingAbsences}件` : '✓ すべて確定済みです';
      summaryLine.classList.toggle('warn', pendingAbsences>0);
    }
    return;
  }
  if(summaryLine){
    const absPart = pendingAbsences>0 ? ` ／ 未振替 ${pendingAbsences}件` : '';
    summaryLine.textContent = `${shortages.length}件の教科で確定が不足しています${absPart}`;
    summaryLine.classList.add('warn');
  }

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
    alert(`${student.name}さんの「${course.subject}」は、希望する曜日・コマがまだ登録されていません。「生徒登録・マッチング」タブの編集画面から設定してください。`);
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
  S.calFilterStudentId = studentId;
  S.calSelectedDate = dateStr;

  switchView('calendar');
  switchCalMode('month');
  refreshCalStudentFilterOptions();
  const sel = document.getElementById('calStudentFilter');
  if(sel) sel.value = studentId;
  renderCalendar();
  renderCalendarDetail(dateStr);
}

// 指定した生徒・指定した日付で、カレンダーの日付詳細パネルに直接ジャンプする
// （欠席・振替クイック登録、および「全体」表示の生徒行からのジャンプで共用）
function jumpToCalendarForDate(studentId, dateStr){
  const student = S.students.find(s=>s.id===studentId);
  if(!student || !dateStr) return;
  const d = new Date(dateStr+'T00:00:00');
  S.calYear = d.getFullYear();
  S.calMonth = d.getMonth();
  S.calFilterStudentId = studentId;
  S.calSelectedDate = dateStr;

  switchView('calendar');
  switchCalMode('month');
  refreshCalStudentFilterOptions();
  const sel = document.getElementById('calStudentFilter');
  if(sel) sel.value = studentId;
  renderCalendar();
  renderCalendarDetail(dateStr);
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

// 講師1人分の稼働情報（対応可能コマ数・確定済みコマ数・稼働率）を計算する
function computeTeacherWorkload(t){
  // 対応可能コマ数（曜日×コマの合計）
  const totalAvail = countAvailSlots(t);
  // 実際に生徒が確定して埋まっているコマ数（同じコマに複数人いても1コマとして数える）
  const filledSet = new Set();
  let totalStudents = 0;
  S.assignments.forEach(a=>{
    if(a.teacherId!==t.id) return;
    filledSet.add(a.day+'-'+a.slot);
    totalStudents++;
  });
  const filled = filledSet.size;
  const rate = totalAvail>0 ? Math.round((filled/totalAvail)*100) : 0;
  return {totalAvail, filled, rate, totalStudents};
}

// =====================================================================

export { bulkAutoAssign, bulkCancelAuto, buildStudentLevelArea, getSelectedStudentLevel, genCourseId, refreshCourseSubjectOptions, buildCourseAvailGrid, renderFormCourses, resetStudentForm, fillStudentFormForEdit, handleStudentSave, renderStudentList, deleteStudent, renderMatching, refreshPrefStudentOptions, refreshPrefCourseAndTeacherOptions, renderPrefPairList, renderShortageDashboard, findNearestFutureDate, jumpToCalendarForStudent, jumpToCalendarForDate, renderTeacherAbsencePanel, computeTeacherWorkload };
