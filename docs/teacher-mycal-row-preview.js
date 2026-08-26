const SUBJECT_COLORS = {
  算数: { bg: '#DBEAFE', text: '#1D4ED8' },
  国語: { bg: '#FCE8E6', text: '#9F1239' },
};

const SLOT4 = [{ subject: '算数', name: 'テスト準', grade: '小4', assigned: true }];
const SLOT5 = [
  { subject: '国語', name: 'テストはなこ', grade: '小5', assigned: false },
  { subject: '国語', name: 'テスト準', grade: '小4', assigned: false },
];

function subjectTag(name) {
  const c = SUBJECT_COLORS[name] || { bg: '#EEE', text: '#333' };
  return `<span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${name}</span>`;
}

function gradeHtml(grade) {
  return grade ? `<span class="grade-tag">（${grade}）</span>` : '';
}

function studentsHtml(students) {
  return `<div class="teacher-slot-students">${students.map(s => `
    <div class="teacher-slot-student-row">
      ${subjectTag(s.subject)}
      <span class="teacher-student-row-name">${s.name}${gradeHtml(s.grade)}</span>
      ${s.assigned ? '<span class="pref-pair-assigned-badge">担当生徒</span>' : ''}
    </div>
  `).join('')}</div>`;
}

const PENDING_HEAD = `
  <button type="button" class="confirm-btn">承認</button>
  <button type="button" class="teacher-decline-btn">辞退</button>
`;

function slotCard({ cardClass, headRight, students }) {
  return `
    <div class="mp-slot-card ${cardClass}">
      <div class="mp-slot-head">
        <span class="mp-slot-label">4講</span>
        <div class="teacher-head-actions">${headRight}</div>
      </div>
      ${studentsHtml(students)}
    </div>
  `;
}

function confirmedHead(pillClass = 'is-confirmed-blue') {
  return `
    <span class="status-pill ${pillClass}">確定</span>
    <button type="button" class="teacher-ghost-btn">キャンセルを依頼</button>
  `;
}

const BLUE_PATTERNS = [
  {
    id: 'B1',
    title: 'B1 — 太青枠 2px',
    cardClass: 'cb-b1',
    pillClass: 'is-confirmed-blue',
    note: 'カード全体を --brand-600 の 2px で囲む。左線なし。',
  },
  {
    id: 'B2',
    title: 'B2 — 太青枠 2px ＋ 薄青背景',
    cardClass: 'cb-b2',
    pillClass: 'is-confirmed-blue',
    note: 'B1 に --brand-50 背景。承認待ち（細青枠）より一段目立つ。',
  },
  {
    id: 'B3',
    title: 'B3 — 青枠 1.5px（控えめ）',
    cardClass: 'cb-b3',
    pillClass: 'is-confirmed-blue-outline',
    note: '承認待ちと同系統だが枠がやや太い。確定ピルは青アウトライン。',
  },
  {
    id: 'B4',
    title: 'B4 — 青リング（box-shadow）',
    cardClass: 'cb-b4',
    pillClass: 'is-confirmed-blue',
    note: '枠線の代わりに外側リング。カード本体は通常グレー枠。',
  },
  {
    id: 'B5',
    title: 'B5 — 上端青帯 3px',
    cardClass: 'cb-b5',
    pillClass: 'is-confirmed-blue-solid',
    note: '左線ではなく上だけ。横方向のアクセント。',
  },
  {
    id: 'B6',
    title: 'B6 — 見出し行だけ薄青',
    cardClass: 'cb-b6',
    pillClass: 'is-confirmed-blue',
    note: 'カード枠は通常。見出し行に brand-50 ＋ 下線。',
  },
  {
    id: 'B7',
    title: 'B7 — 二重枠（外青・内白）',
    cardClass: 'cb-b7',
    pillClass: 'is-confirmed-blue',
    note: '2px 青枠 ＋ inset で内側を白く。メダル型。',
  },
  {
    id: 'B8',
    title: 'B8 — 太青枠 2.5px ＋ 白背景',
    cardClass: 'cb-b8',
    pillClass: 'is-confirmed-blue-outline',
    note: 'いちばん太い青枠。背景は白のまま。',
  },
  {
    id: 'B9',
    title: 'B9 — 実線太枠（承認待ちは細枠）',
    cardClass: 'cb-b9',
    pillClass: 'is-confirmed-blue-solid',
    note: '承認待ち 1px と確定 2px で太さだけ差別化。',
  },
  {
    id: 'B10',
    title: 'B10 — 青枠 ＋ 上から下へ薄青グラデ',
    cardClass: 'cb-b10',
    pillClass: 'is-confirmed-blue',
    note: 'P10型の背景グラデを青系に。左線なし。',
  },
];

function patternCard(title, bodyHtml, note) {
  return `
    <div class="pattern-card">
      <div class="pattern-card-head">${title}</div>
      <div class="pattern-card-body">${bodyHtml}<p class="pattern-note">${note}</p></div>
    </div>
  `;
}

function renderCompare() {
  document.getElementById('stateCompare').innerHTML = `
    <div class="compare-box">
      <h3>承認待ち — 細青枠 1px ＋ 承認／辞退</h3>
      <div class="mp-slot-card is-waiting">
        <div class="mp-slot-head">
          <span class="mp-slot-label">5講</span>
          <div class="teacher-head-actions">${PENDING_HEAD}</div>
        </div>
        ${studentsHtml(SLOT5)}
      </div>
    </div>
    <div class="compare-box">
      <h3>確定 — B2 例（太青枠 ＋ 薄青背景）</h3>
      ${slotCard({
        cardClass: 'cb-b2',
        headRight: confirmedHead('is-confirmed-blue'),
        students: SLOT4,
      })}
    </div>
  `;
}

function renderBlueGrid() {
  document.getElementById('blueGrid').innerHTML = BLUE_PATTERNS.map(p => patternCard(
    p.title,
    slotCard({
      cardClass: p.cardClass,
      headRight: confirmedHead(p.pillClass),
      students: SLOT4,
    }),
    p.note,
  )).join('');
}

document.getElementById('evalRecommend').innerHTML = `
  <strong>今回のルール</strong><br>
  ・<strong>border-left / 左バーは不採用</strong><br>
  ・確定バッジは<strong>青</strong>（--brand-500/600。承認ボタンと同系統）<br>
  ・承認待ち＝細青枠＋操作ボタン／確定＝<strong>太め青枠など</strong>で差別化<br>
  ・文言：<strong>承認 / 辞退</strong>
`;

renderCompare();
renderBlueGrid();
