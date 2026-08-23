const SUBJECT_STYLE = {
  '国語': { bg: '#FCE8E6', text: '#9F1239' },
  '算数': { bg: '#E0F7FA', text: '#0E7490' },
  '数学': { bg: '#DBEAFE', text: '#1D4ED8' },
  '理科': { bg: '#E6F5EC', text: '#15803D' },
  '社会': { bg: '#FFF4E5', text: '#C2410C' },
  '英語': { bg: '#F3E8FF', text: '#7C3AED' },
};

const SUBJECT_ABBR = {
  '国語': '国',
  '算数': '数',
  '数学': '数',
  '理科': '理',
  '社会': '社',
  '英語': '英',
};

const DRAFT_SAMPLES = [
  { date: '8/24', weekday: '月', slot: '4講', teacher: '大竹 敦子', student: 'テステス', grade: '小4', subject: '国語', auto: true },
  { date: '8/25', weekday: '火', slot: '5講', teacher: '大竹 敦子', student: 'テステス', grade: '小4', subject: '算数', auto: true },
  { date: '8/25', weekday: '火', slot: '6講', teacher: '三田 千遥', student: 'テスト準', grade: '小4', subject: '算数', auto: true },
  { date: '8/25', weekday: '火', slot: '6講', teacher: '印南 希羽', student: 'テストはなこ', grade: '小4', subject: '社会', auto: true },
  { date: '8/25', weekday: '火', slot: '6講', teacher: '印南 希羽', student: 'テストはなこ', grade: '小4', subject: '国語', auto: true },
  { date: '8/25', weekday: '火', slot: '6講', teacher: '印南 希羽', student: 'テストはなこ', grade: '小4', subject: '算数', auto: true },
];

const RULES = [
  '案C共通：教科1字・講師は苗字+先生・「自動」右端',
  '1行固定（改行・折返しなし）',
  'ここでは<strong>日時の見せ方だけ</strong>を4案比較',
  '列幅240px＝本番仮決め列',
];

const RECOMMEND = `
  <strong>おすすめ：案C2（日時テキスト・バッジなし）</strong><br>
  枠線・背景を外すだけで日時が約12px狭くなり、生徒名が1〜2文字分読めます。曜日は半角括弧 <code>(月)</code> のまま残せます。<br>
  コマだけ区切りたい場合は<strong>案C4（日付テキスト + コマchip）</strong>も候補です。
`;

const WHEN_RENDERERS = {
  fullPill(item){
    return `<span class="cal-alert-when-pill">${item.date}<span class="cal-alert-when-wd">（${item.weekday}）</span> ${item.slot}</span>`;
  },
  cBase(item){
    return `<span class="cal-alert-when-pill">${item.date}<span class="cal-alert-when-wd">（${item.weekday}）</span> ${item.slot}</span>`;
  },
  halfParenPill(item){
    return `<span class="cal-alert-when-pill is-half-paren">${item.date}<span class="cal-alert-when-wd">(${item.weekday})</span> ${item.slot}</span>`;
  },
  plainText(item){
    return `<span class="cal-alert-when-text">${item.date}<span class="cal-alert-when-wd">(${item.weekday})</span> ${item.slot}</span>`;
  },
  shortPill(item){
    const slotNum = item.slot.replace('講', '');
    return `<span class="cal-alert-when-pill is-short">${item.date}·${slotNum}講</span>`;
  },
  splitDateSlot(item){
    return `<span class="cal-alert-when-split">
      <span class="cal-alert-when-date">${item.date}(${item.weekday})</span>
      <span class="cal-alert-slot-chip">${item.slot}</span>
    </span>`;
  },
};

const VARIANTS = [
  {
    id: 'c1',
    title: '案C1 — pill + 半角括弧',
    rec: false,
    note: '現行 pill のまま、曜日を (月) 半角括弧。padding 1px 5px で細く。',
    when: 'halfParenPill',
  },
  {
    id: 'c2',
    title: '案C2 — 日時テキスト（バッジなし）★',
    rec: true,
    note: '枠・背景なし。8/24(月) 4講 を gray テキストで表示。いちばん省スペース。',
    when: 'plainText',
  },
  {
    id: 'c3',
    title: '案C3 — 短縮 pill',
    rec: false,
    note: '曜日を省略し 8/24·4講 のみ。pill は最小 padding。',
    when: 'shortPill',
  },
  {
    id: 'c4',
    title: '案C4 — 日付テキスト + コマ chip',
    rec: false,
    note: '8/24(月) はテキスト、4講 だけ mini chip。コマが視認しやすい。',
    when: 'splitDateSlot',
  },
];

