const SLOTS = ['4講', '5講', '6講', '7講'];

const PRINCIPLES = [
  '毎日同じ4行（4講→7講）。0人でも「7講 —」と表示し、行を消さない',
  '行の枠・背景は常に同じ（白＋薄い実線）。青破線は行全体には使わない',
  '人数は常に「5講 2人」。未決だけの日も人数を隠さない',
  '講師未決は右余白に小さく「未決N」（4行とも同じ高さ・人数は右端で縦揃え）',
  '混雑の黄/橙/グレーレベルは月間ではやめる（週間・日詳細に任せる）',
  'その日に未決が1件でもあれば、日付横に青い点（任意）',
];

/** スクショ再現用サンプル（木曜列） */
const SAMPLE_DAYS = [
  {
    day: 3,
    selected: true,
    slots: [
      { label: '4講', confirmed: 2, pending: 0 },
      { label: '5講', confirmed: 1, pending: 1 },
      { label: '6講', confirmed: 2, pending: 0 },
      { label: '7講', confirmed: 0, pending: 0 },
    ],
  },
  {
    day: 10,
    slots: [
      { label: '4講', confirmed: 0, pending: 2 },
      { label: '5講', confirmed: 0, pending: 2 },
      { label: '6講', confirmed: 0, pending: 2 },
      { label: '7講', confirmed: 0, pending: 0 },
    ],
  },
  {
    day: 17,
    slots: [
      { label: '4講', confirmed: 0, pending: 2 },
      { label: '5講', confirmed: 0, pending: 2 },
      { label: '6講', confirmed: 0, pending: 2 },
      { label: '7講', confirmed: 0, pending: 0 },
    ],
  },
  {
    day: 24,
    slots: [
      { label: '4講', confirmed: 0, pending: 2 },
      { label: '5講', confirmed: 0, pending: 2 },
      { label: '6講', confirmed: 0, pending: 2 },
      { label: '7講', confirmed: 0, pending: 0 },
    ],
  },
  {
    day: 31,
    slots: [
      { label: '4講', confirmed: 0, pending: 2 },
      { label: '5講', confirmed: 0, pending: 2 },
      { label: '6講', confirmed: 0, pending: 2 },
      { label: '7講', confirmed: 0, pending: 0 },
    ],
  },
];

const ROOM_CAPACITY = 12;

function occupancyLevel(count) {
  const ratio = count / ROOM_CAPACITY;
  if (count === 0) return 0;
  if (ratio < 0.4) return 1;
  if (ratio < 0.8) return 2;
  return 3;
}

const FEEDBACK_DAYS = [
  {
    day: 3,
    hasPending: true,
    slots: [
      { label: '4講', confirmed: 2, pending: 0 },
      { label: '5講', confirmed: 1, pending: 1 },
      { label: '6講', confirmed: 2, pending: 0 },
      { label: '7講', confirmed: 0, pending: 0 },
    ],
  },
  {
    day: 4,
    hasPending: false,
    slots: [
      { label: '4講', confirmed: 0, pending: 0 },
      { label: '5講', confirmed: 0, pending: 0 },
      { label: '6講', confirmed: 0, pending: 0 },
      { label: '7講', confirmed: 0, pending: 0 },
    ],
  },
  {
    day: 5,
    hasPending: true,
    slots: [
      { label: '4講', confirmed: 1, pending: 1 },
      { label: '5講', confirmed: 1, pending: 0 },
      { label: '6講', confirmed: 0, pending: 0 },
      { label: '7講', confirmed: 0, pending: 0 },
    ],
  },
];

const V3_SUMMARY = 'v3b 採用案：マス min-height やめる／4行リストは内容の高さだけ／2列（4講｜人数+未決）で見えない空列なし／行高18px・padding 0';

