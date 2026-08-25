const SAMPLE = [
  { id: 'r1', teacher: '山田', date: '8/26', weekday: '水', slot: '6講', from: '×不可', to: '○優先' },
  { id: 'r2', teacher: '佐藤', date: '8/27', weekday: '木', slot: '5講', from: '△可能', to: '×不可' },
];

const EVAL = `
  講師が提出済みの月に、あとから出した出勤希望（○優先・△可能・×不可）を教室長が承認する機能は、<strong>消えてはいません</strong>。<br>
  いまは「シフト管理」タブのいちばん上にだけあります。授業の確認をカレンダーへ移したあと、教室長が毎日見るカレンダーからは見えなくなっています。見た目も、いまのカレンダー上部の行と違います。
`;

const RECOMMEND = `
  <strong>おすすめ：カレンダー上部のバー（未振替と同じ右側）＋詳細を開いたときの上段</strong><br>
  ・毎日コマを組む場所で、追加の空きが出たことにすぐ気づける<br>
  ・4つの流れ（講師なし→仮決め→承認待ち→確定）には混ぜない。5列目にすると狭くて読みにくい<br>
  ・0件のときは何も出さない<br>
  ・シフト管理タブの提出一覧はそのまま。承認作業だけカレンダーへ移す
`;

const PRINCIPLES = [
  'バーの右側は「未振替」と同じ。件数があるときだけ出す',
  '詳細を開いたとき、4列の上に横長の1枚。行は承認待ちと同じ型',
  '右端のボタンは講師候補行と同じ大きさ（11px・4×10）。承認＝青、却下＝枠線',
  '講師名は登録名の姓＋「先生」（カレンダー上部の行と同じ）',
  '文言は講師画面と同じ ○優先 / △可能 / ×不可。減らす変更も同じ場所',
  '押した行のすぐ下で次の操作が終わる（別タブへ飛ばさない）',
];

const state = {
  count: 2,
  open: true,
  remaining: SAMPLE.map(r => r.id),
};

function kpiChip(kind, label, count, unit) {
  const zero = Number(count) === 0 ? ' is-zero' : '';
  return `<span class="cal-status-kpi is-${kind}${zero}">
    <span class="cal-status-kpi-label">${label}</span>
    <span class="cal-status-kpi-value"><span class="cal-status-kpi-num">${count}</span><span class="cal-status-kpi-unit">${unit}</span></span>
  </span>`;
}

function flowSummary(shiftCount) {
  const extras = shiftCount > 0
    ? `<span class="cal-status-kpi-extras">${kpiChip('shift', '追加シフト', shiftCount, '件')}</span>`
    : '';
  return `<span class="cal-status-flow">
    ${kpiChip('unassigned', '講師なし', 3, 'コマ')}
    <span class="cal-status-flow-arrow" aria-hidden="true">→</span>
    ${kpiChip('tentative', '仮決め', 1, '件')}
    <span class="cal-status-flow-arrow" aria-hidden="true">→</span>
    ${kpiChip('pending', '承認待ち', 2, '件')}
    <span class="cal-status-flow-arrow" aria-hidden="true">→</span>
    ${kpiChip('confirmed', '確定', 8, '件')}
  </span>${extras}`;
}

function dummyAlertRow(when, head) {
  return `<div class="approval-item">
    <div class="cal-alert-row-body cal-alert-row-body--full">
      <span class="cal-alert-when-text">${when}</span>
      <span class="cal-alert-row-head">${head}</span>
      <span class="cal-alert-change">（例）</span>
    </div>
  </div>`;
}

function listBlock(label, count, unit, inner, empty) {
  return `<section class="shortage-panel">
    <div class="shortage-panel-head">
      <span class="shortage-panel-label">${label}</span>
      <span class="shortage-panel-count"><span class="shortage-panel-num">${count}</span>${unit}</span>
    </div>
    <div class="shortage-panel-scroll">${inner || `<div class="shortage-panel-empty">${empty}</div>`}</div>
  </section>`;
}

function changeText(item) {
  return `<span class="cal-alert-change"><span class="cal-alert-change-from">${item.from}</span> → <span class="cal-alert-change-to">${item.to}</span></span>`;
}