const PROS_CONS = [
  {
    title: '案C2 日時テキスト ★',
    rec: true,
    good: ['日時が最もコンパクト', '曜日を残せる', '装飾が少なく一覧がすっきり', '生徒名の表示幅が最大'],
    bad: ['日時と本文の区切りが pill より弱い'],
  },
  {
    title: '案C1 半角括弧 pill',
    rec: false,
    good: ['現行に近く移行が楽', '曜日あり', 'pill で日時が目立つ'],
    bad: ['C2より幅を取る', '改善幅は小さい'],
  },
  {
    title: '案C3 短縮 pill',
    rec: false,
    good: ['日時が短い', '曜日なしでさらに省スペース'],
    bad: ['曜日が一覧から消える', '8/25·6講 だけでは曜日判断が必要'],
  },
  {
    title: '案C4 日付 + コマ chip',
    rec: false,
    good: ['コマだけ chip でスキャンしやすい', '日付はテキストでコンパクト'],
    bad: ['要素が2つに分かれる', 'C2よりわずかに幅を取る'],
  },
];

function teacherHonorific(fullName){
  const surname = String(fullName || '').trim().split(/\s+/)[0] || fullName;
  return `${surname}先生`;
}

function subjectTag(subject, { full = false } = {}){
  const s = SUBJECT_STYLE[subject] || { bg: '#EEE', text: '#333' };
  const text = full ? subject : (SUBJECT_ABBR[subject] || subject.slice(0, 1));
  const sizeCls = full ? ' is-full' : '';
  return `<span class="sched-student-tag${sizeCls}" style="background:${s.bg};color:${s.text};">${text}</span>`;
}

function studentInline(item){
  return `<span class="cal-alert-person-inline">${item.student}（${item.grade}）</span>`;
}

function teacherHead(item){
  return `<span class="cal-alert-row-head">${teacherHonorific(item.teacher)}</span>`;
}

function autoBadge(item){
  return item.auto ? '<span class="auto-badge">自動</span>' : '';
}

function renderCRow(item, { rowClass = '', whenRenderer }){
  return `<button type="button" class="approval-item approval-item-btn cal-alert-row-c4 ${rowClass}">
    <div class="cal-alert-row-body">
      ${whenRenderer(item)}
      ${teacherHead(item)}
      ${studentInline(item)}
      ${subjectTag(item.subject)}
    </div>
    ${autoBadge(item)}
  </button>`;
}

function renderCurrent(item){
  return `<button type="button" class="approval-item approval-item-btn cal-alert-row-c4 row-current">
    <div class="cal-alert-row-body">
      ${WHEN_RENDERERS.fullPill(item)}
      <span class="cal-alert-row-head">${item.teacher}</span>
      ${studentInline(item)}
      ${subjectTag(item.subject, { full: true })}
    </div>
    ${autoBadge(item)}
  </button>`;
}

function renderCBase(item){
  return renderCRow(item, { rowClass: 'row-c-base', whenRenderer: WHEN_RENDERERS.cBase });
}

function buildPanel({ title, countLabel, rowsHtml }){
  return `<div class="shortage-panel">
    <div class="shortage-panel-head">
      <span class="shortage-panel-label">${title}</span>
      <span class="shortage-panel-count">${countLabel}</span>
    </div>
    <div class="shortage-panel-scroll">${rowsHtml}</div>
  </div>`;
}

function mount(){
  document.getElementById('ruleList').innerHTML = RULES.map(r=> `<li>${r}</li>`).join('');
  document.getElementById('evalRecommend').innerHTML = RECOMMEND;

  document.getElementById('baselineGrid').innerHTML = `
    <div class="baseline-card">
      <div class="baseline-card-head">公開中</div>
      <div class="baseline-card-body">${buildPanel({
        title: '仮決め',
        countLabel: `${DRAFT_SAMPLES.length}件`,
        rowsHtml: DRAFT_SAMPLES.map(renderCurrent).join(''),
      })}</div>
    </div>
    <div class="baseline-card">
      <div class="baseline-card-head">前回案C（日時 pill・全角括弧）</div>
      <div class="baseline-card-body">${buildPanel({
        title: '仮決め',
        countLabel: `${DRAFT_SAMPLES.length}件`,
        rowsHtml: DRAFT_SAMPLES.map(renderCBase).join(''),
      })}</div>
    </div>`;

  document.getElementById('variantGrid').innerHTML = VARIANTS.map(v=> `
    <div class="variant-panel${v.rec ? ' is-rec' : ''}">
      <div class="variant-head">${v.title}</div>
      <div class="variant-note">${v.note}</div>
      <div class="variant-panel-body">
        ${buildPanel({
          title: '仮決め',
          countLabel: `${DRAFT_SAMPLES.length}件`,
          rowsHtml: DRAFT_SAMPLES.map(item=> renderCRow(item, {
            whenRenderer: WHEN_RENDERERS[v.when],
          })).join(''),
        })}
      </div>
    </div>
  `).join('');

  document.getElementById('prosConsGrid').innerHTML = PROS_CONS.map(card=> `
    <div class="pros-cons-card${card.rec ? ' is-rec' : ''}">
      <h3>${card.title}</h3>
      <ul>
        ${card.good.map(g=> `<li>◎ ${g}</li>`).join('')}
        ${card.bad.map(b=> `<li>△ ${b}</li>`).join('')}
      </ul>
    </div>
  `).join('');
}

mount();