const FEEDBACK_ISSUES = [
  {
    title: '全体的に見た目が整っていない',
    bad: '行が白箱の上に白箱で重なり、マスごとに青枠の有無がバラバラ。丸角の小箱が4つ並び、枠の中に枠でごちゃつく。',
    good: '行は<strong>1つのリスト</strong>にまとめ、色は未決バッジと日付の点だけ。選んだ日だけマス背景を薄青に。',
  },
  {
    title: '4日だけ青線で囲まれていない',
    bad: '本番CSSの <code>.cal-cell.has-pending</code> が「未決がある日だけ」マス全体に青い inset 枠を付けている。4日は予定ゼロで未決なし → 枠なし。',
    good: 'v3 ではこの青枠を<strong>やめる</strong>。未決の目印は「行の未決N」と「日付横の青点」だけ。クリックした日は従来どおり薄青背景。',
  },
  {
    title: '4講 と 2人 の間が10文字分以上空く（横）',
    bad: '本番CSSで <code>4講</code> を左固定、<code>2人</code> を <code>right:28px</code> に固定。間の幅いっぱいが空白になる（ユーザーが指摘した見づらさの本体）。',
    good: 'v3b：<code>grid-template-columns: 1.75em auto</code> ＋ gap 4px。<strong>4講の直後に 2人</strong>、未決バッジは 2人 の隣（gap 3px）。右端まで引き伸ばさない。',
  },
  {
    title: '「1人」と「未決1」が重なる',
    bad: '人数とバッジを absolute で右側に固定。マス幅が狭いと 28px 地点の「1人」と 24px 幅のバッジが物理的に重なる。',
    good: '人数と未決を <code>.cal-heat-meta</code> 内で flex 横並び（gap 3px）。重ならない。',
  },
  {
    title: '凡例が読めない',
    bad: '凡例サンプルに本番と同じ absolute 配置をそのまま使い、幅 52px の箱に「4講」「2人」「未決1」を押し込んでいる。',
    good: '凡例専用の v3-legend-row（グリッド・幅 78px 以上）を使う。セル内の行デザインと同型だが、説明用に最低幅を保証。',
  },
  {
    title: '余白が多すぎて読みづらい',
    bad: 'マス min-height <code>150px</code>、行間 gap、行 padding 右34px、<code>flex:1</code> で行ブロックが伸びる → 4行の下に大きな空白。v3案もモック min-height 96px・見えない「未決0」列で<strong>まだ空く</strong>。',
    good: 'v3b：<strong>min-height をやめる</strong>（高さ＝日付＋4行だけ）。2列（4講｜人数+未決を横並び）でスペーサ列廃止。行高 <code>18px</code>、マス padding <code>2px</code>。',
  },
  {
    title: '角丸であるべきか',
    bad: '各行に border-radius 6px の白箱。カレンダー全体は角のない罫線グリッドなのに、中だけ丸角ボックス → デザイン方針（TimeTree準拠）と矛盾。',
    good: '月間マスの行は<strong>角丸なし（0px）</strong>。未決バッジだけ小さく丸角。週間カード（別画面・余裕あり）は従来どおり radius-md 可。',
  },
];

/** v2 公開版：absolute 配置（本番と同じ・重なりやすい） */
function renderV2ShippedSlotRow(slot) {
  const count = slot.confirmed + slot.pending;
  const hasPending = slot.pending > 0;
  const isEmpty = count === 0;
  const countHtml = isEmpty
    ? '<span class="v2-slot-count is-dash">—</span>'
    : `<span class="v2-slot-count">${count}人</span>`;
  const badge = hasPending
    ? `<span class="v2-pending-badge">未決${slot.pending}</span>`
    : '';
  const rowCls = ['v2-shipped-slot-row', isEmpty ? 'is-empty' : ''].filter(Boolean).join(' ');
  return `<div class="${rowCls}"><span class="v2-slot-label">${slot.label}</span>${countHtml}<span class="v2-slot-badge-anchor">${badge}</span></div>`;
}

/** v3 案：3列グリッド（重ならない）— stackMode: flat | rounded */
function renderV3SlotRow(slot, stackMode = 'flat') {
  const count = slot.confirmed + slot.pending;
  const hasPending = slot.pending > 0;
  const isEmpty = count === 0;
  const countHtml = isEmpty
    ? '<span class="v3-slot-count is-dash">—</span>'
    : `<span class="v3-slot-count">${count}人</span>`;
  const badge = hasPending
    ? `<span class="v3-slot-badge">未決${slot.pending}</span>`
    : '<span class="v3-slot-badge is-spacer" aria-hidden="true">未決0</span>';
  const rowCls = ['v3-slot-row', 'recommended', isEmpty ? 'is-empty' : ''].filter(Boolean).join(' ');
  return `<div class="${rowCls}"><span class="v3-slot-label">${slot.label}</span>${countHtml}${badge}</div>`;
}

function renderV3SlotStack(slots, stackMode = 'flat') {
  const rows = slots.map(s => renderV3SlotRow(s, stackMode)).join('');
  const stackCls = ['v3-slot-stack', stackMode === 'rounded' ? 'is-rounded' : 'is-flat'].join(' ');
  return `<div class="${stackCls}">${rows}</div>`;
}

