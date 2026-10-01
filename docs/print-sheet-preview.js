const yen = n => `${Math.max(0, Math.round(Number(n) || 0)).toLocaleString('ja-JP')}円`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

const ANNUAL_MONTHS = [
  { label:'4〜6月', month:4 }, { label:'7月', month:7 }, { label:'8月', month:8 }, { label:'9月', month:9 },
  { label:'10月', month:10 }, { label:'11月', month:11 }, { label:'12月', month:12 }, { label:'1月', month:1 },
  { label:'2月', month:2 }, { label:'3月', month:3 },
];

export function firstYearAnnualFee(startMonth1, fees){
  const full = Number(fees.annual) || 0;
  if(startMonth1 >= 4 && startMonth1 <= 6) return full;
  const remaining = startMonth1 >= 7 ? 16 - startMonth1 : 4 - startMonth1;
  return Math.min(full, remaining * (Number(fees.annualMonthlyReduction) || 0));
}

function joinMonthMatches(entryMonth, startMonth1){
  if(entryMonth === 4) return startMonth1 >= 4 && startMonth1 <= 6;
  return entryMonth === startMonth1;
}

function formatDate(dateStr){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || '')) return '未設定';
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

/** 紙に出す金額をまとめて計算する */
export function computeSheetAmounts(data){
  const f = data.fees;
  const disc = data.discounts || {};
  const initialBase = (Number(f.enrollment) || 0) + (Number(f.registration) || 0);
  const initial = Math.max(0, initialBase - (Number(disc.initial) || 0));
  const annualBase = data.startMonth1 ? firstYearAnnualFee(data.startMonth1, f) : Number(f.annual) || 0;
  const annual = Math.max(0, annualBase - (Number(disc.annual) || 0));
  const tuition = data.rate * data.weeklyUnits * 4;
  const monthlyBase = (Number(f.maintenance) || 0) + (Number(f.elearning) || 0);
  const monthlyFees = Math.max(0, monthlyBase - (Number(disc.monthly) || 0));
  const programming = data.programmingFee || 0;
  const monthlyTotal = tuition + monthlyFees + programming;
  return { initialBase, initial, annualBase, annual, tuition, monthlyBase, monthlyFees, programming, monthlyTotal, firstMonthTotal: initial + annual + monthlyTotal };
}

function headHtml(data){
  return `
    <header class="ps-head">
      <div>
        <h1 class="ps-title">お月謝のご案内（90分）</h1>
        <div class="ps-student">${esc(data.studentName)} <span class="ps-grade">${esc(data.gradeLabel)}</span> 様</div>
      </div>
      <dl class="ps-meta">
        <div><dt>受講開始日</dt><dd>${formatDate(data.startDate)}</dd></div>
        <div><dt>授業料コース</dt><dd>${esc(data.courseLabel)}</dd></div>
        <div><dt>作成日</dt><dd>${formatDate(data.issuedDate)}</dd></div>
      </dl>
    </header>`;
}

