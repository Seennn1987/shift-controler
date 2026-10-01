import { firstYearAnnualFee } from '../shared/student-fees.js';
import wamLogoUrl from './assets/wam-logo.jpg';

const CLASSROOM_NAME = '清澄白河校';

const ANNUAL_MONTHS = [
  { label:'4〜6月', month:4 }, { label:'7月', month:7 }, { label:'8月', month:8 }, { label:'9月', month:9 },
  { label:'10月', month:10 }, { label:'11月', month:11 }, { label:'12月', month:12 }, { label:'1月', month:1 },
  { label:'2月', month:2 }, { label:'3月', month:3 },
];

const yen = n => `${Math.max(0, Math.round(Number(n) || 0)).toLocaleString('ja-JP')}円`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

function joinMonthMatches(entryMonth, startMonth1){
  if(entryMonth === 4) return startMonth1 >= 4 && startMonth1 <= 6;
  return entryMonth === startMonth1;
}

function formatDate(dateStr){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return '未設定';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

/** 紙に出す金額（割引後）。授業料は月4回として計算した目安 */
function computeSheetAmounts(data){
  const f = data.fees;
  const disc = data.discounts || {};
  const initial = Math.max(0, (Number(f.enrollment) || 0) + (Number(f.registration) || 0) - (Number(disc.initial) || 0));
  const annualBase = data.startMonth1 ? firstYearAnnualFee(data.startMonth1, f) : Number(f.annual) || 0;
  const annual = Math.max(0, annualBase - (Number(disc.annual) || 0));
  const tuition = data.rate * data.weeklyUnits * 4;
  const monthlyFees = Math.max(0, (Number(f.maintenance) || 0) + (Number(f.elearning) || 0) - (Number(disc.monthly) || 0));
  const programming = data.programmingFee || 0;
  return { initial, annualBase, annual, tuition, monthlyFees, programming, monthlyTotal: tuition + monthlyFees + programming };
}

function headHtml(data){
  const grade = data.gradeLabel ? `（${esc(data.gradeLabel)}）` : '';
  return `
    <header class="ps-head">
      <div class="ps-head-main">
        <h1 class="ps-title">授業スケジュールと費用のご案内</h1>
        <div class="ps-student">${esc(data.studentName)} 様${grade}</div>
        <dl class="ps-meta">
          <div><dt>受講開始日</dt><dd>${formatDate(data.startDate)}</dd></div>
          <div><dt>授業料コース</dt><dd>${esc(data.courseLabel)}</dd></div>
          <div><dt>作成日</dt><dd>${formatDate(data.issuedDate)}</dd></div>
        </dl>
      </div>
      <div class="ps-brand">
        <img class="ps-logo" src="${wamLogoUrl}" alt="個別指導WAM">
        <div class="ps-classroom">${CLASSROOM_NAME}</div>
      </div>
    </header>`;
}

function weekHtml(data){
  const head = data.days.map(d => `<th scope="col">${esc(d)}</th>`).join('');
  const rows = data.slots.map(slot => {
    const tds = data.days.map(day => {
      const subjects = data.cells[`${day}-${slot.id}`] || [];
      if(!subjects.length) return '<td class="ps-week-empty"></td>';
      return `<td class="ps-week-lesson">${subjects.map(s => `<span class="ps-week-subj">${esc(s)}</span>`).join('')}</td>`;
    }).join('');
    return `<tr><th scope="row"><span class="ps-week-slot">${esc(slot.label)}</span><span class="ps-week-time">${esc(slot.time)}</span></th>${tds}</tr>`;
  }).join('');
  return `
    <section class="ps-section">
      <h2 class="ps-section-title">毎週の授業</h2>
      <table class="ps-week">
        <thead><tr><th scope="col" class="ps-week-corner">時間</th>${head}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p class="ps-note-line">1コマ90分です。週${data.weeklyUnits}コマ${data.programmingFee ? '（プログラミングは別に月額）' : ''}</p>
    </section>`;
}

function discountRow(label, amount){
  if(!(Number(amount) > 0)) return '';
  return `<tr class="ps-discount"><th scope="row">キャンペーン割引（${esc(label)}）</th><td>−${yen(amount)}</td></tr>`;
}

function initialHtml(data, amounts){
  const f = data.fees;
  const disc = data.discounts || {};
  return `
    <section class="ps-section">
      <h2 class="ps-section-title">ご入会に必要な費用（税込）</h2>
      <table class="ps-fee-table">
        <tr><th scope="row">入会金</th><td>${yen(f.enrollment)}</td></tr>
        <tr><th scope="row">塾生登録料</th><td>${yen(f.registration)}</td></tr>
        ${discountRow('初期費用', disc.initial)}
        <tr><th scope="row">年会費（${data.startMonth1 ? `${data.startMonth1}月お申込み` : '初年度'}）</th><td>${yen(amounts.annualBase)}</td></tr>
        ${discountRow('年会費', disc.annual)}
        <tr class="ps-subtotal"><th scope="row">ご入会時の合計</th><td>${yen(amounts.initial + amounts.annual)}</td></tr>
      </table>
    </section>`;
}

function monthlyHtml(data, amounts){
  const f = data.fees;
  const disc = data.discounts || {};
  const tuitionRow = data.noCourses
    ? '<tr><th scope="row">授業料<span class="ps-fee-sub">（先に受講科目を登録してください）</span></th><td>—</td></tr>'
    : `<tr><th scope="row">授業料</th><td>${yen(amounts.tuition)}</td></tr>`;
  return `
    <section class="ps-section">
      <h2 class="ps-section-title">毎月のお月謝（税込）</h2>
      <table class="ps-fee-table">
        ${tuitionRow}
        ${amounts.programming ? `<tr><th scope="row">プログラミング</th><td>${yen(amounts.programming)}</td></tr>` : ''}
        <tr><th scope="row">維持管理費</th><td>${yen(f.maintenance)}</td></tr>
        <tr><th scope="row">Eラーニング費</th><td>${yen(f.elearning)}</td></tr>
        ${discountRow('月ごとの費用', disc.monthly)}
        <tr class="ps-subtotal"><th scope="row">毎月のお月謝（目安）</th><td>${data.noCourses ? '—' : yen(amounts.monthlyTotal)}</td></tr>
      </table>
      <p class="ps-note-line">授業料は月4回として計算した目安です。月の授業回数によって変わります。</p>
    </section>`;
}

function annualTableHtml(data){
  const f = data.fees;
  const cls = m => joinMonthMatches(m.month, data.startMonth1) ? ' class="is-join"' : '';
  const head = ANNUAL_MONTHS.map(m => `<th scope="col"${cls(m)}>${m.label}</th>`).join('');
  const body = ANNUAL_MONTHS.map(m => `<td${cls(m)}>${firstYearAnnualFee(m.month, f).toLocaleString('ja-JP')}</td>`).join('');
  return `
    <div class="ps-annual-wrap">
      <div class="ps-annual-caption">初年度の年会費は、お申込み月によって次のとおりです（円）。<span class="ps-join-key">太枠</span>がお申込み月です。</div>
      <table class="ps-annual">
        <thead><tr><th scope="row">申込月</th>${head}</tr></thead>
        <tbody><tr><th scope="row">年会費</th>${body}</tr></tbody>
      </table>
    </div>`;
}

function freeLessonHtml(data){
  if(!(Number(data.freeLessonCount) > 0)) return '';
  return `<p class="ps-campaign">キャンペーン：最初の${Number(data.freeLessonCount)}コマの授業料は無料です。</p>`;
}

function notesHtml(){
  return `
    <ul class="ps-notes">
      <li>すでにごきょうだいが在籍されている場合、入会金は不要です。</li>
      <li>翌年度以降の年会費は、毎年4月分のお月謝に加算されます。</li>
      <li>ご請求はご家庭につき1件とさせていただきます。</li>
    </ul>`;
}

/** 入会時に渡す案内の紙（A4タテ1枚）の中身 */
function buildPrintSheetHtml(data){
  const amounts = computeSheetAmounts(data);
  return `
    <article class="print-sheet">
      ${headHtml(data)}
      ${weekHtml(data)}
      <div class="ps-cols">
        <div>${initialHtml(data, amounts)}</div>
        <div>${monthlyHtml(data, amounts)}</div>
      </div>
      ${freeLessonHtml(data)}
      ${annualTableHtml(data)}
      ${notesHtml()}
    </article>`;
}

/** 生徒登録画面に出す金額の表（紙と同じ表） */
function buildFeeTablesHtml(data){
  const amounts = computeSheetAmounts(data);
  return `
    <div class="ps-cols">
      <div>${initialHtml(data, amounts)}</div>
      <div>${monthlyHtml(data, amounts)}</div>
    </div>
    ${freeLessonHtml(data)}`;
}

export { buildPrintSheetHtml, buildFeeTablesHtml, computeSheetAmounts };
