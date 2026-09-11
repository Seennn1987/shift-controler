const SUBJECT_STYLE = {
  数学: { bg: '#E8F1FB', text: '#1E4E8C', border: '#9BB8DC' },
  英語: { bg: '#F3EAF6', text: '#6B3A86', border: '#C9A6D8' },
  国語: { bg: '#FBEAEA', text: '#8C2F2F', border: '#E0A3A3' },
};

const GRADE_MAX = { 小学: 6, 中学: 3, 高校: 3 };

const state = {
  editingId: null,
  students: [
    {
      id: 's1',
      name: '山田 花子',
      nameKana: 'やまだ はなこ',
      level: '中学',
      grade: 2,
      courseStartDate: '2026-09-14',
      freeLessonCount: 2,
      courses: [{ subject: '数学', weeklyCount: 2 }, { subject: '英語', weeklyCount: 1 }],
      status: { kind: 'pending', label: '講師なし 1' },
    },
    {
      id: 's2',
      name: '佐藤 太郎',
      nameKana: 'さとう たろう',
      level: '小学',
      grade: 5,
      courseStartDate: '2026-04-07',
      freeLessonCount: 0,
      courses: [{ subject: '国語', weeklyCount: 1 }],
      status: { kind: 'done', label: '確定済み' },
    },
    {
      id: 's3',
      name: '鈴木 美咲',
      nameKana: 'すずき みさき',
      level: '高校',
      grade: 1,
      courseStartDate: '2026-10-01',
      freeLessonCount: 4,
      courses: [{ subject: '英語', weeklyCount: 2 }],
      status: { kind: 'not-started', label: '開始前' },
    },
  ],
};

function gradeLabel(student){
  const abbr = { 小学: '小', 中学: '中', 高校: '高' };
  return `${abbr[student.level] || student.level}${student.grade}`;
}

function selectedLevel(){
  return document.querySelector('input[name=studentLevel]:checked')?.value || '中学';
}

function buildGradeArea(selectedGrade){
  const max = GRADE_MAX[selectedLevel()] || 6;
  const area = document.getElementById('studentGradeArea');
  const grade = selectedGrade != null && selectedGrade >= 1 && selectedGrade <= max ? selectedGrade : null;
  area.innerHTML = '';
  for(let g = 1; g <= max; g++){
    const chip = document.createElement('label');
    chip.className = 'chip';
    chip.innerHTML = `<input type="radio" name="studentGrade" value="${g}"${grade === g ? ' checked' : ''}><span>${g}年</span>`;
    area.appendChild(chip);
  }
}

