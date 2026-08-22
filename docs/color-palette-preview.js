/* マネーフォワード クラウド（MFUI）系 — 参考: royalBlue #3B7DE9 / cobalt #0054AC */
const MF = {
  royalBlue: '#3B7DE9',
  cobalt: '#0054AC',
  cornflowerBlue: '#6594DA',
  solitude: '#ECF2FD',
  darkenAliceBlue: '#EDF5FE',
  cloudGrey: '#EFF1F4',
  whiteSmoke: '#F7F7F7',
  linkWater: '#D4D8DD',
  nightRider: '#333333',
  stormGrey: '#787E8D',
  darkGray: '#AAAAAA',
  vulcan: '#32373F',
  rhino: '#424954',
  apple: '#65AB51',
  venetianRed: '#D0021B',
  mistyRose: '#FFEEEB',
  cornSilk: '#FCF8E3',
  mcKenzie: '#8A6D3B',
};

const UI_TOKENS = [
  { name: '--surface-page', hex: MF.whiteSmoke, use: 'ページ背景（MF whiteSmoke）' },
  { name: '--surface-card', hex: '#FFFFFF', use: 'カード・カレンダーセル' },
  { name: '--surface-muted', hex: MF.cloudGrey, use: '表ヘッダー・フィルタバー' },
  { name: '--ink', hex: MF.nightRider, use: '本文（MF nightRider）' },
  { name: '--ink-soft', hex: MF.stormGrey, use: '補助テキスト' },
  { name: '--border', hex: MF.linkWater, use: '罫線' },
  { name: '--brand-900', hex: MF.vulcan, use: 'ヘッダー背景' },
  { name: '--brand-700', hex: MF.rhino, use: 'タブ非選択' },
  { name: '--brand-500', hex: MF.royalBlue, use: 'ボタン・アクティブタブ（MF royalBlue）' },
  { name: '--brand-600', hex: MF.cobalt, use: 'ホバー・未確定文字（MF cobalt）' },
  { name: '--brand-100', hex: MF.darkenAliceBlue, use: '選択行・ホバー' },
];

const LEGACY_INDIGO = [
  { name: '旧 --brand-500', hex: '#6366F1', use: 'インディゴ（不採用）' },
];

const LEGACY_TOKENS = [
  { name: '--green-900', hex: '#25272B', use: 'ヘッダー（実際はグレー）' },
  { name: '--green-700', hex: '#474B52', use: 'タブ・選択セル' },
  { name: '--gold', hex: '#8A7248', use: '今日の日付' },
  { name: '--gold-soft', hex: '#EFE9DD', use: '未確定・警告背景' },
  { name: 'pending', hex: '#FFF3CD', use: '未確定タグ背景' },
  { name: '--cream', hex: '#F7F7F6', use: 'ページ背景' },
  { name: '--danger', hex: '#B3462C', use: 'エラー' },
];

const SUBJECT_HUE = { '国語': 352, '数学': 208, '英語': 265, '理科': 138, '社会': 32 };
const LEVELS = [
  { key: '小学', s: 62, l: 90, label: '小' },
  { key: '中学', s: 62, l: 74, label: '中' },
  { key: '高校', s: 58, l: 50, label: '高' },
];

