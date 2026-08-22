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

/** 現状（公開中）の行HTML */
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
renderColumnCompare();
renderCellZoomCompare();
renderLegendCompare();
renderWeekCellCompare();
renderWeekGridCompare();
renderWeekLegendCompare();
