function shiftDock(title, badgeHtml, btnLabel){
  return `
    <div class="submit-dock submit-dock-d1">
      <div class="submit-dock-block is-shift">
        <div class="submit-dock-head">
          <div class="submit-dock-lines">
            <div class="submit-dock-meta">
              ${title}
              <span class="submit-dock-badges">${badgeHtml}</span>
            </div>
          </div>
          <div class="submit-dock-actions is-stacked">
            <button type="button" class="primary" disabled>${btnLabel}</button>
          </div>
        </div>
      </div>
    </div>`;
}

const submitted = '<span class="status-badge submitted">提出済</span>';
const unsubmitted = '<span class="status-badge draft">未提出</span>';
const submittedAug = '<span class="status-badge submitted">8月 提出済</span>';
const unsubmittedSep = '<span class="status-badge draft">9月 未提出</span>';

const titleShift = '<p class="submit-dock-title">シフト</p>';
const titleAug = '<p class="submit-dock-title">8月のシフト</p>';
const titleSep = '<p class="submit-dock-title">9月のシフト</p>';
const titleParenAug = '<p class="submit-dock-title">シフト（8月）</p>';
const titleParenSep = '<p class="submit-dock-title">シフト（9月）</p>';
const titleWithChipAug = '<p class="submit-dock-title">シフト</p><span class="submit-dock-month">8月分</span>';
const titleWithChipSep = '<p class="submit-dock-title">シフト</p><span class="submit-dock-month">9月分</span>';
const titleWithCalAug = '<div><p class="submit-dock-title">シフト</p><p class="submit-dock-month is-line">2026年8月</p></div>';
const titleWithCalSep = '<div><p class="submit-dock-title">シフト</p><p class="submit-dock-month is-line">2026年9月</p></div>';

function currentMock(){
  return `
    <div class="current-stack">
      ${shiftDock(titleShift, submitted, '新規シフトを提出する')}
      <div class="gap-callout">ここが空く（説明文）— 月はまだ見えない</div>
      <div class="card">
        <h2>マイスケジュール</h2>
        <p class="desc">担当授業の確認と、空きコマのシフト提出がこの1画面でできます。青枠のコマは教室長からの授業依頼です。……（説明が続く）</p>
        <div class="month-nav">
          <button type="button" class="nav-btn" disabled>‹</button>
          <div class="month-title">2026年8月</div>
          <button type="button" class="nav-btn" disabled>›</button>
          <button type="button" class="today-btn" disabled>今月</button>
        </div>
      </div>
    </div>`;
}

const VARIANTS = [
  {
    id: 'A',
    recommend: true,
    name: '見出しを「8月のシフト」',
    note: '月は見出し、状態はバッジ。役割が分かれる。バーの中だけで完結する。',
    main: shiftDock(titleAug, submitted, '新規シフトを提出する'),
    alt: shiftDock(titleSep, unsubmitted, '新規シフトを提出する'),
  },
  {
    id: 'B',
    name: 'バッジを「8月 提出済」',
    note: '見出しは今のまま。状態のバッジに月を足す。少し長くなる。',
    main: shiftDock(titleShift, submittedAug, '新規シフトを提出する'),
    alt: shiftDock(titleShift, unsubmittedSep, '新規シフトを提出する'),
  },
  {
    id: 'C',
    name: 'カレンダーと同じ「2026年8月」を出す',
    note: '下の月ナビと文言が完全に同じ。行が1つ増える。',
    main: shiftDock(titleWithCalAug, submitted, '新規シフトを提出する'),
    alt: shiftDock(titleWithCalSep, unsubmitted, '新規シフトを提出する'),
  },
  {
    id: 'D',
    name: '「シフト」の横に「8月分」',
    note: '見出し・月・状態が3つ並ぶ。月だけを探しやすい。部品が増える。',
    main: shiftDock(titleWithChipAug, submitted, '新規シフトを提出する'),
    alt: shiftDock(titleWithChipSep, unsubmitted, '新規シフトを提出する'),
  },
  {
    id: 'E',
    name: '見出しを「シフト（8月）」',
    note: 'いちばん短い足し方。括弧だと月がやや弱い。',
    main: shiftDock(titleParenAug, submitted, '新規シフトを提出する'),
    alt: shiftDock(titleParenSep, unsubmitted, '新規シフトを提出する'),
  },
];

document.getElementById('currentMock').innerHTML = currentMock();
document.getElementById('variantGrid').innerHTML = VARIANTS.map(v => `
  <article class="variant-card${v.recommend ? ' is-recommend' : ''}">
    <div class="variant-head">
      <span>案${v.id} — ${v.name}</span>
      ${v.recommend ? '<span class="tag-rec">おすすめ</span>' : ''}
    </div>
    <div class="variant-body">
      ${v.main}
      <div class="variant-alt">
        <p class="variant-alt-label">9月を開いたとき（未提出）</p>
        ${v.alt}
      </div>
      <p class="variant-note">${v.note}</p>
    </div>
  </article>
`).join('');
