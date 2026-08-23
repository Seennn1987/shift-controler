const SUBJECT_STYLE = {
  '国語': { bg: '#FCE8E6', text: '#9F1239' },
  '算数': { bg: '#E0F7FA', text: '#0E7490' },
  '数学': { bg: '#DBEAFE', text: '#1D4ED8' },
  '理科': { bg: '#E6F5EC', text: '#15803D' },
  '社会': { bg: '#FFF4E5', text: '#C2410C' },
  '英語': { bg: '#F3E8FF', text: '#7C3AED' },
};

const SHORTAGE_SAMPLES = [
  { date: '8/24', weekday: '月', slot: '4講', student: 'テスト太郎', grade: '中2', subject: '数学' },
  { date: '8/24', weekday: '月', slot: '5講', student: 'テストはなこ', grade: '小5', subject: '国語' },
];

const APPROVAL_SAMPLES = [
  { date: '8/24', weekday: '月', slot: '4講', teacher: 'テスト講師2', student: 'テスト太郎', grade: '中2', subject: '数学' },
  { date: '8/25', weekday: '火', slot: '6講', teacher: 'テスト講師2', student: 'テストはなこ', grade: '小5', subject: '算数' },
];

const COLOR_NOTE = `
  <strong>緑を使っていたのは誤りです。</strong>デザインシステムでは緑（--green-* / --success）は<strong>「確定・成功」</strong>用です。
  日付・コマのラベルに緑を使うルールはありません。UI基盤は<strong>グレー＋ブランド青</strong>、色付きは<strong>教科タグだけ</strong>（Layer B）です。
`;

const RULES = [
  '1行・縦幅最小（案C系）',
  '並び：日付 → コマ → 生徒（学年）→ 教科タグ',
  '名前と学年はセット：テスト太郎（中2）',
  '未確定の太字＝生徒（学年）、承認待ちの太字＝講師名',
  '日付・コマはグレーのメタ表示（緑禁止）',
];

const RECOMMEND = `
  <strong>おすすめ：C4（日時1 pill ＋ コンパクト）</strong><br>
  日付とコマを1つの neutral pill にまとめ、人名（学年）と教科タグを横に並べる。チップ過多よりすっきり、縦幅はC1と同程度。
`;

const COLOR_LEGEND = [
  { swatch: '#EFF1F4', label: 'UI基盤', desc: '日付・コマ・枠（--surface-muted / --border）' },
  { swatch: '#333333', label: '本文', desc: '生徒名・講師名（--ink）' },
  { swatch: '#DBEAFE', label: '教科のみ', desc: '数学タグ等（subjectColor・Layer B）' },
  { swatch: '#787E8D', label: '補助', desc: '学年・メタ文字（--ink-soft）' },
  { swatch: '#ECF2FD', label: '未確定/承認待ち', desc: '行 hover のみ（--brand-50）' },
  { swatch: '#EEF6EB', label: '緑＝使わない', desc: '成功・確定専用。日付ラベルには使わない' },
];

function subjectTag(subject) {
  const s = SUBJECT_STYLE[subject] || { bg: '#EEE', text: '#333' };
  return `<span class="sched-student-tag" style="background:${s.bg};color:${s.text};">${subject}</span>`;
}

function statusBadge(kind) {
  const text = kind === 'shortage' ? '未確定' : '承認待ち';
  return `<span class="approval-badge pending">${text}</span>`;
}

function personHead(name, grade) {
  return `<span class="row-head">${name}<span class="grade">（${grade}）</span></span>`;
}

function metaDate(item) {
  return `<span class="meta-chip">${item.date}（${item.weekday}）</span>`;
}

function metaSlot(item) {
  return `<span class="meta-chip">${item.slot}</span>`;
}

function metaDateText(item) {
  return `<span class="meta-text">${item.date}（${item.weekday}）</span>`;
}

function metaSlotText(item) {
  return `<span class="meta-text">${item.slot}</span>`;
}