function readFreeLessonCount(){
  if(!document.getElementById('freeLessonToggle').checked) return 0;
  const n = parseInt(document.getElementById('freeLessonCount').value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function syncFreeLessonArea(){
  const on = document.getElementById('freeLessonToggle').checked;
  document.getElementById('freeLessonArea').style.display = on ? 'flex' : 'none';
}

function resetForm(){
  state.editingId = null;
  document.getElementById('studentNameInput').value = '';
  document.getElementById('studentNameKanaInput').value = '';
  document.querySelector('input[name=studentLevel][value="中学"]').checked = true;
  buildGradeArea(2);
  document.getElementById('studentCourseStartInput').value = '2026-09-14';
  document.getElementById('freeLessonToggle').checked = false;
  document.getElementById('freeLessonCount').value = '';
  syncFreeLessonArea();
  document.getElementById('studentFormModeTitle').textContent = '生徒を登録';
  document.getElementById('studentSaveBtn').textContent = '基本情報を登録';
  document.getElementById('studentCancelBtn').style.display = 'none';
  document.getElementById('studentFormMsg').textContent = '';
  document.getElementById('courseList').innerHTML = '<p class="scc-locked-hint">先に「基本情報を登録」を押してください。登録後、ここで希望コマを選べます。</p>';
  renderList();
}

function fillForm(student){
  state.editingId = student.id;
  document.getElementById('studentNameInput').value = student.name;
  document.getElementById('studentNameKanaInput').value = student.nameKana;
  document.querySelector(`input[name=studentLevel][value="${student.level}"]`).checked = true;
  buildGradeArea(student.grade);
  document.getElementById('studentCourseStartInput').value = student.courseStartDate;
  const hasFree = student.freeLessonCount > 0;
  document.getElementById('freeLessonToggle').checked = hasFree;
  document.getElementById('freeLessonCount').value = hasFree ? String(student.freeLessonCount) : '';
  syncFreeLessonArea();
  document.getElementById('studentFormModeTitle').textContent = '生徒を編集';
  document.getElementById('studentSaveBtn').textContent = '基本情報を更新';
  document.getElementById('studentCancelBtn').style.display = 'inline-block';
  document.getElementById('studentFormMsg').textContent = '';
  document.getElementById('courseList').innerHTML = '<p class="scc-locked-hint">試しページでは希望コマのカレンダーは出しません。無料コマの入力だけ確認してください。</p>';
  renderList();
}

function handleSave(){
  const msg = document.getElementById('studentFormMsg');
  const name = document.getElementById('studentNameInput').value.trim();
  if(!name){ msg.textContent = '生徒名を入力してください。'; return; }
  const nameKana = document.getElementById('studentNameKanaInput').value.trim();
  if(!nameKana){ msg.textContent = '読み仮名を入力してください。'; return; }
  if(document.getElementById('freeLessonToggle').checked){
    const cnt = parseInt(document.getElementById('freeLessonCount').value, 10);
    if(!Number.isFinite(cnt) || cnt <= 0){
      msg.textContent = '無料にするコマ数を入力してください。';
      return;
    }
  }
  const level = document.querySelector('input[name=studentLevel]:checked').value;
  const grade = parseInt(document.querySelector('input[name=studentGrade]:checked').value, 10);
  const courseStartDate = document.getElementById('studentCourseStartInput').value;
  const freeLessonCount = readFreeLessonCount();
  if(state.editingId){
    const idx = state.students.findIndex(s=> s.id === state.editingId);
    if(idx > -1){
      state.students[idx] = { ...state.students[idx], name, nameKana, level, grade, courseStartDate, freeLessonCount };
    }
    msg.textContent = '基本情報を更新しました。';
  }else{
    state.students.push({
      id: 's-' + Date.now(),
      name,
      nameKana,
      level,
      grade,
      courseStartDate,
      freeLessonCount,
      courses: [],
      status: { kind: 'no-slots', label: '希望未設定' },
    });
    msg.textContent = '基本情報を登録しました。（試しページのため、この画面だけの見本です）';
  }
  renderList();
}

function renderList(){
  const wrap = document.getElementById('studentList');
  wrap.innerHTML = state.students.map(s=>{
    const isEditing = state.editingId === s.id;
    const tags = (s.courses || []).map(course=>{
      const c = SUBJECT_STYLE[course.subject] || SUBJECT_STYLE.数学;
      return `<div class="student-row-course">
        <span class="student-row-tag" style="background:${c.bg};color:${c.text};border:1px solid ${c.border};">${course.subject} 週${course.weeklyCount}</span>
        <span class="student-row-pref">担当：未設定</span>
      </div>`;
    }).join('');
    const tagsHtml = tags
      ? `<div class="student-row-tags">${tags}</div>`
      : '<div class="student-row-tags is-empty"><span class="student-row-no-tags">希望コマ未設定</span></div>';
    const freeHtml = s.freeLessonCount > 0
      ? `<span class="student-row-pref">最初${s.freeLessonCount}コマ無料</span>`
      : '';
    const matchBtn = s.status.kind === 'pending'
      ? `<button type="button" class="match-btn" data-id="${s.id}">講師を決める</button>`
      : '';
    return `<div class="student-row${isEditing ? ' is-editing' : ''}${s.status.kind === 'pending' ? ' needs-action' : ''}">
      <span class="student-row-status is-${s.status.kind}">${s.status.label}</span>
      <div class="student-row-main">
        <div class="student-row-head">
          <span class="student-row-name">${s.name}</span>
          <span class="student-level-badge">${gradeLabel(s)}</span>
          ${freeHtml}
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

  wrap.querySelectorAll('.edit-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const student = state.students.find(s=> s.id === btn.dataset.id);
      if(student) fillForm(student);
    });
  });
  wrap.querySelectorAll('.del-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(btn.dataset.confirming){
        state.students = state.students.filter(s=> s.id !== btn.dataset.id);
        if(state.editingId === btn.dataset.id) resetForm();
        else renderList();
      }else{
        btn.dataset.confirming = '1';
        btn.textContent = '本当に削除しますか？';
        setTimeout(()=>{ btn.dataset.confirming = ''; btn.textContent = '削除'; }, 3000);
      }
    });
  });
}

document.getElementById('freeLessonToggle').addEventListener('change', syncFreeLessonArea);
document.getElementById('studentSaveBtn').addEventListener('click', handleSave);
document.getElementById('studentCancelBtn').addEventListener('click', resetForm);
document.getElementById('studentLevelArea').addEventListener('change', ()=>{
  const prev = parseInt(document.querySelector('input[name=studentGrade]:checked')?.value, 10);
  const max = GRADE_MAX[selectedLevel()] || 6;
  buildGradeArea(Number.isFinite(prev) && prev <= max ? prev : null);
});
renderList();
