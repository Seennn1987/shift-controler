const SUBJECT_STYLE = {
  数学: { bg: '#E8F1FB', text: '#1E4E8C', border: '#9BB8DC' },
  英語: { bg: '#F3EAF6', text: '#6B3A86', border: '#C9A6D8' },
  国語: { bg: '#FBEAEA', text: '#8C2F2F', border: '#E0A3A3' },
};

const SUBJECT_MATRIX = `<table class="subject-matrix"><thead><tr><th></th><th>国</th><th>算</th><th>英</th><th>理</th><th>社</th></tr></thead><tbody>
<tr><th class="subject-matrix-level">小</th><td class="sub-empty">—</td><td class="sub-on" style="background:#E8F1FB;color:#1E4E8C;">○</td><td class="sub-empty">—</td><td class="sub-empty">—</td><td class="sub-empty">—</td></tr>
<tr><th class="subject-matrix-level">中</th><td class="sub-empty">—</td><td class="sub-on" style="background:#E8F1FB;color:#1E4E8C;">★</td><td class="sub-on" style="background:#F3EAF6;color:#6B3A86;">○</td><td class="sub-empty">—</td><td class="sub-empty">—</td></tr>
<tr><th class="subject-matrix-level">高</th><td class="sub-empty">—</td><td class="sub-on" style="background:#E8F1FB;color:#1E4E8C;">○</td><td class="sub-on" style="background:#F3EAF6;color:#6B3A86;">○</td><td class="sub-empty">—</td><td class="sub-empty">—</td></tr>
</tbody></table>`;

const MINI_GRID = `<table class="ba-mini-grid"><thead><tr><th></th><th>月</th><th>火</th><th>水</th><th>木</th><th>金</th><th>土</th></tr></thead><tbody>
<tr><th>4講</th><td class="ba-none">×</td><td class="ba-none">×</td><td class="ba-none">×</td><td class="ba-none">×</td><td class="ba-none">×</td><td class="ba-preferred">○</td></tr>
<tr><th>5講</th><td class="ba-none">×</td><td class="ba-normal">△</td><td class="ba-none">×</td><td class="ba-normal">△</td><td class="ba-none">×</td><td class="ba-preferred">○</td></tr>
<tr><th>6講</th><td class="ba-preferred">○</td><td class="ba-preferred">○</td><td class="ba-preferred">○</td><td class="ba-preferred">○</td><td class="ba-preferred">○</td><td class="ba-none">×</td></tr>
<tr><th>7講</th><td class="ba-normal">△</td><td class="ba-none">×</td><td class="ba-normal">△</td><td class="ba-none">×</td><td class="ba-none">×</td><td class="ba-none">×</td></tr>
</tbody></table>`;

const state = {
  hideLeftStudents: true,
  hideLeftTeachers: true,
  studentFlash: null,
  teacherFlash: null,
  students: [
    {
      id: 's1',
      name: '山田 花子',
      level: '中学',
      grade: 2,
      left: false,
      status: { kind: 'pending', label: '講師なし 1' },
      courses: [{ subject: '数学', weeklyCount: 2, pref: '田中 太郎' }],
    },
    {
      id: 's2',
      name: '佐藤 太郎',
      level: '小学',
      grade: 5,
      left: false,
      status: { kind: 'done', label: '確定済み' },
      courses: [{ subject: '国語', weeklyCount: 1, pref: '未設定' }],
    },
    {
      id: 's3',
      name: '鈴木 美咲',
      level: '高校',
      grade: 1,
      left: true,
      status: { kind: 'done', label: '確定済み' },
      courses: [{ subject: '英語', weeklyCount: 1, pref: '田中 太郎' }],
    },
  ],
  teachers: [
    {
      id: 't1',
      name: '田中 太郎',
      workStart: '2024年4月〜',
      pay: '2,200円/コマ · 交通費500円',
      left: false,
      students: ['山田 花子（数学）', '鈴木 美咲（英語）'],
    },
    {
      id: 't2',
      name: '高橋 さくら',
      workStart: '2025年4月〜',
      pay: '2,200円/コマ · 交通費0円',
      left: false,
      emptyPref: true,
    },
    {
      id: 't3',
      name: '伊藤 健',
      workStart: '2023年4月〜',
      pay: '2,400円/コマ · 交通費500円',
      left: true,
      emptyPref: true,
    },
  ],
};

function gradeLabel(s){
  return `${s.level}${s.grade}`;
}

function setPressed(btn, on){
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.classList.toggle('is-active-filter', on);
}

