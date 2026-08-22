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

/* ===== 週間 v5（公開中評価 → 改善案） ===== */
const WEEK_V5_SUMMARY = '公開中の週間は<strong>表のマス目（1px罫線）</strong>と<strong>生徒カード（同じ1px枠）</strong>が重なり、「どこが日付の区切りでどこが生徒の箱か」分かりにくい。月次 v4 で直した方針を週間にも適用する。';

const WEEK_V5_PLAN = [
  { prio: 'A', title: '枠の階層を分ける', now: 'マス罫線＝1px・カード枠＝1px・同じ色 → 二重枠', fix: 'マスは罫線＋薄い背景。生徒は<strong>枠なし</strong>・行と行の区切り線だけ' },
  { prio: 'A', title: '「教室 N人」をヘッダー化', now: '緑の小文字がカード直上 → ヘッダー感が弱い', fix: 'マス最上段に固定し、下線で生徒リストと分離' },
  { prio: 'B', title: '空きマス（予定なし）', now: '文字だけ・予定ありマスの方が線が多く見える', fix: 'マス背景を薄く。枠のない空 vs 中身あり、を一目で' },
  { prio: 'B', title: '月次 v4 との統一', now: '月次＝リスト IN マス、週次＝カード IN マスでルールが違う', fix: '同じ「リスト IN マス」。未決・教科色の付け方は現状維持' },
  { prio: 'C', title: '講師軸も同型に', now: '講師軸だけ sched-teacher-box（別デザイン）', fix: 'v5 本番反映時に講師軸もリスト型へ（別フェーズ可）' },
];

const WEEK_V5_PRINCIPLES = [
  '表のマス＝日付×コマの単位。罫線はここだけ（＋薄い背景）',
  '生徒1件＝枠なし2行（教科＋名前＋学年／講師行）。未決は講師行に「未決」1回',
  '生徒どうしは区切り線のみ。角丸の白箱は使わない（月次 v4 と同じ）',
  '「教室 N人」はマス内ヘッダー。定員 /12 は画面に出さない',
  '凡例は付けない（月次と同様、画面から削除済み）',
];

const SUBJECT_STYLES_V5 = {
  '国語': { bg: '#FCE8E6', text: '#9F1239' },
  '算数': { bg: '#E0F7FA', text: '#0E7490' },
  '数学': { bg: '#DBEAFE', text: '#1D4ED8' },
  '理科': { bg: '#E6F5EC', text: '#15803D' },
  '社会': { bg: '#FFF4E5', text: '#C2410C' },
  '英語': { bg: '#F3E8FF', text: '#7C3AED' },
};

const WEEK_V5_THU_SAMPLE = {
  date: '8/20(木)',
  slot: '4講',
  roomCount: 3,
  lessons: [
    { subject: '国語', student: 'テスト はなこ', grade: '小4', teacher: '三田', pending: false },
    { subject: '算数', student: 'テスト 太郎', grade: '小5', teacher: '三田', pending: false },
    { subject: '数学', student: 'テスト 次郎', grade: '中2', teacher: '三田', pending: false },
  ],
};

const WEEK_V5_GRID_DAYS = [
  {
    date: '8/17(月)',
    roomCount: 2,
    lessons: [
      { subject: '国語', student: 'テスト はなこ', grade: '小4', teacher: '三田', pending: false },
      { subject: '算数', student: 'テスト 太郎', grade: '小5', teacher: '三田', pending: false },
    ],
  },
  { date: '8/18(火)', empty: true },
  {
    date: '8/19(水)',
    roomCount: 1,
    lessons: [{ subject: '国語', student: 'テスト はなこ', grade: '小4', teacher: '三田', pending: false }],
  },
  {
    date: '8/20(木)',
    roomCount: 3,
    lessons: [
      { subject: '国語', student: 'テスト はなこ', grade: '小4', teacher: '三田', pending: false },
      { subject: '算数', student: 'テスト 太郎', grade: '小5', teacher: '三田', pending: false },
      { subject: '数学', student: 'テスト 次郎', grade: '中2', teacher: '三田', pending: false },
    ],
  },
  {
    date: '8/21(金)',
    roomCount: 2,
    lessons: [
      { subject: '社会', student: 'テスト 花子', grade: '小6', teacher: '三田', pending: false },
      { subject: '英語', student: 'テスト 一郎', grade: '中1', teacher: null, pending: true },
    ],
  },
  {
    date: '8/22(土)',
    roomCount: 1,
    lessons: [{ subject: '理科', student: 'テスト あや', grade: '小5', teacher: '三田', pending: false }],
  },
];