const STATUS_COLORS = [
  { name: '未確定', bg: MF.solitude, border: MF.royalBlue, text: MF.cobalt, dashed: true, note: 'MFの選択行トーン。黄・橙（社会）と被らない' },
  { name: '欠席', bg: MF.whiteSmoke, border: MF.whiteSmoke, text: MF.darkGray, strike: true, note: 'グレー＋打消し線' },
  { name: '振替', bg: '#CFE8FA', border: MF.nightRider, text: '#0C4A6E', dashed: true, note: '教科色＋黒破線' },
  { name: '休校・定休', bg: MF.cloudGrey, border: MF.cloudGrey, text: MF.darkGray, note: '非稼働は中立グレー' },
  { name: '祝日', bg: MF.mistyRose, border: MF.mistyRose, text: MF.venetianRed, note: 'MFエラー系の薄い背景' },
  { name: '今日', bg: MF.royalBlue, border: MF.royalBlue, text: '#FFFFFF', round: true, note: 'ゴールド丸の代替' },
  { name: '選択中セル', bg: MF.darkenAliceBlue, border: MF.royalBlue, text: MF.nightRider, ring: true, note: 'チャコール塗りの代替' },
  { name: '成功・確定', bg: '#EEF6EB', border: '#EEF6EB', text: MF.apple, note: 'MF apple（理科タグとは濃度で区別）' },
  { name: '警告', bg: MF.cornSilk, border: MF.cornSilk, text: MF.mcKenzie, note: 'MF cornSilk / mcKenzie' },
  { name: 'エラー', bg: MF.mistyRose, border: MF.mistyRose, text: MF.venetianRed, note: 'MF venetianRed' },
];

function subjectColor(level, subject) {
  const h = SUBJECT_HUE[subject] ?? 0;
  const lv = LEVELS.find(x => x.key === level) || LEVELS[1];
  const bg = `hsl(${h} ${lv.s}% ${lv.l}%)`;
  const text = lv.l < 58 ? '#ffffff' : (subject === '国語' ? '#7A1E34' : subject === '数学' ? '#0C4A6E' : subject === '英語' ? '#4C1D95' : subject === '理科' ? '#14532D' : '#7C2D12');
  return { bg, text };
}

function showToast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.hidden = true; }, 1800);
}

function copyHex(hex, label) {
  navigator.clipboard.writeText(hex).then(() => {
    showToast(`${label} ${hex} をコピーしました`);
  }).catch(() => showToast(hex));
}

function renderSwatchGrid(containerId, tokens) {
  const el = document.getElementById(containerId);
  el.innerHTML = tokens.map(t => `
    <div class="swatch" data-hex="${t.hex}" data-label="${t.name}">
      <div class="swatch-color" style="background:${t.hex};${t.hex === '#FFFFFF' ? 'border-bottom:1px solid ' + MF.linkWater + ';' : ''}"></div>
      <div class="swatch-meta">
        <div class="swatch-name">${t.name}</div>
        <div class="swatch-hex">${t.hex}</div>
        <div class="swatch-use">${t.use}</div>
      </div>
    </div>
  `).join('');
  el.querySelectorAll('.swatch').forEach(node => {
    node.addEventListener('click', () => copyHex(node.dataset.hex, node.dataset.label));
  });
}

function renderLayerDiagram() {
  document.getElementById('layerDiagram').innerHTML = `
    <div class="layer-card layer-a">
      <div class="layer-card-head">A. UI基盤</div>
      <div class="layer-card-body">
        <strong>MFクラウド系ブルー＋温かみグレー</strong>
        ヘッダー・タブ・ボタン・表の枠。プライマリは royalBlue #3B7DE9（青紫ではなく信頼感のある青）。
      </div>
    </div>
    <div class="layer-card layer-b">
      <div class="layer-card-head">B. 教科色</div>
      <div class="layer-card-body">
        <strong>国・数・英・理・社で色相固定</strong>
        授業タグ・カレンダー予定バーだけ。数学タグは淡い空色、ボタンは濃いロイヤルブルーで役割分担。
      </div>
    </div>
    <div class="layer-card layer-c">
      <div class="layer-card-head">C. 状態色</div>
      <div class="layer-card-body">
        <strong>未確定・欠席・今日など</strong>
        未確定は MF の薄青（solitude）。黄は使わない。成功は MF apple、エラーは venetianRed。
      </div>
    </div>
  `;
}