function whenPill(item) {
  return `<span class="when-pill">${item.date}<span class="wd">（${item.weekday}）</span> ${item.slot}</span>`;
}

/* C1: メタチップ列 + 太字頭 */
function renderC1(kind, item) {
  const badge = statusBadge(kind);
  if (kind === 'shortage') {
    return `<button type="button" class="approval-item approval-item-btn row-c1">
      <div class="row-body">
        ${metaDate(item)}${metaSlot(item)}
        ${personHead(item.student, item.grade)}
        ${subjectTag(item.subject)}
      </div>${badge}</button>`;
  }
  return `<button type="button" class="approval-item approval-item-btn row-c1">
    <div class="row-body">
      ${metaDate(item)}${metaSlot(item)}
      <span class="row-head">${item.teacher}</span>
      <span class="meta-text">${item.student}（${item.grade}）</span>
      ${subjectTag(item.subject)}
    </div>${badge}</button>`;
}

/* C2: 太字頭 → 点区切りメタ */
function renderC2(kind, item) {
  const badge = statusBadge(kind);
  if (kind === 'shortage') {
    return `<button type="button" class="approval-item approval-item-btn row-c2">
      <div class="row-body">
        ${personHead(item.student, item.grade)}
        <span class="meta-dot">·</span>
        ${metaDateText(item)}
        <span class="meta-dot">·</span>
        ${metaSlotText(item)}
        <span class="meta-dot">·</span>
        ${subjectTag(item.subject)}
      </div>${badge}</button>`;
  }
  return `<button type="button" class="approval-item approval-item-btn row-c2">
    <div class="row-body">
      <span class="row-head">${item.teacher}</span>
      <span class="meta-dot">·</span>
      ${metaDateText(item)}
      <span class="meta-dot">·</span>
      ${metaSlotText(item)}
      <span class="meta-dot">·</span>
      <span class="meta-text">${item.student}（${item.grade}）</span>
      <span class="meta-dot">·</span>
      ${subjectTag(item.subject)}
    </div>${badge}</button>`;
}

/* C3: 縦線で3グループ */
function renderC3(kind, item) {
  const badge = statusBadge(kind);
  if (kind === 'shortage') {
    return `<button type="button" class="approval-item approval-item-btn row-c3">
      <div class="row-body">
        <span class="seg">${metaDate(item)}${metaSlot(item)}</span>
        <span class="seg-divider"></span>
        <span class="seg">${personHead(item.student, item.grade)}</span>
        <span class="seg-divider"></span>
        <span class="seg">${subjectTag(item.subject)}</span>
      </div>${badge}</button>`;
  }
  return `<button type="button" class="approval-item approval-item-btn row-c3">
    <div class="row-body">
      <span class="seg">${metaDate(item)}${metaSlot(item)}</span>
      <span class="seg-divider"></span>
      <span class="seg"><span class="row-head">${item.teacher}</span></span>
      <span class="seg-divider"></span>
      <span class="seg"><span class="meta-text">${item.student}（${item.grade}）</span> ${subjectTag(item.subject)}</span>
    </div>${badge}</button>`;
}

/* C4: 日時1 pill + コンパクト */
function renderC4(kind, item) {
  const badge = statusBadge(kind);
  if (kind === 'shortage') {
    return `<button type="button" class="approval-item approval-item-btn row-c4">
      <div class="row-body">
        ${whenPill(item)}
        ${personHead(item.student, item.grade)}
        ${subjectTag(item.subject)}
      </div>${badge}</button>`;
  }
  return `<button type="button" class="approval-item approval-item-btn row-c4">
    <div class="row-body">
      ${whenPill(item)}
      <span class="row-head">${item.teacher}</span>
      <span class="teacher-inline">${item.student}（${item.grade}）</span>
      ${subjectTag(item.subject)}
    </div>${badge}</button>`;
}