function shiftReqRow(item, { live = false } = {}) {
  const actions = live
    ? `<div class="match-cand-actions">
        <button type="button" class="confirm-btn" data-approve="${item.id}">承認</button>
        <button type="button" class="mp-change-teacher-btn" data-reject="${item.id}">却下</button>
      </div>`
    : `<div class="match-cand-actions">
        <button type="button" class="confirm-btn">承認</button>
        <button type="button" class="mp-change-teacher-btn">却下</button>
      </div>`;
  return `<div class="approval-item has-actions">
    <div class="cal-alert-row-body cal-alert-row-body--full">
      <span class="cal-alert-when-text">${item.date}<span class="cal-alert-when-wd">(${item.weekday})</span> ${item.slot}</span>
      <span class="cal-alert-row-head">${item.teacher}先生</span>
      ${changeText(item)}
    </div>
    ${actions}
  </div>`;
}

function oldChangeReqRow(item) {
  return `<div class="change-req-row">
    <div>
      <span class="change-req-name">${item.teacher}</span>
      <span class="change-req-detail">${item.date}（${item.weekday}）${item.slot}　→　${item.to === '○優先' ? '○特に希望' : item.to}</span>
    </div>
    <div class="change-req-actions">
      <button type="button" class="primary">承認</button>
      <button type="button" class="ghost">却下</button>
    </div>
  </div>`;
}

function fourCol() {
  return `<div class="shortage-four-col">
    ${listBlock('講師なし', 3, 'コマ', dummyAlertRow('8/24(月) 4講', 'テスト太郎'), '')}
    ${listBlock('仮決め', 1, '件', dummyAlertRow('8/25(火) 5講', '佐藤先生'), '')}
    ${listBlock('承認待ち', 2, '件', dummyAlertRow('8/24(月) 6講', '山田先生'), '')}
    ${listBlock('確定', 8, '件', dummyAlertRow('8/21(金) 4講', '鈴木先生'), '')}
  </div>`;
}

function fiveCol(items) {
  const shiftInner = items.map(r => shiftReqRow(r)).join('');
  return `<div class="shortage-five-col">
    ${listBlock('講師なし', 3, 'コマ', dummyAlertRow('8/24(月) 4講', 'テスト太郎'), '')}
    ${listBlock('仮決め', 1, '件', dummyAlertRow('8/25(火) 5講', '佐藤先生'), '')}
    ${listBlock('承認待ち', 2, '件', dummyAlertRow('8/24(月) 6講', '山田先生'), '')}
    ${listBlock('確定', 8, '件', dummyAlertRow('8/21(金) 4講', '鈴木先生'), '')}
    ${listBlock('追加シフト', items.length, '件', shiftInner, '追加シフトはありません')}
  </div>`;
}

function shiftPanel(items, { live = false } = {}) {
  if(items.length === 0) return '';
  const inner = items.map(r => shiftReqRow(r, { live })).join('');
  return `<section class="shortage-panel shift-req-panel">
    <div class="shortage-panel-head">
      <span class="shortage-panel-label">講師からの追加シフト</span>
      <span class="shortage-panel-count"><span class="shortage-panel-num">${items.length}</span>件</span>
    </div>
    <div class="shortage-panel-scroll">${inner}</div>
  </section>`;
}

function calendarShell({ shiftCount, items, open, live = false, five = false }) {
  const chevron = open ? '▴' : '▾';
  const detailDisplay = open ? 'block' : 'none';
  const body = five
    ? fiveCol(items)
    : `${shiftPanel(items, { live })}${fourCol()}`;
  return `<div class="mock-app">
    <div class="mock-tabs">
      <span class="mock-tab is-active">カレンダー</span>
      <span class="mock-tab">シフト管理</span>
      <span class="mock-tab">生徒登録</span>
    </div>
    <div class="cal-status-bar">
      <button type="button" class="cal-status-toggle" data-toggle-detail aria-expanded="${open}">
        <span class="cal-status-text">${flowSummary(shiftCount)}</span>
        <span class="cal-status-chevron" aria-hidden="true">${chevron}</span>
      </button>
      <div class="cal-status-detail" style="display:${detailDisplay};">
        ${body}
      </div>
    </div>
    <div class="mock-cal-card">カレンダー本体（月間）</div>
  </div>`;
}

function flash(msg, warn = false) {
  const el = document.getElementById('previewFlash');
  el.hidden = false;
  el.textContent = msg;
  el.classList.toggle('is-warn', warn);
  clearTimeout(flash.timer);
  flash.timer = setTimeout(()=>{ el.hidden = true; }, 1800);
}

function visibleItems() {
  if(state.count === 0) return [];
  return SAMPLE.filter(r => state.remaining.includes(r.id));
}