/** v3b：2列・スペーサなし・行高18px（本当に詰める） */
function renderV3bSlotRow(slot) {
  const count = slot.confirmed + slot.pending;
  const isEmpty = count === 0;
  const countHtml = isEmpty
    ? '<span class="v3b-count is-dash">—</span>'
    : `<span class="v3b-count">${count}人</span>`;
  const badge = slot.pending > 0 ? `<span class="v3b-badge">未決${slot.pending}</span>` : '';
  const rowCls = ['v3b-slot-row', isEmpty ? 'is-empty' : ''].filter(Boolean).join(' ');
  return `<div class="${rowCls}"><span class="v3b-label">${slot.label}</span><span class="v3b-meta">${countHtml}${badge}</span></div>`;
}

function renderV3bSlotStack(slots) {
  return `<div class="v3b-slot-stack">${slots.map(renderV3bSlotRow).join('')}</div>`;
}

function renderV3bCell(dayData) {
  const dot = dayData.hasPending ? '<span class="pending-dot"></span>' : '';
  return `<div class="v3b-cell"><div class="mini-cal-daynum">${dayData.day}${dot}</div>${renderV3bSlotStack(dayData.slots)}</div>`;
}

function renderCalStripMock(days, renderCell) {
  const cells = days.map(d => renderCell(d)).join('');
  return `<div class="cal-strip-mock" aria-label="1週間分のマス幅">${cells}</div>`;
}

function renderV3Cell(dayData, opts = {}) {
  const { compact = true, stackMode = 'flat' } = opts;
  const stack = renderV3SlotStack(dayData.slots, stackMode);
  const dot = dayData.hasPending ? '<span class="pending-dot"></span>' : '';
  const cellCls = ['feedback-week-cell', 'is-honest-v3', compact ? 'is-compact' : ''].filter(Boolean).join(' ');
  return `<div class="${cellCls}"><div class="mini-cal-daynum">${dayData.day}${dot}</div>${stack}</div>`;
}

function renderFeedbackSummary() {
  document.getElementById('feedbackSummary').innerHTML = `<strong>v3b 採用案</strong> — ${V3_SUMMARY}（v3案は行だけ詰まり、<strong>マス下の空白は残る</strong>）`;
}

function renderV2ShippedCell(dayData) {
  const rows = dayData.slots.map(renderV2ShippedSlotRow).join('');
  const dot = dayData.hasPending ? '<span class="pending-dot"></span>' : '';
  const cls = ['feedback-week-cell', 'v2-shipped-cell', dayData.hasPending ? 'has-pending-border' : ''].filter(Boolean).join(' ');
  return `<div class="${cls}"><div class="mini-cal-daynum">${dayData.day}${dot}</div><div class="slot-stack">${rows}</div></div>`;
}

function renderFeedbackIssueList() {
  document.getElementById('feedbackIssueList').innerHTML = FEEDBACK_ISSUES.map(issue => `
    <div class="issue-card">
      <div class="issue-card-head bad">${issue.title}</div>
      <div class="issue-side"><strong>いま起きていること</strong>${issue.bad}</div>
      <div class="issue-side"><strong>v3 で直す</strong>${issue.good}</div>
    </div>
  `).join('');
}