function renderSubjectGrid() {
  const subjects = ['国語', '数学', '英語', '理科', '社会'];
  document.getElementById('subjectSwatches').innerHTML = subjects.map(sub => {
    const shades = LEVELS.map(lv => {
      const c = subjectColor(lv.key, sub);
      const abbr = { '国語': '国', '数学': '数', '英語': '英', '理科': '理', '社会': '社' }[sub];
      return `
        <div class="subject-shade" data-hex="${c.bg}" data-label="${sub}${lv.label}">
          <div class="subject-shade-bar" style="background:${c.bg};color:${c.text};">${abbr}・${lv.label}</div>
          <div class="subject-shade-label">${lv.key} hsl(${SUBJECT_HUE[sub]} ${lv.s}% ${lv.l}%)</div>
        </div>
      `;
    }).join('');
    return `
      <div class="subject-row">
        <div class="subject-row-head">
          <h3>${sub}</h3>
          <span>色相 ${SUBJECT_HUE[sub]}°</span>
        </div>
        <div class="subject-shades">${shades}</div>
      </div>
    `;
  }).join('');
  document.querySelectorAll('.subject-shade').forEach(node => {
    node.addEventListener('click', () => copyHex(node.dataset.hex, node.dataset.label));
  });
}

function renderStatusGrid() {
  document.getElementById('statusSwatches').innerHTML = STATUS_COLORS.map(s => {
    const style = [
      `background:${s.bg}`,
      `color:${s.text}`,
      s.dashed ? `border:1px dashed ${s.border}` : `border:1px solid ${s.border}`,
      s.strike ? 'text-decoration:line-through' : '',
      s.round ? 'border-radius:999px;display:inline-block;padding:4px 10px;' : '',
      s.ring ? `outline:2px solid ${MF.royalBlue};outline-offset:1px;` : '',
    ].filter(Boolean).join(';');
    return `
      <div class="status-chip" data-hex="${s.bg}" data-label="${s.name}">
        <div class="status-preview" style="${style}">${s.name}${s.round ? ' 16' : ''}</div>
        <div class="status-name">${s.name}</div>
        <div class="status-detail">${s.note}<br>背景 ${s.bg} / 文字 ${s.text}</div>
      </div>
    `;
  }).join('');
  document.querySelectorAll('.status-chip').forEach(node => {
    node.addEventListener('click', () => copyHex(node.dataset.hex, node.dataset.label));
  });
}

function miniCalCell(opts) {
  const { day, entries, dayStyle, cellStyle, today } = opts;
  const daynum = today
    ? `<span style="display:inline-flex;width:18px;height:18px;align-items:center;justify-content:center;border-radius:50%;background:${today.bg};color:${today.fg};font-size:10px;">${day}</span>`
    : `<span style="${dayStyle || ''}">${day}</span>`;
  const bars = (entries || []).map(e =>
    `<div class="mini-entry" style="background:${e.bg};color:${e.text};${e.dashed ? 'border:1px dashed ' + (e.border || e.text) + ';' : ''}${e.strike ? 'text-decoration:line-through;color:#aaa;background:#eee;' : ''}">${e.label}</div>`
  ).join('');
  return `<div class="mini-cal-cell" style="${cellStyle || ''}"><div class="daynum">${daynum}</div>${bars}</div>`;
}