function weekV5SubjectTag(subject) {
  const s = SUBJECT_STYLES_V5[subject] || { bg: '#EEE', text: '#333' };
  return `<span class="week-subject-tag" style="background:${s.bg};color:${s.text};">${subject}</span>`;
}

function renderWeekShippedLesson(lesson) {
  const teacherHtml = lesson.pending
    ? '<span class="week-card-meta-value is-pending">未決</span>'
    : `<span class="week-card-meta-value">${lesson.teacher} 先生</span>`;
  return `<div class="week-card">
    <div class="week-card-row1">
      ${weekV5SubjectTag(lesson.subject)}
      <span class="week-card-name">${lesson.student}</span>
      <span class="week-card-grade">${lesson.grade}</span>
    </div>
    <div class="week-card-row2">
      <span class="week-card-meta-label">講師</span>
      ${teacherHtml}
    </div>
  </div>`;
}

function renderWeekV5Lesson(lesson) {
  const teacherHtml = lesson.pending
    ? '<span class="week-v5-meta-value is-pending">未決</span>'
    : `<span class="week-v5-meta-value">${lesson.teacher} 先生</span>`;
  return `<div class="week-v5-lesson">
    <div class="week-v5-lesson-row1">
      ${weekV5SubjectTag(lesson.subject)}
      <span class="week-v5-lesson-name">${lesson.student}</span>
      <span class="week-v5-lesson-grade">${lesson.grade}</span>
    </div>
    <div class="week-v5-lesson-row2">
      <span class="week-v5-meta-label">講師</span>
      ${teacherHtml}
    </div>
  </div>`;
}

function renderWeekShippedCellContent(day) {
  if (day.empty || !day.lessons?.length) {
    return '<div class="week-empty">予定なし</div>';
  }
  return `<div class="week-shipped-cell-inner">
    <div class="week-shipped-total">教室 ${day.roomCount}人</div>
    ${day.lessons.map(renderWeekShippedLesson).join('')}
  </div>`;
}

function renderWeekV5CellContent(day) {
  if (day.empty || !day.lessons?.length) {
    return '<div class="week-v5-empty">予定なし</div>';
  }
  return `<div class="week-v5-cell">
    <div class="week-v5-head">教室 ${day.roomCount}人</div>
    <div class="week-v5-list">${day.lessons.map(renderWeekV5Lesson).join('')}</div>
  </div>`;
}

function renderWeekV5SlotMock(day, contentFn, extraCls = '') {
  return `<div class="week-cell-mock ${extraCls}">
    <div class="week-cell-head">${day.date} · ${day.slot || '4講'}</div>
    ${contentFn(day)}
  </div>`;
}

function renderWeekV5GridTable(contentFn, tableCls = '') {
  const isV5 = tableCls.includes('week-v5-table');
  const headers = WEEK_V5_GRID_DAYS.map(d => `<th>${d.date.replace(/\(.\)/, '')}</th>`).join('');
  const cells = WEEK_V5_GRID_DAYS.map(d => {
    const tdCls = isV5 ? (d.empty ? 'week-v5-td is-empty' : 'week-v5-td') : '';
    return `<td${tdCls ? ` class="${tdCls}"` : ''}>${contentFn(d)}</td>`;
  }).join('');
  return `<table class="week-grid-table ${tableCls}"><thead><tr><th>4講</th>${headers}</tr></thead><tbody><tr><th>14:50〜</th>${cells}</tr></tbody></table>`;
}

/* ===== 週間 v6（v5 却下後・4パターン） ===== */
const WEEK_V6_SUMMARY = 'v5 は「表と生徒の枠を分ける」ために<strong>枠を全部消した</strong>結果、生徒1人1人の塊が消え、<strong>文字が罫線に溶け込む</strong>状態になった。週間は情報量が多いので、<strong>マスはくぼませ、生徒は白い箱で浮かせる</strong>のが正解に近い。';

