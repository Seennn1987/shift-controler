import { buildFeeTablesHtml } from '/src/admin/print-sheet-html.js';

const FEES = { enrollment:16500, registration:11000, annual:11000, annualMonthlyReduction:1100, maintenance:2750, elearning:3300 };
const RATES = { basic:3900, advance:4400 };
const PROGRAMMING_FEE = 8000;

const color = (h, text) => `background:hsl(${h} 48% 82%);color:${text};`;
const SUBJ = {
  '数学': color(188, '#0F766E'), '英語': color(278, '#6D28D9'), '国語': color(350, '#9F1239'),
  '理科': color(142, '#15803D'), 'プログラミング': color(88, '#4D7C0F'),
};
const DAYS = ['月', '火', '水', '木', '金', '土', '日'];
const SLOTS = [
  { id:4, label:'4講', time:'14:50〜16:20' }, { id:5, label:'5講', time:'16:40〜18:10' },
  { id:6, label:'6講', time:'18:20〜19:50' }, { id:7, label:'7講', time:'20:00〜21:30' },
];
const CELLS = { '火-5':['数学'], '火-6':['英語', '国語'], '木-5':['理科'], '金-7':['プログラミング'] };

function gridHtml(){
  let html = '<table class="avail-grid student-course-grid"><thead><tr><th class="slot-h">時間割</th>';
  DAYS.forEach(d=>{ html += `<th>${d}</th>`; });
  html += '</tr></thead><tbody>';
  SLOTS.forEach(slot=>{
    html += `<tr><th class="slot-h">${slot.label}<br><span class="slot-time">${slot.time}</span></th>`;
    DAYS.forEach(day=>{
      const subj = CELLS[`${day}-${slot.id}`];
      if(day === '日'){
        html += '<td class="scc-cell scc-closed"><span class="scc-closed-label">休</span></td>';
      }else if(subj && subj.length === 2){
        html += `<td class="scc-cell scc-filled scc-dual"><button type="button" class="scc-slot-btn scc-slot-filled-btn">
          <span class="scc-dual-tags">${subj.map(s=> `<span class="scc-subject-name" style="${SUBJ[s]}">${s}</span>`).join('<span class="scc-dual-plus">＋</span>')}</span>
          <span class="scc-dual-mode-label">90分・2教科</span></button></td>`;
      }else if(subj){
        html += `<td class="scc-cell scc-filled"><button type="button" class="scc-slot-btn scc-slot-filled-btn"><span class="scc-subject-name" style="${SUBJ[subj[0]]}">${subj[0] === 'プログラミング' ? 'プログラ' : subj[0]}</span></button></td>`;
      }else{
        html += '<td class="scc-cell scc-empty"><button type="button" class="scc-slot-btn scc-empty-btn has-avail">＋<span class="scc-avail-count">講師2</span></button></td>';
      }
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  const summary = ['数学 週1コマ', '英語 週1コマ', '国語 週1コマ', '理科 週1コマ', 'プログラミング 週1コマ']
    .map(t=> `<span class="scc-summary-tag" style="${SUBJ[t.split(' ')[0]]}">${t}</span>`).join('');
  return `<div class="student-course-calendar-wrap">${html}</div><div class="scc-summary">${summary}</div>`;
}

const gap = h => `<div style="height:${h}px"></div>`;

function basicHtml(){
  return `
    <label class="field-label" for="pvName">生徒名</label>
    <input type="text" id="pvName" value="山田 太郎">
    ${gap(14)}
    <label class="field-label" for="pvKana">読み仮名</label>
    <input type="text" id="pvKana" value="やまだ たろう">
    ${gap(18)}
    <label class="field-label">学年</label>
    <div class="chip-row">
      <label class="chip"><input type="radio" name="pvLevel"><span>小学</span></label>
      <label class="chip"><input type="radio" name="pvLevel" checked><span>中学</span></label>
      <label class="chip"><input type="radio" name="pvLevel"><span>高校</span></label>
    </div>
    ${gap(12)}
    <label class="field-label">年数</label>
    <div class="chip-row">
      <label class="chip"><input type="radio" name="pvGrade" checked><span>1年</span></label>
      <label class="chip"><input type="radio" name="pvGrade"><span>2年</span></label>
      <label class="chip"><input type="radio" name="pvGrade"><span>3年</span></label>
    </div>
    ${gap(18)}
    <label class="field-label" for="pvStart">受講開始日</label>
    <input type="date" id="pvStart" value="2026-09-01">`;
}

function coursesHtml(registered = true){
  return `
    <label class="field-label">受講科目</label>
    ${registered ? gridHtml() : '<p class="scc-locked-hint">右の「基本情報を登録」を押すと、ここで希望コマを選べます。</p>'}`;
}

function feeInputsHtml(){
  return `
    <label class="field-label">授業料コース</label>
    <div class="chip-row">
      <label class="chip"><input type="radio" name="pvCourse" value="basic" checked><span>ベーシック</span></label>
      <label class="chip"><input type="radio" name="pvCourse" value="advance"><span>アドバンス</span></label>
    </div>
    ${gap(14)}
    <label class="field-label">割引（円）</label>
    <div class="field-hint tight">この生徒だけの割引です。割り引いても0円より下にはなりません。</div>
    <div class="pay-input-row">
      <div class="pay-input-item"><label for="pvDiscInitial">初期費用</label><input type="text" inputmode="numeric" id="pvDiscInitial" value="5500"></div>
      <div class="pay-input-item"><label for="pvDiscAnnual">年会費</label><input type="text" inputmode="numeric" id="pvDiscAnnual" placeholder="例：11000"></div>
      <div class="pay-input-item"><label for="pvDiscMonthly">月ごとの費用</label><input type="text" inputmode="numeric" id="pvDiscMonthly" value="1100"></div>
    </div>
    ${gap(14)}
    <label class="chip" style="display:inline-flex;">
      <input type="checkbox" id="pvFreeToggle" checked>
      <span>最初の◯コマを無料にする</span>
    </label>
    <div id="pvFreeArea" class="pay-input-row" style="margin-top:10px;">
      <div class="pay-input-item">
        <label for="pvFreeCount">無料にするコマ数（最初から何コマ分か）</label>
        <input type="text" inputmode="numeric" id="pvFreeCount" value="2">
      </div>
    </div>`;
}

function memoHtml(){
  return `
    <label class="field-label">受験</label>
    <div class="chip-row">
      <label class="chip"><input type="radio" name="pvExam"><span>なし</span></label>
      <label class="chip"><input type="radio" name="pvExam"><span>中学受験</span></label>
      <label class="chip"><input type="radio" name="pvExam" checked><span>高校受験</span></label>
      <label class="chip"><input type="radio" name="pvExam"><span>大学受験</span></label>
    </div>
    ${gap(14)}
    <label class="field-label" for="pvSchool">志望校</label>
    <input type="text" id="pvSchool" value="第1 都立〇〇高校">
    ${gap(14)}
    <label class="field-label" for="pvNotes">備考（自由記入）</label>
    <textarea id="pvNotes" rows="3" style="width:100%;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-md);font-family:inherit;font-size:13px;background:var(--surface-card);resize:vertical;">英語が苦手。部活は月水金。</textarea>`;
}

const actionsHtml = () => `
  <div class="form-actions">
    <button class="primary" type="button">基本情報を更新</button>
    <button class="ghost" type="button">キャンセル</button>
  </div>`;

function readForm(root, noCourses){
  const num = id => Number(root.querySelector(`#${id}`)?.value) || 0;
  const course = root.querySelector('input[name=pvCourse]:checked')?.value || 'basic';
  const start = root.querySelector('#pvStart')?.value || '';
  const freeOn = root.querySelector('#pvFreeToggle')?.checked;
  return {
    fees: FEES,
    rate: RATES[course],
    weeklyUnits: noCourses ? 0 : 3,
    noCourses,
    programmingFee: noCourses ? 0 : PROGRAMMING_FEE,
    startMonth1: start ? Number(start.slice(5, 7)) : null,
    discounts: { initial: num('pvDiscInitial'), annual: num('pvDiscAnnual'), monthly: num('pvDiscMonthly') },
    freeLessonCount: freeOn ? num('pvFreeCount') : 0,
  };
}

const LAYOUTS = {
  a: ()=> `
    <div class="card">
      <h2>生徒を編集</h2>
      ${basicHtml()}
      ${gap(22)}
      ${coursesHtml()}
      ${gap(22)}
      ${feeInputsHtml()}
      ${gap(18)}
      <div class="student-fee-tables" data-fee-box></div>
      ${gap(22)}
      ${memoHtml()}
      ${actionsHtml()}
    </div>`,
  b: (registered = true)=> `
    <div class="card">
      <h2>${registered ? '生徒を編集' : '生徒を登録'}</h2>
      <div class="student-form-split">
        <div class="student-form-main">
          ${basicHtml()}
          ${gap(22)}
          ${coursesHtml(registered)}
          ${gap(22)}
          ${feeInputsHtml()}
          ${gap(22)}
          ${memoHtml()}
        </div>
        <aside class="student-fee-panel" aria-label="登録と料金">
          <div class="form-actions student-form-actions">
            <button class="primary" type="button">${registered ? '基本情報を更新' : '基本情報を登録'}</button>
            ${registered ? '<button class="ghost" type="button">キャンセル</button>' : ''}
          </div>
          <div class="student-fee-tables" data-fee-box></div>
        </aside>
      </div>
    </div>`,
  c: ()=> `
    <div class="card">
      <h2>生徒を編集</h2>
      <section class="student-form-section">
        <h3 class="student-form-section-title">基本情報</h3>
        ${basicHtml()}
      </section>
      <section class="student-form-section">
        <h3 class="student-form-section-title">受講科目</h3>
        ${gridHtml()}
      </section>
      <section class="student-form-section is-fee">
        <h3 class="student-form-section-title">料金</h3>
        ${feeInputsHtml()}
        ${gap(18)}
        <div class="student-fee-tables" data-fee-box></div>
      </section>
      <section class="student-form-section">
        <h3 class="student-form-section-title">受験・メモ</h3>
        ${memoHtml()}
      </section>
      ${actionsHtml()}
    </div>`,
};

export function renderStudentFormPreview(layout, registered = true){
  const root = document.getElementById('formRoot');
  root.innerHTML = LAYOUTS[layout](registered);
  const emptyBox = document.getElementById('emptyFeeBox');
  const refresh = ()=>{
    root.querySelector('#pvFreeArea').style.display = root.querySelector('#pvFreeToggle').checked ? '' : 'none';
    root.querySelector('[data-fee-box]').innerHTML = buildFeeTablesHtml(readForm(root, false));
    if(emptyBox) emptyBox.innerHTML = buildFeeTablesHtml(readForm(root, true));
  };
  root.oninput = refresh;
  root.onchange = refresh;
  refresh();
}