function renderFlash(host, flash){
  host.innerHTML = '';
  if(!flash) return;
  if(flash.restoreLabel){
    host.innerHTML = `
      <div class="matching-panel-result-msg ok">
        <div class="matching-panel-flash-main">${flash.message}</div>
        <div class="matching-panel-flash-followup">
          <span class="matching-panel-flash-followup-text">押し間違えたときは、すぐ戻せます。</span>
          <div class="matching-panel-flash-followup-actions">
            <button type="button" class="ghost matching-panel-flash-btn" data-action="restore">${flash.restoreLabel}</button>
            <button type="button" class="matching-panel-flash-dismiss" data-action="dismiss">閉じる</button>
          </div>
        </div>
      </div>
    `;
    host.querySelector('[data-action=restore]').addEventListener('click', flash.onRestore);
    host.querySelector('[data-action=dismiss]').addEventListener('click', flash.onDismiss);
    return;
  }
  host.innerHTML = `<div class="matching-panel-result-msg ok">${flash.message}</div>`;
}

function renderStudents(){
  const wrap = document.getElementById('studentList');
  const hide = state.hideLeftStudents;
  const visible = state.students.filter(s=> hide ? !s.left : true);
  if(visible.length === 0){
    wrap.innerHTML = '<div class="empty-note">表示する生徒がいません。「退会者を非表示」をオフにすると、退会した生徒を確認できます。</div>';
  }else{
    wrap.innerHTML = visible.map(s=>{
      const status = s.left
        ? { kind: 'no-slots', label: '退会' }
        : s.status;
      const tags = (s.courses || []).map(course=>{
        const c = SUBJECT_STYLE[course.subject] || SUBJECT_STYLE.数学;
        return `<div class="student-row-course">
          <span class="student-row-tag" style="background:${c.bg};color:${c.text};border:1px solid ${c.border};">${course.subject} 週${course.weeklyCount}</span>
          <span class="student-row-pref">担当：${course.pref}</span>
        </div>`;
      }).join('');
      const matchBtn = !s.left && s.status.kind === 'pending'
        ? `<button type="button" class="match-btn" data-id="${s.id}">講師を決める</button>`
        : '';
      const leaveBtn = s.left
        ? `<button type="button" class="edit-btn" data-action="restore" data-id="${s.id}">在籍に戻す</button>`
        : `<button type="button" class="edit-btn" data-action="leave" data-id="${s.id}">退会</button>`;
      return `<div class="student-row${s.left ? ' is-disabled' : ''}${!s.left && s.status.kind === 'pending' ? ' needs-action' : ''}">
        <span class="student-row-status is-${status.kind}">${status.label}</span>
        <div class="student-row-main">
          <div class="student-row-head">
            <span class="student-row-name">${s.name}</span>
            <span class="student-level-badge">${gradeLabel(s)}</span>
          </div>
          <div class="student-row-tags">${tags}</div>
        </div>
        <div class="row-actions student-row-actions">
          <button type="button" class="edit-btn" data-id="${s.id}">編集</button>
          ${matchBtn}
          ${leaveBtn}
          <button type="button" class="del-btn" data-id="${s.id}">削除</button>
        </div>
      </div>`;
    }).join('');
  }

  wrap.querySelectorAll('[data-action=leave]').forEach(btn=>{
    btn.addEventListener('click', ()=> markStudentLeft(btn.dataset.id, true));
  });
  wrap.querySelectorAll('[data-action=restore]').forEach(btn=>{
    btn.addEventListener('click', ()=> markStudentLeft(btn.dataset.id, false));
  });
  renderFlash(document.getElementById('studentFlash'), state.studentFlash);
  renderOtherScreen();
}