const WEEK_V6_VARIANTS = [
  {
    id: 'live',
    tag: '公開中 v5',
    title: '枠なしリスト',
    desc: 'いまの画面。行の区切り線だけ。ボックス感ゼロ。',
    rec: false,
  },
  {
    id: 'a',
    tag: '案A ★おすすめ',
    title: '浮きカード',
    desc: '灰色マス＋白カードに<strong>影と隙間</strong>。枠線は使わない。',
    rec: true,
  },
  {
    id: 'b',
    tag: '案B',
    title: '1枚パネル',
    desc: 'マス内に白パネル1枚。生徒は中で区切り線。',
    rec: false,
  },
  {
    id: 'c',
    tag: '案C',
    title: '左ライン',
    desc: '白行＋左の青ライン＋軽い影。カードより薄い。',
    rec: false,
  },
  {
    id: 'd',
    tag: '案D',
    title: 'くぼみ＋枠付きカード',
    desc: 'v2 に近い。濃いめのマス＋白カード（薄枠＋影）。',
    rec: false,
  },
];

const WEEK_V6_PROSCONS = [
  {
    id: 'a',
    title: '案A 浮きカード（おすすめ）',
    rec: true,
    good: ['生徒1人＝1つの白い箱と一目で分かる', '表の罫線と箱の影で<strong>階層がはっきり</strong>', '3人並びでも読みやすい', '月次（リスト）と役割分担できる'],
    bad: ['影を使うので月次より「厚み」は出る', '実装は CSS 数行増'],
  },
  {
    id: 'b',
    title: '案B 1枚パネル',
    rec: false,
    good: ['マス内がすっきり1ブロック', '実装が単純'],
    bad: ['生徒の境目が区切り線のみ → 案Aより弱い', '3人だと再び「線だらけ」に見えやすい'],
  },
  {
    id: 'c',
    title: '案C 左ライン',
    rec: false,
    good: ['軽くてモダン', '未決行だけライン色を変える拡張も可'],
    bad: ['「箱」より「行」に見える → 要望の浮き感は案A・Dに劣る'],
  },
  {
    id: 'live',
    title: '公開中 v5（却下）',
    rec: false,
    good: ['月次 v4 と見た目ルールを揃えられる'],
    bad: ['週間では情報が多すぎて<strong>より分かりづらい</strong>（フィードバックどおり）', '生徒の開始・終了が視覚的に分からない'],
  },
  {
    id: 'd',
    title: '案D くぼみ＋枠付きカード',
    rec: false,
    good: ['v2 時代よりマス背景で表と分離', 'カード感は案Aと同程度'],
    bad: ['カード枠＋表罫線で、案Aより「線」が多い', 'v2 の二重枠問題が残りやすい'],
  },
];

function renderWeekV6LessonBody(lesson) {
  const teacherHtml = lesson.pending
    ? '<span class="week-v6-meta-value is-pending">未決</span>'
    : `<span class="week-v6-meta-value">${lesson.teacher} 先生</span>`;
  return `<div class="week-v6-lesson-row1">
      ${weekV5SubjectTag(lesson.subject)}
      <span class="week-v6-lesson-name">${lesson.student}</span>
      <span class="week-v6-lesson-grade">${lesson.grade}</span>
    </div>
    <div class="week-v6-lesson-row2">
      <span class="week-v6-meta-label">講師</span>
      ${teacherHtml}
    </div>`;
}

function renderWeekV6Head(count) {
  return `<div class="week-v6-head">教室 ${count}人</div>`;
}

function renderWeekV6LiveCell(day) {
  if (day.empty || !day.lessons?.length) {
    return '<div class="week-v6-empty">予定なし</div>';
  }
  return `<div class="week-v6-well">${renderWeekV6Head(day.roomCount)}<div class="week-v5-list">${day.lessons.map(l => `<div class="week-v5-lesson">${renderWeekV6LessonBody(l)}</div>`).join('')}</div></div>`;
}

function renderWeekV6aCell(day) {
  if (day.empty || !day.lessons?.length) {
    return '<div class="week-v6-empty">予定なし</div>';
  }
  return `<div class="week-v6-well">${renderWeekV6Head(day.roomCount)}<div class="week-v6a-stack">${day.lessons.map(l => `<div class="week-v6a-card">${renderWeekV6LessonBody(l)}</div>`).join('')}</div></div>`;
}

function renderWeekV6bCell(day) {
  if (day.empty || !day.lessons?.length) {
    return '<div class="week-v6-empty">予定なし</div>';
  }
  return `<div class="week-v6-well"><div class="week-v6b-panel">${renderWeekV6Head(day.roomCount)}${day.lessons.map(l => `<div class="week-v6b-lesson">${renderWeekV6LessonBody(l)}</div>`).join('')}</div></div>`;
}