function weekHtml(data, { large = false } = {}){
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
      <table class="ps-week${large ? ' ps-week-large' : ''}">
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

function annualTableHtml(data){
  const f = data.fees;
  const head = ANNUAL_MONTHS.map(m => `<th scope="col" class="${joinMonthMatches(m.month, data.startMonth1) ? 'is-join' : ''}">${m.label}</th>`).join('');
  const body = ANNUAL_MONTHS.map(m => `<td class="${joinMonthMatches(m.month, data.startMonth1) ? 'is-join' : ''}">${(firstYearAnnualFee(m.month, f)).toLocaleString('ja-JP')}</td>`).join('');
  return `
    <div class="ps-annual-wrap">
      <div class="ps-annual-caption">初年度の年会費は、お申込み月によって次のとおりです（円）。<span class="ps-join-key">太枠</span>がお申込み月です。</div>
      <table class="ps-annual">
        <thead><tr><th scope="row">申込月</th>${head}</tr></thead>
        <tbody><tr><th scope="row">年会費</th>${body}</tr></tbody>
      </table>
    </div>`;
}

function formulaHtml(data, amounts){
  const f = data.fees;
  const disc = data.discounts || {};
  const box = (title, value, sub) => `<div class="ps-formula-box"><div class="ps-formula-title">${title}</div><div class="ps-formula-value">${value}</div>${sub ? `<div class="ps-formula-sub">${sub}</div>` : ''}</div>`;
  const parts = [
    box('授業料', yen(amounts.tuition), `${yen(data.rate)} × 週${data.weeklyUnits}コマ × 4回`),
    box('維持管理費', yen(f.maintenance)),
    box('Eラーニング費', yen(f.elearning)),
  ];
  if(amounts.programming) parts.push(box('プログラミング', yen(amounts.programming), '月額'));
  const monthlyDisc = Number(disc.monthly) > 0
    ? `<div class="ps-formula-discount">キャンペーン割引（月ごとの費用）−${yen(disc.monthly)}</div>` : '';
  return `
    <section class="ps-section">
      <h2 class="ps-section-title">毎月のお月謝（税込）</h2>
      <div class="ps-formula">
        <div class="ps-formula-box ps-formula-total"><div class="ps-formula-title">毎月のお月謝（目安）</div><div class="ps-formula-value">${yen(amounts.monthlyTotal)}</div></div>
        <span class="ps-formula-op">＝</span>
        ${parts.join('<span class="ps-formula-op">＋</span>')}
      </div>
      ${monthlyDisc}
      <p class="ps-note-line">授業料は月4回として計算した目安です。月の授業回数によって変わります。</p>
    </section>`;
}

function monthlyListHtml(data, amounts){
  const f = data.fees;
  const disc = data.discounts || {};
  return `
    <section class="ps-section">
      <h2 class="ps-section-title">毎月のお月謝（税込）</h2>
      <table class="ps-fee-table">
        <tr><th scope="row">授業料<span class="ps-fee-sub">${yen(data.rate)} × 週${data.weeklyUnits}コマ × 4回</span></th><td>${yen(amounts.tuition)}</td></tr>
        ${amounts.programming ? `<tr><th scope="row">プログラミング<span class="ps-fee-sub">月額</span></th><td>${yen(amounts.programming)}</td></tr>` : ''}
        <tr><th scope="row">維持管理費</th><td>${yen(f.maintenance)}</td></tr>
        <tr><th scope="row">Eラーニング費</th><td>${yen(f.elearning)}</td></tr>
        ${discountRow('月ごとの費用', disc.monthly)}
        <tr class="ps-subtotal"><th scope="row">毎月のお月謝（目安）</th><td>${yen(amounts.monthlyTotal)}</td></tr>
      </table>
      <p class="ps-note-line">授業料は月4回として計算した目安です。月の授業回数によって変わります。</p>
    </section>`;
}

function allInOneTableHtml(data, amounts){
  const f = data.fees;
  const disc = data.discounts || {};
  return `
    <section class="ps-section">
      <h2 class="ps-section-title">費用のご案内（税込）</h2>
      <table class="ps-fee-table ps-fee-table-grouped">
        <tr class="ps-group"><th colspan="2">ご入会時</th></tr>
        <tr><th scope="row">入会金</th><td>${yen(f.enrollment)}</td></tr>
        <tr><th scope="row">塾生登録料</th><td>${yen(f.registration)}</td></tr>
        ${discountRow('初期費用', disc.initial)}
        <tr><th scope="row">年会費（${data.startMonth1 ? `${data.startMonth1}月お申込み` : '初年度'}）</th><td>${yen(amounts.annualBase)}</td></tr>
        ${discountRow('年会費', disc.annual)}
        <tr class="ps-group"><th colspan="2">毎月</th></tr>
        <tr><th scope="row">授業料<span class="ps-fee-sub">${yen(data.rate)} × 週${data.weeklyUnits}コマ × 4回</span></th><td>${yen(amounts.tuition)}</td></tr>
        ${amounts.programming ? `<tr><th scope="row">プログラミング<span class="ps-fee-sub">月額</span></th><td>${yen(amounts.programming)}</td></tr>` : ''}
        <tr><th scope="row">維持管理費</th><td>${yen(f.maintenance)}</td></tr>
        <tr><th scope="row">Eラーニング費</th><td>${yen(f.elearning)}</td></tr>
        ${discountRow('月ごとの費用', disc.monthly)}
        <tr class="ps-subtotal"><th scope="row">毎月のお月謝（目安）</th><td>${yen(amounts.monthlyTotal)}</td></tr>
        <tr class="ps-grand"><th scope="row">初月にお支払いいただく合計（目安）</th><td>${yen(amounts.firstMonthTotal)}</td></tr>
      </table>
    </section>`;
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

/** layout: 'a'（画像に近い形）/ 'b'（授業が主役）/ 'c'（2段組み） */
export function buildPrintSheetHtml(data, layout = 'a'){
  const amounts = computeSheetAmounts(data);
  let body = '';
  if(layout === 'a'){
    body = `
      ${initialHtml(data, amounts)}
      ${annualTableHtml(data)}
      ${formulaHtml(data, amounts)}
      ${freeLessonHtml(data)}
      ${weekHtml(data)}
      ${notesHtml()}`;
  }else if(layout === 'b'){
    body = `
      ${weekHtml(data, { large: true })}
      ${allInOneTableHtml(data, amounts)}
      ${freeLessonHtml(data)}
      ${annualTableHtml(data)}
      ${notesHtml()}`;
  }else{
    body = `
      ${weekHtml(data)}
      <div class="ps-cols">
        <div>${initialHtml(data, amounts)}</div>
        <div>${monthlyListHtml(data, amounts)}</div>
      </div>
      ${freeLessonHtml(data)}
      ${annualTableHtml(data)}
      ${notesHtml()}`;
  }
  return `<article class="print-sheet print-sheet-${layout}">${headHtml(data)}${body}</article>`;
}

export const SAMPLE_DATA = {
  studentName: '山田 太郎',
  gradeLabel: '中1',
  startDate: '2026-09-01',
  startMonth1: 9,
  issuedDate: '2026-10-01',
  courseLabel: 'ベーシック',
  days: ['月','火','水','木','金','土'],
  slots: [
    { id:4, label:'4講', time:'14:50〜16:20' },
    { id:5, label:'5講', time:'16:40〜18:10' },
    { id:6, label:'6講', time:'18:20〜19:50' },
    { id:7, label:'7講', time:'20:00〜21:30' },
  ],
  cells: {
    '火-5': ['数学'],
    '火-6': ['英語', '国語'],
    '木-5': ['理科'],
    '土-4': ['プログラミング'],
  },
  weeklyUnits: 3,
  rate: 3900,
  programmingFee: 8000,
  freeLessonCount: 2,
  fees: { enrollment:16500, registration:11000, annual:11000, annualMonthlyReduction:1100, maintenance:2750, elearning:3300 },
  discounts: { initial:5500, annual:0, monthly:1100 },
};