const VARIANTS = [
  {
    id: 'c1',
    title: 'C1 メタチップ列',
    rec: false,
    render: renderC1,
    note: '区切りは明確だがチップが多く、ややごちゃつく。',
  },
  {
    id: 'c2',
    title: 'C2 太字頭＋点区切り',
    rec: false,
    render: renderC2,
    note: 'チップなしで軽い。項目が多いと折り返しやすい。',
  },
  {
    id: 'c3',
    title: 'C3 縦線3グループ',
    rec: false,
    render: renderC3,
    note: 'when / who / what が線で分かれる。狭い幅で詰まりやすい。',
  },
  {
    id: 'c4',
    title: 'C4 日時1 pill ★おすすめ',
    rec: true,
    render: renderC4,
    note: '縦幅最小クラス。日時を1か所にまとめ、色はUI基盤＋教科タグのみ。',
  },
];

const PROS_CONS = [
  {
    title: 'C4 日時1 pill ★',
    rec: true,
    good: ['1行・低い行高', 'チップ過多を避けすっきり', 'デザインシステム準拠', '承認待ちも同型'],
    bad: ['日付とコマが1塊なのでコマだけ比較は弱い'],
  },
  {
    title: 'C1 メタチップ列',
    rec: false,
    good: ['項目の境界がはっきり', '1行'],
    bad: ['チップが多く旧案Cと同系のごちゃつき'],
  },
  {
    title: 'C2 点区切り',
    rec: false,
    good: ['装飾が少ない', '1行'],
    bad: ['ベタ打ちに近く区切りが弱い'],
  },
  {
    title: 'C3 縦線',
    rec: false,
    good: ['グループが視覚的', '1行'],
    bad: ['スマホ幅で切れやすい', '線が増える'],
  },
];

function renderList(kind, renderFn, samples) {
  return `<div class="approval-scroll">${samples.map(item => renderFn(kind, item)).join('')}</div>`;
}

function renderMiniPanel(kind, count, unit, renderFn) {
  const samples = kind === 'shortage' ? SHORTAGE_SAMPLES : APPROVAL_SAMPLES;
  const summary = kind === 'shortage'
    ? `未確定 ${count}${unit} · 日付が近い順`
    : `承認待ち ${count}${unit} · 日付が近い順`;
  return `
    <div class="mini-bar">${summary}<span class="chev">▾</span></div>
    <div class="mini-well">
      <div class="mini-label">要対応 <span>${count}${unit}</span></div>
      ${renderList(kind, renderFn, samples)}
    </div>`;
}

function renderVariantPanel(v) {
  return `
    <div class="variant-panel${v.rec ? ' is-rec' : ''}">
      <div class="variant-head">${v.title}</div>
      <div class="variant-body">
        ${renderMiniPanel('shortage', 26, 'コマ', v.render)}
        ${renderMiniPanel('approval', 12, '件', v.render)}
        <div class="variant-note">${v.note}</div>
      </div>
    </div>`;
}

document.getElementById('colorNote').innerHTML = COLOR_NOTE;
document.getElementById('ruleList').innerHTML = RULES.map(r => `<li>${r}</li>`).join('');
document.getElementById('evalRecommend').innerHTML = RECOMMEND;
document.getElementById('colorLegend').innerHTML = COLOR_LEGEND.map(l => `
  <div class="legend-item">
    <span class="legend-swatch" style="background:${l.swatch};"></span>
    <strong>${l.label}</strong> — ${l.desc}
  </div>`).join('');
document.getElementById('variantGrid').innerHTML = VARIANTS.map(renderVariantPanel).join('');
document.getElementById('prosConsGrid').innerHTML = PROS_CONS.map(p => `
  <div class="pros-item${p.rec ? ' is-rec' : ''}">
    <h4>${p.title}</h4>
    <strong>良い点</strong>
    <ul>${p.good.map(g => `<li>${g}</li>`).join('')}</ul>
    <strong>弱い点</strong>
    <ul>${p.bad.map(b => `<li>${b}</li>`).join('')}</ul>
  </div>`).join('');