function renderToggles() {
  const wrap = document.getElementById('previewToggles');
  wrap.innerHTML = `
    <button type="button" class="preview-toggle${state.count > 0 ? ' is-active' : ''}" data-count="2">追加シフト あり</button>
    <button type="button" class="preview-toggle${state.count === 0 ? ' is-active' : ''}" data-count="0">追加シフト なし</button>
    <button type="button" class="preview-toggle${state.open ? ' is-active' : ''}" data-open="1">詳細を開く</button>
    <button type="button" class="preview-toggle${!state.open ? ' is-active' : ''}" data-open="0">詳細を閉じる</button>
  `;
  wrap.querySelectorAll('[data-count]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.count = Number(btn.dataset.count);
      state.remaining = state.count === 0 ? [] : SAMPLE.map(r => r.id);
      renderCalendarMock();
      renderToggles();
    });
  });
  wrap.querySelectorAll('[data-open]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      state.open = btn.dataset.open === '1';
      renderCalendarMock();
      renderToggles();
    });
  });
}

function bindLiveActions(root) {
  root.querySelectorAll('[data-approve]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.approve;
      const item = SAMPLE.find(r => r.id === id);
      state.remaining = state.remaining.filter(x => x !== id);
      if(state.remaining.length === 0) state.count = 0;
      renderCalendarMock();
      renderToggles();
      flash(`プレビュー：${item.teacher}先生の ${item.date} ${item.slot} を承認しました`);
    });
  });
  root.querySelectorAll('[data-reject]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const id = btn.dataset.reject;
      const item = SAMPLE.find(r => r.id === id);
      state.remaining = state.remaining.filter(x => x !== id);
      if(state.remaining.length === 0) state.count = 0;
      renderCalendarMock();
      renderToggles();
      flash(`プレビュー：${item.teacher}先生の依頼を却下しました`, true);
    });
  });
  root.querySelector('[data-toggle-detail]')?.addEventListener('click', ()=>{
    state.open = !state.open;
    renderCalendarMock();
    renderToggles();
  });
}

function renderCalendarMock() {
  const items = visibleItems();
  const wrap = document.getElementById('calendarMock');
  wrap.innerHTML = calendarShell({
    shiftCount: items.length,
    items,
    open: state.open,
    live: true,
  });
  bindLiveActions(wrap);
}

function renderPlacement() {
  const items = SAMPLE;
  document.getElementById('placementCompare').innerHTML = `
    <article class="variant-panel">
      <div class="variant-head">案A — いま（シフト管理タブ）</div>
      <div class="variant-body">
        <div class="mock-tab-page">
          <div class="mock-tabs">
            <span class="mock-tab">カレンダー</span>
            <span class="mock-tab is-active">シフト管理</span>
          </div>
          <p class="ts-card-title">講師からの変更リクエスト</p>
          ${items.map(oldChangeReqRow).join('')}
        </div>
        <p class="variant-note">機能はあるが、毎日見るカレンダーからは見えない。ボタンも今の候補行より大きい。</p>
        <p class="variant-verdict is-no">見えなくなった原因。採用しない</p>
      </div>
    </article>
    <article class="variant-panel">
      <div class="variant-head">案B — カレンダーの5列目</div>
      <div class="variant-body">
        ${fiveCol(items)}
        <p class="variant-note">コマ組みの4つの流れに混ぜると、列が狭くなりスマホで崩れやすい。</p>
        <p class="variant-verdict is-no">流れが壊れる。採用しない</p>
      </div>
    </article>
    <article class="variant-panel is-rec">
      <div class="variant-head">案C — おすすめ（バー右側＋上段）</div>
      <div class="variant-body">
        <div class="cal-status-bar" style="margin-bottom:8px;">
          <div class="cal-status-toggle" style="cursor:default;">
            <span class="cal-status-text">${flowSummary(2)}</span>
          </div>
        </div>
        ${shiftPanel(items)}
        <p class="variant-note">未振替と同じ「流れの外の依頼」。開いた場所のすぐ下で承認できる。</p>
        <p class="variant-verdict is-yes">この案で復元する</p>
      </div>
    </article>
  `;
}

function renderRowZoom() {
  document.getElementById('rowZoom').innerHTML = `
    <div class="row-zoom-wrap">
      <p class="row-zoom-caption">日付 → 講師 → 変更内容 → 承認 / 却下。出勤を増やす変更も、減らす変更も同じ行です。</p>
      ${SAMPLE.map(r => shiftReqRow(r)).join('')}
    </div>
  `;
}

document.getElementById('evalSummary').innerHTML = EVAL;
document.getElementById('evalRecommend').innerHTML = RECOMMEND;
document.getElementById('principleList').innerHTML = PRINCIPLES.map(t => `<li>${t}</li>`).join('');
renderPlacement();
renderToggles();
renderCalendarMock();
renderRowZoom();