function renderWeekV6cCell(day) {
  if (day.empty || !day.lessons?.length) {
    return '<div class="week-v6-empty">予定なし</div>';
  }
  return `<div class="week-v6-well">${renderWeekV6Head(day.roomCount)}<div class="week-v6c-stack">${day.lessons.map(l => `<div class="week-v6c-card"><span class="week-v6c-accent"></span><div class="week-v6c-body">${renderWeekV6LessonBody(l)}</div></div>`).join('')}</div></div>`;
}

function renderWeekV6dCell(day) {
  if (day.empty || !day.lessons?.length) {
    return '<div class="week-v6-empty">予定なし</div>';
  }
  return `<div class="week-v6-well is-deep">${renderWeekV6Head(day.roomCount)}<div class="week-v6d-stack">${day.lessons.map(l => `<div class="week-v6d-card">${renderWeekV6LessonBody(l)}</div>`).join('')}</div></div>`;
}

const WEEK_V6_RENDERERS = {
  live: renderWeekV6LiveCell,
  a: renderWeekV6aCell,
  b: renderWeekV6bCell,
  c: renderWeekV6cCell,
  d: renderWeekV6dCell,
};

function renderWeekV6MiniPanel(variant, day, note) {
  const v = WEEK_V6_VARIANTS.find(x => x.id === variant);
  const render = WEEK_V6_RENDERERS[variant];
  return `<div class="week-v6-mini-panel">
    <div class="week-v6-mini-head is-${variant === 'live' ? 'live' : variant}">${v.tag}</div>
    <div class="week-v6-mini-body">${render(day)}</div>
    <div class="week-v6-mini-note">${note}</div>
  </div>`;
}

function renderWeekV6GridTable(contentFn) {
  const headers = WEEK_V5_GRID_DAYS.map(d => `<th>${d.date.replace(/\(.\)/, '')}</th>`).join('');
  const cells = WEEK_V5_GRID_DAYS.map(d => {
    const cls = d.empty ? 'week-v6-td is-empty' : 'week-v6-td';
    return `<td class="${cls}">${contentFn(d)}</td>`;
  }).join('');
  return `<table class="week-grid-table week-v6-table"><thead><tr><th>4講</th>${headers}</tr></thead><tbody><tr><th>14:50〜</th>${cells}</tr></tbody></table>`;
}