function renderCalendarCompare() {
  const kokugo = subjectColor('中学', '国語');
  const sugaku = subjectColor('中学', '数学');
  const dow = ['月', '火', '水', '木', '金', '土', '日'];

  const legacyCells = [
    miniCalCell({ day: 13 }),
    miniCalCell({ day: 14, entries: [{ label: '国:田中', bg: kokugo.bg, text: kokugo.text }] }),
    miniCalCell({
      day: 15,
      cellStyle: 'background:#474B52;',
      dayStyle: 'color:#fff;',
      entries: [
        { label: '数:佐藤', bg: sugaku.bg, text: sugaku.text },
        { label: '未確定', bg: '#FFF3CD', text: '#856404', dashed: true },
      ],
    }),
    miniCalCell({ day: 16, cellStyle: 'box-shadow:inset 0 0 0 2px #8A7248;', entries: [{ label: '英:山田', bg: subjectColor('中学', '英語').bg, text: subjectColor('中学', '英語').text }] }),
    miniCalCell({ day: 17, today: { bg: '#8A7248', fg: '#fff' }, entries: [{ label: '理:鈴木', bg: subjectColor('中学', '理科').bg, text: subjectColor('中学', '理科').text }] }),
    miniCalCell({ day: 18 }),
    miniCalCell({ day: 19 }),
  ];

  const proposedCells = [
    miniCalCell({ day: 13 }),
    miniCalCell({ day: 14, entries: [{ label: '国:田中', bg: kokugo.bg, text: kokugo.text }] }),
    miniCalCell({
      day: 15,
      cellStyle: `background:${MF.darkenAliceBlue};outline:2px solid ${MF.royalBlue};outline-offset:-2px;`,
      entries: [
        { label: '数:佐藤', bg: sugaku.bg, text: sugaku.text },
        { label: '未確定', bg: MF.solitude, text: MF.cobalt, dashed: true, border: MF.royalBlue },
      ],
    }),
    miniCalCell({ day: 16, entries: [{ label: '英:山田', bg: subjectColor('中学', '英語').bg, text: subjectColor('中学', '英語').text }] }),
    miniCalCell({ day: 17, today: { bg: MF.royalBlue, fg: '#fff' }, entries: [{ label: '理:鈴木', bg: subjectColor('中学', '理科').bg, text: subjectColor('中学', '理科').text }] }),
    miniCalCell({ day: 18, entries: [{ label: '社:欠席', strike: true }] }),
    miniCalCell({ day: 19, cellStyle: `background:${MF.mistyRose};`, dayStyle: `color:${MF.venetianRed};`, entries: [] }),
  ];

  const grid = cells => `
    <div class="mini-cal-dow">${dow.map(d => `<div>${d}</div>`).join('')}</div>
    <div class="mini-cal-grid">${cells.join('')}</div>
  `;

  document.getElementById('calendarCompare').innerHTML = `
    <div class="cal-panel">
      <div class="cal-panel-label legacy">現状 — 黄×チャコール</div>
      <div class="mini-cal">${grid(legacyCells)}</div>
    </div>
    <div class="cal-panel">
      <div class="cal-panel-label proposed">提案 — MFクラウド系ブルー</div>
      <div class="mini-cal">${grid(proposedCells)}</div>
    </div>
  `;
}

function renderUiMock() {
  const tags = [
    { sub: '国語', ...subjectColor('中学', '国語') },
    { sub: '数学', ...subjectColor('中学', '数学') },
    { sub: '英語', ...subjectColor('中学', '英語') },
  ];
  document.getElementById('uiMock').innerHTML = `
    <div class="mock-app-header">
      <h3>ピタコマ</h3>
      <span>教室長ログイン</span>
    </div>
    <div class="mock-tabs">
      <button type="button" class="mock-tab active">カレンダー</button>
      <button type="button" class="mock-tab">コマ管理</button>
      <button type="button" class="mock-tab">生徒</button>
      <button type="button" class="mock-tab">収支</button>
    </div>
    <div class="mock-body">
      <div class="mock-card">
        <div class="mock-card-title">8月15日（金）の予定</div>
        <div class="mock-row">
          ${tags.map(t => `<span class="mock-tag" style="background:${t.bg};color:${t.text};">${t.sub}</span>`).join('')}
          <span class="mock-status" style="background:${MF.solitude};color:${MF.cobalt};border:1px dashed ${MF.royalBlue};">未確定</span>
          <span class="mock-status" style="background:#EEF6EB;color:${MF.apple};">確定</span>
        </div>
        <div class="mock-row">
          <button type="button" class="mock-btn-primary">確定する</button>
          <button type="button" class="mock-btn-ghost">欠席登録</button>
        </div>
      </div>
    </div>
  `;
}

renderLayerDiagram();
renderCalendarCompare();
renderUiMock();
renderSwatchGrid('uiSwatches', UI_TOKENS);
renderSubjectGrid();
renderStatusGrid();
renderSwatchGrid('legacySwatches', [...LEGACY_INDIGO, ...LEGACY_TOKENS]);
