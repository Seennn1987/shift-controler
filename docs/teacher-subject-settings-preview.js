const SUBJECT_MAP = {
  '小学': ['国語', '算数', '英語', '理科', '社会'],
  '中学': ['国語', '数学', '英語', '理科', '社会'],
  '高校': ['国語', '数学', '英語', '理科', '社会'],
};
const LEVELS_ORDER = ['小学', '中学', '高校'];
const LEVEL_ABBR = { '小学': '小', '中学': '中', '高校': '高' };
const SUBJECT_ABBR = { '国語': '国', '算数': '算', '数学': '数', '英語': '英', '理科': '理', '社会': '社' };
const STATE_LABEL = { none: '不可', on: '対応可能', preferred: '得意科目' };
const STATE_MARK = { none: '×', on: '○', preferred: '★' };

const SUBJECT_HUE = { '国語': 350, '算数': 188, '数学': 188, '英語': 278, '理科': 142, '社会': 28 };
const SUBJECT_TEXT = {
  '国語': { light: '#9F1239', dark: '#ffffff' },
  '算数': { light: '#0F766E', dark: '#ffffff' },
  '数学': { light: '#0F766E', dark: '#ffffff' },
  '英語': { light: '#6D28D9', dark: '#ffffff' },
  '理科': { light: '#15803D', dark: '#ffffff' },
  '社会': { light: '#C2410C', dark: '#ffffff' },
};
const LEVEL_SHADE = {
  '小学': { s: 52, l: 92 },
  '中学': { s: 48, l: 82 },
  '高校': { s: 44, l: 46 },
};

function subjectColor(level, subject){
  const subKey = subject === '数学' && level === '小学' ? '算数' : subject;
  const h = SUBJECT_HUE[subKey] ?? 0;
  const shade = LEVEL_SHADE[level] || { s: 48, l: 82 };
  const bg = `hsl(${h} ${shade.s}% ${shade.l}%)`;
  const textCfg = SUBJECT_TEXT[subKey];
  const text = shade.l < 58 ? (textCfg?.dark || '#ffffff') : (textCfg?.light || '#333333');
  return { bg, text };
}

const SAMPLE_SUBJECTS = [
  { level: '小学', subject: '国語', preferred: false },
  { level: '小学', subject: '算数', preferred: false },
  { level: '小学', subject: '英語', preferred: true },
  { level: '小学', subject: '理科', preferred: false },
  { level: '小学', subject: '社会', preferred: true },
  { level: '中学', subject: '国語', preferred: false },
  { level: '中学', subject: '英語', preferred: false },
  { level: '中学', subject: '社会', preferred: true },
  { level: '高校', subject: '英語', preferred: false },
  { level: '高校', subject: '社会', preferred: true },
];

let savedSubjects = SAMPLE_SUBJECTS.map(s => ({ ...s }));
let draftSubjects = [];

function findEntry(list, level, subject){
  return list.find(s => s.level === level && s.subject === subject) || null;
}

function cellState(list, level, subject){
  const entry = findEntry(list, level, subject);
  if(!entry) return 'none';
  return entry.preferred ? 'preferred' : 'on';
}

function cycleState(state){
  if(state === 'none') return 'on';
  if(state === 'on') return 'preferred';
  return 'none';
}

function applyCellState(list, level, subject, state){
  const next = list.filter(s => !(s.level === level && s.subject === subject));
  if(state === 'on') next.push({ level, subject, preferred: false });
  if(state === 'preferred') next.push({ level, subject, preferred: true });
  return next;
}

function buildMatrixHtml(list, { editable }){
  const head = SUBJECT_MAP['小学'].map(sub => `<th>${SUBJECT_ABBR[sub] || sub.charAt(0)}</th>`).join('');
  const rows = LEVELS_ORDER.map(level => {
    const cells = SUBJECT_MAP[level].map(subject => {
      const state = cellState(list, level, subject);
      const mark = STATE_MARK[state];
      const label = STATE_LABEL[state];
      if(state === 'none'){
        const inner = editable
          ? `<button type="button" data-level="${level}" data-subject="${subject}" aria-label="${level}${subject} ${label}">${mark}</button>`
          : mark;
        return `<td class="sub-empty">${inner}</td>`;
      }
      const c = subjectColor(level, subject);
      const inner = editable
        ? `<button type="button" data-level="${level}" data-subject="${subject}" aria-label="${level}${subject} ${label}">${mark}</button>`
        : mark;
      return `<td class="sub-on" style="background:${c.bg};color:${c.text};">${inner}</td>`;
    }).join('');
    return `<tr><th class="subject-matrix-level">${LEVEL_ABBR[level]}</th>${cells}</tr>`;
  }).join('');
  const editClass = editable ? ' is-editable' : '';
  return `<table class="subject-matrix${editClass}"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table>`;
}

function renderAdminMatrix(){
  document.getElementById('adminMatrixWrap').innerHTML = buildMatrixHtml(savedSubjects, { editable: false });
}

function bindDraftClicks(wrap){
  wrap.querySelectorAll('button[data-level]').forEach(btn => {
    btn.addEventListener('click', () => {
      const { level, subject } = btn.dataset;
      const next = cycleState(cellState(draftSubjects, level, subject));
      draftSubjects = applyCellState(draftSubjects, level, subject, next);
      wrap.innerHTML = buildMatrixHtml(draftSubjects, { editable: true });
      bindDraftClicks(wrap);
    });
  });
}

function showHome(){
  document.getElementById('viewHome').hidden = false;
  document.getElementById('viewSubjects').hidden = true;
}

function showSubjects(){
  draftSubjects = savedSubjects.map(s => ({ ...s }));
  document.getElementById('subjectFormMsg').textContent = '';
  const wrap = document.getElementById('teacherMatrixWrap');
  wrap.innerHTML = buildMatrixHtml(draftSubjects, { editable: true });
  bindDraftClicks(wrap);
  document.getElementById('viewHome').hidden = true;
  document.getElementById('viewSubjects').hidden = false;
  document.getElementById('backToHomeBtn').focus();
}

function saveDraft(){
  const msg = document.getElementById('subjectFormMsg');
  if(draftSubjects.length === 0){
    msg.textContent = '対応可能な教科を1つ以上選んでから「変更」を押してください。';
    return;
  }
  savedSubjects = draftSubjects.map(s => ({ ...s }));
  renderAdminMatrix();
  document.getElementById('teacherSyncMsg').textContent = '保存しました（プレビュー）。';
  document.getElementById('adminSyncMsg').textContent = '';
  showHome();
}

document.getElementById('openSubjectBtn').addEventListener('click', showSubjects);
document.getElementById('backToHomeBtn').addEventListener('click', showHome);
document.getElementById('saveSubjectBtn').addEventListener('click', saveDraft);

document.getElementById('simulateAdminBtn').addEventListener('click', () => {
  savedSubjects = applyCellState(savedSubjects, '中学', '数学', 'on');
  savedSubjects = applyCellState(savedSubjects, '高校', '英語', 'preferred');
  renderAdminMatrix();
  document.getElementById('adminSyncMsg').textContent = '教室長が更新した想定です。講師が「教科設定」を開き直すと、同じ内容が表示されます。';
  document.getElementById('teacherSyncMsg').textContent = '';
});

renderAdminMatrix();