function renderTeachers(){
  const wrap = document.getElementById('teacherList');
  const hide = state.hideLeftTeachers;
  const visible = state.teachers.filter(t=> hide ? !t.left : true);
  if(visible.length === 0){
    wrap.innerHTML = '<div class="empty-note">表示する講師がいません。「退職者を非表示」をオフにすると、退社した講師を確認できます。</div>';
  }else{
    wrap.innerHTML = visible.map(t=>{
      const prefHtml = t.emptyPref
        ? '<span class="pref-student-chip is-empty">担当生徒なし</span>'
        : t.students.map(label=> `<span class="pref-student-chip" style="background:#E8F1FB;color:#1E4E8C;border:1px solid #9BB8DC;">${label}</span>`).join('');
      const leaveBtn = t.left
        ? `<button type="button" class="edit-btn" data-action="restore" data-id="${t.id}">在籍に戻す</button>`
        : `<button type="button" class="edit-btn" data-action="leave" data-id="${t.id}">退社</button>`;
      const workStart = t.left ? `退社 · ${t.workStart}` : t.workStart;
      return `<div class="teacher-row${t.left ? ' is-disabled' : ''}">
        <div class="trow-top">
          <div class="trow-head-main">
            <span class="name">${t.name}</span>
            <span class="trow-work-start">${workStart}</span>
            <span class="trow-pay-inline">${t.pay}</span>
          </div>
          <div class="row-actions">
            <button type="button" class="edit-btn" data-id="${t.id}">編集</button>
            ${leaveBtn}
            <button type="button" class="del-btn" data-id="${t.id}">削除</button>
          </div>
        </div>
        <div class="trow-pref-students">
          <div class="trow-col-title">担当生徒</div>
          <div class="trow-pref-student-chips">${prefHtml}</div>
        </div>
        <div class="trow-three-col">
          <div class="trow-col">
            <div class="trow-col-title">担当教科</div>
            <div class="trow-col-body trow-col-body-table">${SUBJECT_MATRIX}</div>
          </div>
          <div class="trow-col">
            <div class="trow-col-title">基本スケジュール</div>
            <div class="trow-col-body trow-col-body-table">${MINI_GRID}</div>
          </div>
          <div class="trow-col">
            <div class="trow-col-title">備考</div>
            <div class="trow-col-body trow-col-body-notes">
              <div class="trow-notes trow-notes-empty">備考なし</div>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  wrap.querySelectorAll('[data-action=leave]').forEach(btn=>{
    btn.addEventListener('click', ()=> markTeacherLeft(btn.dataset.id, true));
  });
  wrap.querySelectorAll('[data-action=restore]').forEach(btn=>{
    btn.addEventListener('click', ()=> markTeacherLeft(btn.dataset.id, false));
  });
  renderFlash(document.getElementById('teacherFlash'), state.teacherFlash);
  renderOtherScreen();
}

function renderOtherScreen(){
  const activeStudents = state.students.filter(s=> !s.left).map(s=> s.name);
  const activeTeachers = state.teachers.filter(t=> !t.left).map(t=> t.name);
  document.getElementById('otherScreenNote').textContent =
    `今この一覧に出る名前：生徒（${activeStudents.join('、')}）／講師（${activeTeachers.join('、')}）。退会・退社した人は含まれません。`;
}

function markStudentLeft(id, left){
  const student = state.students.find(s=> s.id === id);
  if(!student) return;
  student.left = left;
  if(left){
    state.studentFlash = {
      message: `${student.name}さんを退会にしました。授業を組む画面には出ません。`,
      restoreLabel: '在籍に戻す',
      onRestore: ()=> markStudentLeft(id, false),
      onDismiss: ()=>{
        state.studentFlash = null;
        renderStudents();
      },
    };
  }else{
    state.studentFlash = {
      message: `${student.name}さんを在籍に戻しました。`,
    };
  }
  renderStudents();
}

function markTeacherLeft(id, left){
  const teacher = state.teachers.find(t=> t.id === id);
  if(!teacher) return;
  teacher.left = left;
  if(left){
    state.teacherFlash = {
      message: `${teacher.name}さんを退社にしました。授業を組む画面には出ません。`,
      restoreLabel: '在籍に戻す',
      onRestore: ()=> markTeacherLeft(id, false),
      onDismiss: ()=>{
        state.teacherFlash = null;
        renderTeachers();
      },
    };
  }else{
    state.teacherFlash = {
      message: `${teacher.name}さんを在籍に戻しました。`,
    };
  }
  renderTeachers();
}

const hideStudentsBtn = document.getElementById('hideLeftStudentsBtn');
const hideTeachersBtn = document.getElementById('hideLeftTeachersBtn');

hideStudentsBtn.addEventListener('click', ()=>{
  state.hideLeftStudents = !state.hideLeftStudents;
  setPressed(hideStudentsBtn, state.hideLeftStudents);
  renderStudents();
});
hideTeachersBtn.addEventListener('click', ()=>{
  state.hideLeftTeachers = !state.hideLeftTeachers;
  setPressed(hideTeachersBtn, state.hideLeftTeachers);
  renderTeachers();
});

document.getElementById('studentListFilter-trigger').addEventListener('click', event=> event.preventDefault());
document.getElementById('teacherListFilter-trigger').addEventListener('click', event=> event.preventDefault());
document.getElementById('calFilter-trigger').addEventListener('click', event=> event.preventDefault());

renderStudents();
renderTeachers();