function renderWeekV6Section() {
  document.getElementById('weekV6Summary').innerHTML = WEEK_V6_SUMMARY;
  document.getElementById('weekV6Recommend').innerHTML = `
    <strong>AIのおすすめ：案A（浮きカード）</strong><br>
    理由：ご指摘の「生徒ボックスを浮かび上がらせる」にいちばん素直。表の罫線は<strong>マスの外側だけ</strong>、生徒は<strong>白＋影＋6pxの隙間</strong>で1人1箱に見える。月次は行リストのまま、週間だけカード型に分けるのが合理的（週間は1マスに複数生徒が載るため）。
  `;

  document.getElementById('weekV6VariantCards').innerHTML = WEEK_V6_VARIANTS.map(v => `
    <div class="week-v6-variant-card${v.rec ? ' is-rec' : ''}">
      <span class="v6-tag">${v.tag}</span>
      <strong>${v.title}</strong><br>${v.desc}
    </div>
  `).join('');

  const sample = WEEK_V5_THU_SAMPLE;
  document.getElementById('weekV6CellCompare').innerHTML = [
    renderWeekV6MiniPanel('live', sample, '行の区切りだけ。箱として認識しにくい'),
    renderWeekV6MiniPanel('a', sample, '1人＝1枚の白カード。影で表から浮く'),
    renderWeekV6MiniPanel('b', sample, '白パネル1枚の中に3行。塊はあるが個別感は弱い'),
    renderWeekV6MiniPanel('c', sample, '左の青線で行を強調。軽いが「箱」感は中程度'),
    renderWeekV6MiniPanel('d', sample, 'v2系。枠線＋影。案Aより線が多い'),
  ].join('');

  document.getElementById('weekV6GridCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head v3b-now">公開中 v5 — 8/17〜8/22 · 4講</div>
      <div class="compare-panel-body">${renderWeekV6GridTable(renderWeekV6LiveCell)}</div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head v4">案A 浮きカード — 同じデータ</div>
      <div class="compare-panel-body">${renderWeekV6GridTable(renderWeekV6aCell)}</div>
    </div>
  `;

  document.getElementById('weekV6ProsCons').innerHTML = WEEK_V6_PROSCONS.map(item => `
    <div class="week-v6-pros-item${item.rec ? ' is-rec' : ''}">
      <h4>${item.title}</h4>
      <strong>良い点</strong>
      <ul>${item.good.map(g => `<li>${g}</li>`).join('')}</ul>
      <strong>弱い点</strong>
      <ul>${item.bad.map(b => `<li>${b}</li>`).join('')}</ul>
    </div>
  `).join('');
}

function renderWeekV5Section() {
  document.getElementById('weekV5Summary').innerHTML = WEEK_V5_SUMMARY;
  document.getElementById('weekV5PlanList').innerHTML = WEEK_V5_PLAN.map(item => `
    <div class="v4-plan-item">
      <span class="prio">${item.prio}</span>
      <div><strong>${item.title}</strong>いま：${item.now}<br>v5：${item.fix}</div>
    </div>
  `).join('');
  document.getElementById('weekV5PrincipleList').innerHTML = WEEK_V5_PRINCIPLES.map(p => `<li>${p}</li>`).join('');

  document.getElementById('weekV5BorderCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head v3b-now">公開中 — 表の線＋カードの枠が同じ</div>
      <div class="compare-panel-body">
        ${renderWeekV5SlotMock(WEEK_V5_THU_SAMPLE, renderWeekShippedCellContent)}
        <div class="week-v5-annotate">
          <span class="tag-grid">■ 薄グレー線</span>＝日付×コマのマス目<br>
          <span class="tag-card">■ 同じ薄グレー線</span>＝生徒カードの枠 → <strong>区別がつかない</strong>
        </div>
        <div class="problem-callout bad">3人並ぶと横線が4重。どこまでが「木曜のマス」か読み取りにくい</div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head v4">v5 案 — マスは背景＋罫線、生徒は行リスト</div>
      <div class="compare-panel-body">
        ${renderWeekV5SlotMock(WEEK_V5_THU_SAMPLE, renderWeekV5CellContent, 'is-v5')}
        <div class="week-v5-annotate">
          <span class="tag-grid">■ マス</span>＝薄い背景＋外側罫線だけ<br>
          <span class="tag-list">■ 生徒</span>＝枠なし。行と行の間だけ区切り線
        </div>
        <div class="problem-callout good">「表の区切り」と「生徒の情報」が別レイヤーに見える</div>
      </div>
    </div>
  `;

  document.getElementById('weekV5GridCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head v3b-now">公開中 — 8/17〜8/22 · 4講</div>
      <div class="compare-panel-body">${renderWeekV5GridTable(renderWeekShippedCellContent)}</div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head v4">v5 案 — 同じデータ</div>
      <div class="compare-panel-body">${renderWeekV5GridTable(renderWeekV5CellContent, 'week-v5-table')}</div>
    </div>
  `;

  document.getElementById('weekV5HeaderCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head v3b-now">公開中</div>
      <div class="compare-panel-body">
        <div style="max-width:160px;">
          <div class="week-shipped-total">教室 2人</div>
          ${renderWeekShippedLesson(WEEK_V5_GRID_DAYS[0].lessons[0])}
        </div>
        <div class="problem-callout bad">人数ラベルと1人目カードの距離が近く、<strong>ヘッダー</strong>に見えない</div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head v4">v5 案</div>
      <div class="compare-panel-body">
        <div style="max-width:160px;border:1px solid var(--preview-border);background:var(--preview-surface-subtle);">
          ${renderWeekV5CellContent(WEEK_V5_GRID_DAYS[0])}
        </div>
        <div class="problem-callout good">「教室 2人」行の<strong>下線</strong>で、サマリーと生徒リストが分かれる</div>
      </div>
    </div>
  `;
}

/* ===== v4 修正方針（v3b 評価後） ===== */
const V4_SUMMARY = 'v3b で「4講→2人→未決」の順序は直った。残るのは<strong>マス右の空白・二重枠・凡例の長さ・週行の高さ揃え</strong>。v4 はここを狙う。';

const V4_PLAN = [
  { prio: 'A', title: '行の外枠をやめる', now: '4行リストに独自の枠 → マス罫線と二重', fix: '行間の区切り線だけ。リスト外枠なし（TimeTree方針どおり）' },
  { prio: 'A', title: '左詰め flex 1行', now: 'grid 2列で塊は左寄せ → 右半分が空白に見える', fix: '<code>4講 2人 未決1</code> を gap 4px で横並び（wrap可）。右端まで引き伸ばさない' },
  { prio: 'A', title: '未決バッジの余白', now: 'gap 3px で「人」とバッジが触れる', fix: '人数と未決の間 <code>gap: 5px</code>、バッジ padding 少し広げる' },
  { prio: 'B', title: '凡例を2行', now: '7項目が1行 → 小さくて読めない', fix: '1行目＝コマの見方、2行目＝休校・未決の点' },
  { prio: 'B', title: 'min-height を下げる', now: 'open マス min-height 78px → 週内でさらに伸びる', fix: '72px 目安。週行の高さ揃え自体はカレンダー仕様で完全解消不可' },
  { prio: 'C', title: '選択日の見せ方', now: 'outline 2px で 3日と 4日 の差が大きい', fix: '背景色のみ（outline 細く or なし）' },
  { prio: 'C', title: '予定なしの日', now: 'マス全体 opacity 0.55', fix: '「—」の行だけ薄く。日付数字は通常の濃さ' },
  { prio: 'C', title: 'ツールチップ', now: '定員12人が title に残る', fix: '定員は tooltip のみ維持（画面には出さない方針はそのまま）' },
];

function renderV4SlotRow(slot) {
  const count = slot.confirmed + slot.pending;
  const isEmpty = count === 0;
  const countHtml = isEmpty
    ? '<span class="v4-count is-dash">—</span>'
    : `<span class="v4-count">${count}人</span>`;
  const badge = slot.pending > 0 ? `<span class="v4-badge">未決${slot.pending}</span>` : '';
  const rowCls = ['v4-slot-row', isEmpty ? 'is-empty' : ''].filter(Boolean).join(' ');
  return `<div class="${rowCls}"><span class="v4-label">${slot.label}</span>${countHtml}${badge}</div>`;
}

function renderV4SlotStack(slots, { boxed = false } = {}) {
  const cls = ['v4-slot-stack', boxed ? 'is-boxed' : ''].filter(Boolean).join(' ');
  return `<div class="${cls}">${slots.map(renderV4SlotRow).join('')}</div>`;
}

function renderV4Cell(dayData, opts = {}) {
  const { selected = false } = opts;
  const dot = dayData.hasPending ? '<span class="pending-dot"></span>' : '';
  const cellCls = ['v4-cell', selected ? 'is-selected' : ''].filter(Boolean).join(' ');
  return `<div class="${cellCls}"><div class="mini-cal-daynum">${dayData.day}${dot}</div>${renderV4SlotStack(dayData.slots)}</div>`;
}

function renderV4PlanSection() {
  document.getElementById('v4Summary').innerHTML = V4_SUMMARY;
  document.getElementById('v4PlanList').innerHTML = V4_PLAN.map(item => `
    <div class="v4-plan-item">
      <span class="prio">${item.prio}</span>
      <div><strong>${item.title}</strong>いま：${item.now}<br>v4：${item.fix}</div>
    </div>
  `).join('');

  const sample = FEEDBACK_DAYS[0];
  const slotPending = { label: '5講', confirmed: 1, pending: 1 };

  document.getElementById('v4RowCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head v3b-now">v3b 公開中 — リストに外枠・右が空く</div>
      <div class="compare-panel-body">
        <div style="max-width:130px;margin:0 auto;">${renderV3bCell(sample)}</div>
        <div class="problem-callout bad">枠が二重。情報は左の塊だけ → <strong>右半分がスカスカ</strong>に見える</div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head v4">v4 案 — 外枠なし・flex 左詰め</div>
      <div class="compare-panel-body">
        <div class="v4-cell" style="max-width:130px;margin:0 auto;"><div class="mini-cal-daynum">${sample.day}<span class="pending-dot"></span></div>${renderV4SlotStack(sample.slots)}</div>
        <div class="problem-callout good">マス罫線だけ。各行 <code>4講 2人 未決1</code> が続いて読める</div>
      </div>
    </div>
  `;

  document.getElementById('v4BadgeCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head v3b-now">v3b — gap 3px</div>
      <div class="compare-panel-body">
        <div style="max-width:130px;margin:0 auto;">${renderV3bSlotStack([slotPending])}</div>
        <div class="problem-callout bad">狭いマスで <strong>2人</strong> と <strong>未決1</strong> が触れやすい</div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head v4">v4 — gap 5px ＋ padding</div>
      <div class="compare-panel-body">
        <div style="max-width:130px;margin:0 auto;">${renderV4SlotStack([slotPending])}</div>
        <div class="problem-callout good">人数と未決の間を少し空け、バッジを読みやすく</div>
      </div>
    </div>
  `;

  document.getElementById('v4LegendCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head v3b-now">v3b 凡例 — 1行7項目</div>
      <div class="compare-panel-body legend-block">
        <div class="legend-row-wrap" style="font-size:10px;">
          <span>4講2人 … 7講— … 未決1 … 青点 … 定休 … 祝日 … 個別休校</span>
        </div>
        <div class="problem-callout bad">横に長く、文字とサンプルが小さい</div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head v4">v4 凡例 — 2行</div>
      <div class="compare-panel-body">
        <div class="v4-legend">
          <div class="v4-legend-row">
            <span class="legend-chip">${renderV4SlotStack([{ label: '4講', confirmed: 2, pending: 0 }])} 各コマ</span>
            <span class="legend-chip">${renderV4SlotStack([{ label: '7講', confirmed: 0, pending: 0 }])} 予定なし</span>
            <span class="legend-chip">${renderV4SlotStack([{ label: '5講', confirmed: 2, pending: 1 }])} 講師未決</span>
          </div>
          <div class="v4-legend-row">
            <span class="legend-chip"><span class="pending-dot"></span> その日に未決あり</span>
            <span class="legend-chip"><span class="cal-dot closed" style="width:9px;height:9px;border-radius:50%;background:#AAA;display:inline-block;"></span> 定休日</span>
            <span class="legend-chip"><span style="width:9px;height:9px;border-radius:50%;background:#C44;display:inline-block;"></span> 祝日休校</span>
            <span class="legend-chip"><span style="width:9px;height:9px;border-radius:50%;background:#888;display:inline-block;"></span> 個別休校</span>
          </div>
        </div>
        <div class="problem-callout good">見る順番どおり2段。サンプルは実際の4行と同じ型</div>
      </div>
    </div>
  `;

  document.getElementById('v4HeightNote').innerHTML = `
    <strong>週行の高さが揃うのはカレンダーの仕組み</strong>
    <ul>
      <li>同じ週の7マスは、<strong>いちばん高いマス</strong>に合わせて伸びる（CSS Grid の仕様）</li>
      <li>v4 でできること：<code>min-height</code> を 72px 程度まで下げ、中身を 17px×4行 に詰める</li>
      <li>v4 で<strong>できない</strong>こと：4日だけマスを低くする（隣の日と高さを別々にはできない）</li>
    </ul>
    <p style="margin:10px 0 0;">${renderCalStripMock(FEEDBACK_DAYS, (d) => renderV4Cell(d, { selected: d.day === 3 }))}</p>
    <p style="margin:8px 0 0;font-size:10px;color:#666;">↑ v4 案・3日だけ選択色。4日は予定なしだが高さは5日に合わせて伸びる（仕様）</p>
  `;

  document.getElementById('v4MiscNote').innerHTML = `
    <div class="v4-misc-card">
      <strong>選択した日</strong>
      v3b：outline 2px + 薄青背景 → 隣の日との差が大きい<br>
      v4：薄青背景のみ（枠線はマス共通の罫線）
    </div>
    <div class="v4-misc-card">
      <strong>予定なしの日（4日）</strong>
      v3b：マス全体が薄くなる<br>
      v4：「—」の行だけ薄く。日付「4」は通常表示
    </div>
    <div class="v4-misc-card">
      <strong>今日（23日）と未決の青</strong>
      v3b：青丸（今日）＋ 青点（未決）の2種類<br>
      v4：ルールは維持。凡例2行目で説明を分ける
    </div>
    <div class="v4-misc-card">
      <strong>定員の表示</strong>
      画面には出さない。マウスを乗せたときだけ「定員12人」（現状維持）
    </div>
  `;
}

document.getElementById('principleList').innerHTML = PRINCIPLES.map(p => `<li>${p}</li>`).join('');
document.getElementById('weekPrincipleList').innerHTML = WEEK_PRINCIPLES.map(p => `<li>${p}</li>`).join('');
renderWeekV6Section();
renderWeekV5Section();
renderV4PlanSection();
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