function renderFeedbackWeekCompare() {
  const shipped = FEEDBACK_DAYS.map(renderV2ShippedCell).join('');
  const v3b = FEEDBACK_DAYS.map(renderV3bCell).join('');
  document.getElementById('feedbackWeekCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head shipped">v2 公開中 — 未決がある日だけマスが青枠</div>
      <div class="compare-panel-body">
        <div class="feedback-week-grid">${shipped}</div>
        <div class="problem-callout bad">
          3日・5日は青枠、<strong>4日（予定なし）だけ枠なし</strong> → カレンダー全体のリズムが崩れる
        </div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head v3">v3b 採用案 — 高さ＝中身だけ</div>
      <div class="compare-panel-body">
        <div class="feedback-week-grid">${v3b}</div>
        <div class="problem-callout good">
          3日も4日も5日も<strong>同じ見た目</strong>。下に空白を作らない（min-height なし）
        </div>
      </div>
    </div>
  `;
}

function renderFeedbackSpacingCompare() {
  const sample = FEEDBACK_DAYS[0];
  const stripDays = FEEDBACK_DAYS;
  document.getElementById('feedbackSpacingCompare').innerHTML = `
    <div class="compare-panel compare-panel-wide">
      <div class="compare-panel-head shipped">v3 案 — 行は詰まったが、<strong>まだ空きが残る</strong></div>
      <div class="compare-panel-body spacing-compare-body">
        <div class="spacing-visual">
          ${renderV3Cell(sample, { compact: true, stackMode: 'flat' })}
          <p class="spacing-caption bad-caption">↑ モック min-height 96px ＋ 見えない「未決0」列 ＋ 下の説明箱 → <strong>埋まっていない</strong></p>
        </div>
        <div class="spacing-diagram">
          <strong>v3 で残っていた空き</strong>
          <ul>
            <li>本番 <code>.cal-cell { min-height: 150px }</code> は v3 説明だけでは未着手</li>
            <li>3列目に <code>visibility:hidden</code> のスペーサ → 未決なし行も右に空列</li>
            <li>プレビュー見本自体が min-height 固定で、スクショの大きな白が出る</li>
          </ul>
        </div>
      </div>
    </div>
    <div class="compare-panel compare-panel-wide">
      <div class="compare-panel-head v3">v3b — 実際の1週間マス幅で確認</div>
      <div class="compare-panel-body spacing-compare-body">
        ${renderCalStripMock(stripDays, renderV3bCell)}
        <p class="spacing-caption good-caption">↑ 7列グリッド・高さは日付＋4行のみ。下に空白なし</p>
        <div class="spacing-diagram">
          <strong>v3b の数値</strong>
          <ul>
            <li>マス <code>min-height: 0</code>、padding <code>2px</code></li>
            <li>2列：<code>4講</code> ｜ 右端に <code>2人</code>＋<code>未決1</code>（gap 3px）</li>
            <li>行高 <code>18px</code>、行 padding <code>0 3px</code>、行間 gap <code>0</code></li>
            <li><code>.cal-heat-stack { flex: 1 }</code> をやめ、伸びないようにする</li>
          </ul>
        </div>
      </div>
    </div>
  `;
}

function renderFeedbackRadiusCompare() {
  const sample = FEEDBACK_DAYS[0];
  document.getElementById('feedbackRadiusCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head shipped">丸角ボックス ×4（v2系）</div>
      <div class="compare-panel-body">
        <div class="feedback-week-cell is-compact" style="max-width:120px;margin:0 auto;">
          <div class="mini-cal-daynum">${sample.day}</div>
          ${renderV3SlotStack(sample.slots, 'rounded')}
        </div>
        <div class="radius-note">
          各行が独立した丸角箱 → マスの直角グリッドと<strong>二重の形</strong>になり、すっきりしない。
        </div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head v3">v3b 採用 — 角なしリスト</div>
      <div class="compare-panel-body">
        <div class="v3b-cell" style="max-width:120px;margin:0 auto;">
          <div class="mini-cal-daynum">${sample.day}</div>
          ${renderV3bSlotStack(sample.slots)}
        </div>
        <div class="radius-note">
          <strong>おすすめ：月間は行 radius 0。</strong>未決バッジだけ <code>4px</code> 丸角。週間の生徒カード（別UI・幅に余裕）は <code>radius-md 8px</code> のままでOK。
        </div>
      </div>
    </div>
  `;
}

function renderFeedbackHorizontalGap() {
  const slot = { label: '5講', confirmed: 1, pending: 1 };
  document.getElementById('feedbackHorizontalGap').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head shipped">本番 — 左端と右端に固定</div>
      <div class="compare-panel-body">
        <div class="gap-demo-row is-bad">4講<span class="gap-fill">············</span>1人<span class="gap-fill">·</span>未決1</div>
        ${renderV2ShippedSlotRow(slot)}
        <div class="problem-callout bad">「4講」と「1人」の間が<strong>横に最大まで</strong>空く。これが見づらい原因</div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head v3">v3b — 4講の直後に人数</div>
      <div class="compare-panel-body">
        <div class="gap-demo-row is-good">4講 2人 未決1</div>
        ${renderV3bSlotStack([slot])}
        <div class="problem-callout good">gap 4px ＋ 2人 の隣に未決。右側の空白は<strong>情報の後ろ</strong>だけ</div>
      </div>
    </div>
  `;
}

function renderFeedbackRowCompare() {
  const overlapSlot = { label: '5講', confirmed: 1, pending: 1 };
  document.getElementById('feedbackRowCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head shipped">v2 公開中 — absolute で重なる</div>
      <div class="compare-panel-body">
        <div class="row-zoom">${renderV2ShippedSlotRow(overlapSlot)}</div>
        <div class="problem-callout bad">「1人」の右端と「未決1」バッジが同じ座標帯に入る</div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head v3">v3b — 2列（人数+未決を右端に横並び）</div>
      <div class="compare-panel-body">
        <div class="row-zoom">${renderV3bSlotStack([overlapSlot])}</div>
        <div class="problem-callout good">見えない空列なし。人数と未決は gap 3px で並べる</div>
      </div>
    </div>
  `;
}

function renderFeedbackLegendCompare() {
  document.getElementById('feedbackLegendCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head shipped">v2 公開中の凡例（読めない）</div>
      <div class="compare-panel-body legend-block">
        <div class="legend-row-wrap">
          <span class="legend-chip">
            <span class="v2-shipped-legend-swatch">
              <span class="v2-slot-label">4講</span>
              <span class="v2-slot-count">2人</span>
              <span class="v2-slot-badge-anchor"><span class="v2-pending-badge">未決1</span></span>
            </span>
            各コマの生徒数
          </span>
          <span class="legend-chip">
            <span class="v2-shipped-legend-swatch is-empty" style="opacity:.55;">
              <span class="v2-slot-label">7講</span>
              <span class="v2-slot-count is-dash">—</span>
              <span class="v2-slot-badge-anchor"></span>
            </span>
            予定なし
          </span>
          <span class="legend-chip"><span class="v2-pending-badge">未決</span>講師未決</span>
        </div>
        <div class="problem-callout bad">52px の箱に absolute で3要素 → 凡例だけ文字が潰れる</div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head v3">v3 案の凡例</div>
      <div class="compare-panel-body legend-block">
        <div class="legend-row-wrap">
          <span class="legend-chip">
            <span class="v3-legend-row"><span class="v3-slot-label">4講</span><span class="v3-slot-count">2人</span><span></span></span>
            各コマの生徒数
          </span>
          <span class="legend-chip">
            <span class="v3-legend-row" style="opacity:.55;"><span class="v3-slot-label">7講</span><span class="v3-slot-count is-dash">—</span><span></span></span>
            予定なし
          </span>
          <span class="legend-chip">
            <span class="v3-legend-row"><span class="v3-slot-label">5講</span><span class="v3-slot-count">2人</span><span class="v3-slot-badge">未決1</span></span>
            講師未決
          </span>
          <span class="legend-chip"><span class="pending-dot"></span>その日に未決あり</span>
        </div>
        <div class="problem-callout good">凡例専用グリッドで幅を確保。セル内行と同じ型だが最低 78px</div>
      </div>
    </div>
  `;
}

function renderCurrentSlotRow(slot) {
  const count = slot.confirmed + slot.pending;
  if (count === 0) return '';
  const pendingOnly = slot.pending > 0 && slot.confirmed === 0;
  const hasPending = slot.pending > 0;
  const level = occupancyLevel(count);
  const mainText = pendingOnly ? slot.label : `${slot.label} ${count}人`;
  const badge = hasPending ? `<span class="current-pending-badge">未決${slot.pending}</span>` : '';
  const cls = pendingOnly ? 'is-pending-only' : `lv${level}`;
  return `<div class="current-slot-row ${cls}"><span class="current-slot-main">${mainText}</span>${badge}</div>`;
}

function renderCurrentCell(dayData) {
  const rows = dayData.slots.map(renderCurrentSlotRow).filter(Boolean).join('');
  const inner = rows || '<div style="font-size:11px;color:#AAA;text-align:center;margin-top:20px;">−</div>';
  const cls = ['mini-cal-cell', dayData.selected ? 'selected' : ''].filter(Boolean).join(' ');
  return `<div class="${cls}"><div class="mini-cal-daynum">${dayData.day}</div><div class="slot-stack">${inner}</div></div>`;
}

/** v2 案：4行同高・人数右揃え・未決は右余白に重ねる（横も縦も揃う） */
function renderV2SlotRow(slot) {
  const count = slot.confirmed + slot.pending;
  const hasPending = slot.pending > 0;
  const isEmpty = count === 0;
  const countHtml = isEmpty
    ? '<span class="v2-slot-count is-dash">—</span>'
    : `<span class="v2-slot-count">${count}人</span>`;
  const badge = hasPending
    ? `<span class="v2-pending-badge">未決${slot.pending}</span>`
    : '';
  const rowCls = ['v2-slot-row', isEmpty ? 'is-empty' : ''].filter(Boolean).join(' ');
  return `<div class="${rowCls}"><span class="v2-slot-label">${slot.label}</span>${countHtml}<span class="v2-slot-badge-anchor">${badge}</span></div>`;
}

function dayHasPending(dayData) {
  return dayData.slots.some(s => s.pending > 0);
}

function renderV2Cell(dayData) {
  const rows = dayData.slots.map(renderV2SlotRow).join('');
  const dot = dayHasPending(dayData) ? '<span class="pending-dot" title="講師未決あり"></span>' : '';
  const cls = ['mini-cal-cell', dayData.selected ? 'selected' : ''].filter(Boolean).join(' ');
  return `<div class="${cls}"><div class="mini-cal-daynum">${dayData.day}${dot}</div><div class="slot-stack">${rows}</div></div>`;
}

function renderMiniColumn(days, renderCell, dowLabel) {
  const cells = days.map(renderCell).join('');
  return `<div class="mini-cal-col"><div class="mini-cal-dow">${dowLabel}</div>${cells}</div>`;
}

function renderColumnCompare() {
  document.getElementById('columnCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head current">現状 — 公開中（デザインが4パターン混在）</div>
      <div class="compare-panel-body">
        ${renderMiniColumn(SAMPLE_DAYS, renderCurrentCell, '木')}
        <div class="problem-callout bad">
          ・未決だけの日は<strong>行全体が青破線</strong>＋中にも<strong>未決バッジ</strong>（二重）<br>
          ・確定＋未決の日は<strong>グレー行</strong>＋バッジで別ルール<br>
          ・0人のコマ（7講）は<strong>行ごと消える</strong>
        </div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head proposed">v2 案 — 行の型を1種類に統一</div>
      <div class="compare-panel-body">
        ${renderMiniColumn(SAMPLE_DAYS, renderV2Cell, '木')}
        <div class="problem-callout good">
          ・3日も10日も<strong>同じ行デザイン</strong>（白＋実線）<br>
          ・4行<strong>同じ高さ</strong>・白箱のみ。未決は右端バッジだけ（青グラデーションなし）<br>
          ・7講は<strong>「—」</strong>で行を残す。未決がある日は日付横に<strong>青点</strong>
        </div>
      </div>
    </div>
  `;
}

function renderCellZoomCompare() {
  const zoomDays = [
    { title: '8/3 — 確定＋未決が混在', data: SAMPLE_DAYS[0] },
    { title: '8/10 — 未決だけ（問題が出やすい日）', data: SAMPLE_DAYS[1] },
  ];
  document.getElementById('cellZoomCompare').innerHTML = zoomDays.map(({ title, data }) => `
    <div class="compare-panel">
      <div class="compare-panel-head current">${title} · 現状</div>
      <div class="compare-panel-body">
        <div class="zoom-card"><h3>マス拡大</h3>${renderCurrentCell(data)}</div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head proposed">${title} · v2</div>
      <div class="compare-panel-body">
        <div class="zoom-card"><h3>マス拡大</h3>${renderV2Cell(data)}</div>
      </div>
    </div>
  `).join('');
}

function renderLegendCompare() {
  document.getElementById('legendCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head current">現状の凡例（複雑）</div>
      <div class="compare-panel-body legend-block">
        <div class="legend-row">
          <span class="legend-chip"><span class="current-slot-row lv1" style="width:14px;height:10px;padding:0;"></span>生徒数</span>
          <span class="legend-chip"><span class="current-slot-row lv2" style="width:14px;height:10px;padding:0;"></span>やや多い</span>
          <span class="legend-chip"><span class="current-slot-row lv3" style="width:14px;height:10px;padding:0;"></span>定員に近い</span>
          <span class="legend-chip"><span class="current-pending-badge">未決</span>講師未決</span>
        </div>
        <ul>
          <li>行の見た目が状態ごとにバラバラ</li>
          <li>未決だけの行は枠とバッジが二重</li>
        </ul>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head proposed">v2 の凡例（3項目）</div>
      <div class="compare-panel-body legend-block">
        <div class="legend-row">
          <span class="legend-chip"><span class="v2-slot-row" style="padding:3px 30px 3px 6px;"><span class="v2-slot-label">4講</span><span class="v2-slot-count">2人</span><span class="v2-slot-badge-anchor"></span></span>生徒数</span>
          <span class="legend-chip"><span class="v2-slot-row is-empty" style="padding:3px 30px 3px 6px;"><span class="v2-slot-label">7講</span><span class="v2-slot-count is-dash">—</span><span class="v2-slot-badge-anchor"></span></span>予定なし</span>
          <span class="legend-chip"><span class="v2-slot-row" style="padding:3px 30px 3px 6px;"><span class="v2-slot-label">5講</span><span class="v2-slot-count">2人</span><span class="v2-slot-badge-anchor"><span class="v2-pending-badge">未決1</span></span></span>講師未決（月間のみ）</span>
          <span class="legend-chip"><span class="pending-dot"></span>その日に未決あり</span>
        </div>
      </div>
    </div>
  `;
}

const WEEK_PRINCIPLES = [
  '確定・未決で箱の枠・背景を変えない（破線箱・青グラデーションは使わない）',
  '1行目：教科タグ ＋ 名前（週間は省略しない）＋ 学年',
  '2行目：講師だけ。未決はここに「未決」と1回だけ（バッジと重複させない）',
  '「未確定」という別語は使わない。月間の狭いマスだけ「未決N」バッジ',
  'マス先頭は「教室 2人」',
];

const SUBJECT_STYLE = {
  '国語': { bg: '#FCE8E6', text: '#9F1239' },
  '理科': { bg: '#E6F5EC', text: '#15803D' },
};

const WEEK_CELL_SAMPLE = {
  date: '8/17(月)',
  slot: '4講',
  roomCount: 2,
  lessons: [
    { subject: '国語', student: 'テスト太郎1', grade: '小1', teacher: null, pending: true },
    { subject: '国語', student: 'テスト次郎2', grade: '小2', teacher: null, pending: true },
  ],
};

const WEEK_GRID_DAYS = [
  {
    date: '8/17',
    roomCount: 2,
    lessons: [
      { subject: '国語', student: 'テスト太郎1', grade: '小1', teacher: null, pending: true },
      { subject: '国語', student: 'テスト次郎2', grade: '小2', teacher: null, pending: true },
    ],
  },
  {
    date: '8/18',
    roomCount: 0,
    empty: true,
  },
  {
    date: '8/19',
    roomCount: 2,
    lessons: [
      { subject: '国語', student: 'テスト太郎1', grade: '小1', teacher: '佐藤', pending: false },
      { subject: '国語', student: 'テスト次郎2', grade: '小2', teacher: null, pending: true },
    ],
  },
];

function subjectTag(subject) {
  const s = SUBJECT_STYLE[subject] || { bg: '#EEE', text: '#333' };
  return `<span class="current-subject-tag" style="background:${s.bg};color:${s.text};">${subject}</span>`;
}

function v2SubjectTag(subject) {
  const s = SUBJECT_STYLE[subject] || { bg: '#EEE', text: '#333' };
  return `<span class="week-subject-tag" style="background:${s.bg};color:${s.text};">${subject}</span>`;
}

function renderCurrentWeekLesson(lesson) {
  const cls = lesson.pending ? 'current-week-box is-unassigned' : 'current-week-box';
  const teacherLine = lesson.teacher ? `${lesson.teacher} 先生` : '未確定';
  const pendingPill = lesson.pending ? '<span class="current-pending-pill">未確定</span>' : '';
  return `<div class="${cls}">
    <div class="current-week-name">${subjectTag(lesson.subject)}${lesson.student}<span class="grade-tag">${lesson.grade}</span>${pendingPill}</div>
    <div class="current-week-meta">講師：${teacherLine}</div>
  </div>`;
}

function renderV2WeekLesson(lesson) {
  const teacherHtml = lesson.pending
    ? '<span class="week-card-meta-value is-pending">未決</span>'
    : `<span class="week-card-meta-value">${lesson.teacher} 先生</span>`;
  return `<div class="week-card">
    <div class="week-card-row1">
      ${v2SubjectTag(lesson.subject)}
      <span class="week-card-name">${lesson.student}</span>
      <span class="week-card-grade">${lesson.grade}</span>
    </div>
    <div class="week-card-row2">
      <span class="week-card-meta-label">講師</span>
      ${teacherHtml}
    </div>
  </div>`;
}

function renderCurrentWeekCellContent(cell) {
  if (cell.empty || !cell.lessons?.length) {
    return '<div class="week-empty">予定なし</div>';
  }
  const cards = cell.lessons.map(renderCurrentWeekLesson).join('');
  return `<div class="week-room-total">教室 ${cell.roomCount}/${ROOM_CAPACITY}</div>${cards}`;
}

function renderV2WeekCellContent(cell) {
  if (cell.empty || !cell.lessons?.length) {
    return '<div class="week-empty">予定なし</div>';
  }
  const cards = cell.lessons.map(renderV2WeekLesson).join('');
  return `<div class="week-room-total v2">教室 ${cell.roomCount}人</div>${cards}`;
}

function renderCurrentWeekCell(cell) {
  return `<div class="week-cell-mock"><div class="week-cell-head">${cell.date} · 4講</div>${renderCurrentWeekCellContent(cell)}</div>`;
}

function renderV2WeekCell(cell) {
  return `<div class="week-cell-mock"><div class="week-cell-head">${cell.date} · 4講</div>${renderV2WeekCellContent(cell)}</div>`;
}

function renderWeekCellCompare() {
  document.getElementById('weekCellCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head current">現状 — 実線箱と破線箱が混在</div>
      <div class="compare-panel-body">
        ${renderCurrentWeekCell(WEEK_CELL_SAMPLE)}
        <div class="problem-callout bad">
          未決だけ<strong>破線の別箱</strong>＋名前横に<strong>未確定</strong>タグ → 横も縦も揃わない
        </div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head proposed">v2 — 2行だけ・未決は講師行に1回</div>
      <div class="compare-panel-body">
        ${renderV2WeekCell(WEEK_CELL_SAMPLE)}
        <div class="problem-callout good">
          箱は白＋実線のみ。<strong>青シャドウなし</strong>。未決は講師行の<strong>「未決」1語だけ</strong>。名前は1行
        </div>
      </div>
    </div>
  `;
}

function renderWeekGridCompare() {
  const renderRow = (contentFn) => {
    const headers = WEEK_GRID_DAYS.map(d => `<th>${d.date}</th>`).join('');
    const cells = WEEK_GRID_DAYS.map(d => `<td>${contentFn(d)}</td>`).join('');
    return `<table class="week-grid-table"><thead><tr><th></th>${headers}</tr></thead><tbody><tr><th>4講</th>${cells}</tr></tbody></table>`;
  };
  document.getElementById('weekGridCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head current">現状</div>
      <div class="compare-panel-body">${renderRow(renderCurrentWeekCellContent)}</div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head proposed">v2</div>
      <div class="compare-panel-body">${renderRow(renderV2WeekCellContent)}</div>
    </div>
  `;
}

function renderWeekLegendCompare() {
  document.getElementById('weekLegendCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head current">現状</div>
      <div class="compare-panel-body legend-block">
        <div class="legend-row">
          <span class="legend-chip"><span class="current-week-box" style="padding:4px 8px;margin:0;">実線箱</span>確定</span>
          <span class="legend-chip"><span class="current-week-box is-unassigned" style="padding:4px 8px;margin:0;">破線箱</span>未決専用</span>
          <span class="legend-chip"><span class="current-pending-pill">未確定</span>名前横タグ</span>
        </div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head proposed">v2</div>
      <div class="compare-panel-body legend-block">
        <div class="legend-row">
          <span class="legend-chip"><span class="week-card" style="padding:5px 8px;margin:0;min-height:0;">白箱</span>確定・未決共通</span>
          <span class="legend-chip"><span class="week-card-meta-value is-pending">未決</span>講師行に1回だけ</span>
          <span class="legend-chip">1行目 … 教科＋名前</span>
        </div>
      </div>
    </div>
  `;
}

document.getElementById('principleList').innerHTML = PRINCIPLES.map(p => `<li>${p}</li>`).join('');
document.getElementById('weekPrincipleList').innerHTML = WEEK_PRINCIPLES.map(p => `<li>${p}</li>`).join('');
renderFeedbackSummary();
renderFeedbackIssueList();
renderFeedbackWeekCompare();
renderFeedbackHorizontalGap();
renderFeedbackRowCompare();
renderFeedbackLegendCompare();
renderFeedbackSpacingCompare();
renderFeedbackRadiusCompare();
renderColumnCompare();
renderCellZoomCompare();
renderLegendCompare();
renderWeekCellCompare();
renderWeekGridCompare();
renderWeekLegendCompare();
