const SAMPLE = {
  pending: [
    { teacher: 'テスト講師2', dateStr: '2026-02-03', weekday: '月', slot: '6講', student: 'テスト太郎', grade: '中2', subject: '社会', recurring: false },
    { teacher: 'テスト講師2', dateStr: '2026-02-04', weekday: '火', slot: '5講', student: 'テストはなこ', grade: '小5', subject: '算数', recurring: true },
    { teacher: 'テスト講師2', dateStr: '2026-02-05', weekday: '水', slot: '4講', student: 'テストゆうじ', grade: '小6', subject: '国語', recurring: true },
  ],
  approved: [
    { teacher: 'テスト講師2', dateStr: '2026-01-28', weekday: '木', slot: '4講', student: 'テスト太郎', grade: '中2', subject: '数学', recurring: false },
    { teacher: 'テスト講師2', dateStr: '2026-01-28', weekday: '木', slot: '5講', student: 'テストはなこ', grade: '小5', subject: '国語', recurring: true },
    { teacher: 'テスト講師2', dateStr: '2026-01-29', weekday: '金', slot: '6講', student: 'テスト次郎', grade: '中1', subject: '数学', recurring: true },
    { teacher: 'テスト講師2', dateStr: '2026-01-29', weekday: '金', slot: '7講', student: 'テスト花子', grade: '小6', subject: '社会', recurring: false },
    { teacher: 'テスト講師2', dateStr: '2026-01-27', weekday: '水', slot: '3講', student: 'テスト一郎', grade: '小3', subject: '算数', recurring: true },
    { teacher: 'テスト講師2', dateStr: '2026-01-27', weekday: '水', slot: '4講', student: 'テストあや', grade: '小5', subject: '理科', recurring: false },
    { teacher: 'テスト講師2', dateStr: '2026-01-26', weekday: '火', slot: '5講', student: 'テストけん', grade: '中3', subject: '英語', recurring: true },
    { teacher: 'テスト講師2', dateStr: '2026-01-26', weekday: '火', slot: '6講', student: 'テストみき', grade: '小2', subject: '国語', recurring: false },
  ],
  rejected: [
    { teacher: 'テスト講師2', dateStr: '2026-02-01', weekday: '土', slot: '4講', student: 'テスト一郎', grade: '小3', subject: '英語', recurring: false },
  ],
};

const EVAL = '確定後も一覧に残り続けるため、2枚目のように<strong>全部「確定」</strong>のログになりやすい。日付がなく「月曜6講」だけだと、いつの授業か分からない。';

const RECOMMEND = `
  <strong>2カラム案（改訂）</strong><br>
  ・<strong>日付</strong>：<code>2026-02-03（月）6講</code> のように具体日を表示（毎週の場合は「毎週」も添える）<br>
  ・<strong>左</strong>：確認待ち＋断られたもの（同じカード型・同じスクロール内）<br>
  ・<strong>右</strong>：承認済みは直近のみ。上に<strong>履歴削除</strong>ボタン<br>
  ・左右とも<strong>スクロール</strong>で全部見られる
`;

const PRINCIPLES = [
  '2行目は「2026-02-03（月）6講 · 生徒（学年）· 教科」。毎週担当は末尾に「毎週」',
  'rejected も pending と同じ白カード＋バッジ（バナー1行にまとめない）',
  '左・右カラムは中身が多いときスクロール。見出しと履歴削除は固定',
  '右カラム「履歴削除」＝表示中の承認済み履歴をまとめて消す（Firestore は残す想定）',
  '左＝pending + rejected。右＝approved 直近（古いものは最初から出さない）',
  'スマホ幅では上：左 / 下：右 に縦並び',
];

/** 公開中（曜日のみ・日付なし） */
function liveDetail(item) {
  return `${item.weekday}曜${item.slot}　${item.student}（${item.grade}）${item.subject}`;
}

/** 改善案（具体日付） */
function scheduleLine(item) {
  const datePart = `${item.dateStr}（${item.weekday}）${item.slot}`;
  const recur = item.recurring ? ' · 毎週' : '';
  return `${datePart}${recur} · ${item.student}（${item.grade}）· ${item.subject}`;
}

function badgeForStatus(status) {
  if (status === 'pending') return { cls: 'pending', text: '確認待ち' };
  if (status === 'rejected') return { cls: 'rejected', text: '講師が断りました' };
  return { cls: 'approved', text: '確定' };
}

function renderLiveRow(item, status) {
  const b = badgeForStatus(status);
  if (status === 'pending') b.text = '講師確認待ち';
  if (status === 'approved') b.text = '確定';
  return `<div class="live-row">
    <div class="live-row-main">
      <span class="live-teacher">${item.teacher}</span>
      <span class="live-detail">${liveDetail(item)}</span>
    </div>
    <span class="badge ${b.cls}">${b.text}</span>
  </div>`;
}

function renderLivePanel(limit) {
  const mixed = [
    ...SAMPLE.pending.map(i => ({ ...i, status: 'pending' })),
    ...SAMPLE.approved.slice(0, limit - SAMPLE.pending.length).map(i => ({ ...i, status: 'approved' })),
  ];
  return mixed.map(r => renderLiveRow(r, r.status)).join('');
}

function renderApprovalItem(item, status) {
  const b = badgeForStatus(status);
  const rowCls = status === 'rejected' ? ' approval-item-rejected' : '';
  return `<div class="approval-item${rowCls}">
    <div class="approval-item-teacher">${item.teacher}</div>
    <div class="approval-item-meta">${scheduleLine(item)}<span class="badge ${b.cls}">${b.text}</span></div>
  </div>`;
}

function renderLeftScrollItems() {
  const rejected = SAMPLE.rejected.map(i => renderApprovalItem(i, 'rejected')).join('');
  const pending = SAMPLE.pending.length
    ? SAMPLE.pending.map(i => renderApprovalItem(i, 'pending')).join('')
    : '<div class="col-empty">確認待ちはありません</div>';
  return rejected + pending;
}

function renderTwoColumnPanel(options = {}) {
  const panelId = options.panelId || '';
  const idAttr = panelId ? ` data-panel-id="${panelId}"` : '';
  const approvedHtml = SAMPLE.approved.map(i => renderApprovalItem(i, 'approved')).join('');
  const leftCount = SAMPLE.pending.length + SAMPLE.rejected.length;

  return `<div class="approval-card"${idAttr}>
    <div class="approval-card-head">授業の確認状況<span class="count">要対応 ${leftCount}件</span></div>
    <div class="approval-two-col">
      <div class="approval-col approval-col-pending">
        <div class="col-label">左 · 要対応 <span class="num">${leftCount}件</span></div>
        <div class="approval-scroll" aria-label="確認待ちと断られた授業">
          ${renderLeftScrollItems()}
        </div>
      </div>
      <div class="approval-col approval-col-done">
        <div class="col-label-row">
          <div class="col-label is-muted">右 · 承認済み（直近）</div>
          <button type="button" class="history-clear-btn" data-action="clear-history"${panelId ? ` data-panel-id="${panelId}"` : ''}>履歴削除</button>
        </div>
        <div class="approval-scroll approval-scroll-done" aria-label="承認済みの履歴">
          <div class="approved-list">${approvedHtml}</div>
        </div>
        <div class="col-footnote">※ 古い確定は表示しません。履歴削除で右側を空にできます</div>
      </div>
    </div>
  </div>`;
}

function renderFullCompare() {
  document.getElementById('fullCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head live">公開中 — 日付なし・待ちと確定が混在</div>
      <div class="compare-panel-body">
        <h3 class="live-card-title">授業の確認状況</h3>
        ${renderLivePanel(7)}
        <div class="problem-callout bad">「月曜6講」だけではいつか分からない。確定が増えるほど埋もれる</div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head next">2カラム案（改訂）</div>
      <div class="compare-panel-body">
        ${renderTwoColumnPanel({ panelId: 'main' })}
        <div class="problem-callout good">具体日付・断りも同じ型・左右スクロール・履歴削除</div>
      </div>
    </div>
  `;
}

function renderWidthCompare() {
  document.getElementById('widthCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-body wide-frame">
        ${renderTwoColumnPanel({ panelId: 'wide' })}
      </div>
    </div>
  `;
}

function renderRowCompare() {
  const pending = SAMPLE.pending[0];
  const rejected = SAMPLE.rejected[0];
  document.getElementById('rowCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head live">公開中 — 曜日だけ</div>
      <div class="compare-panel-body">
        ${renderLiveRow(pending, 'pending')}
        <div class="problem-callout bad">「月曜6講」→ いつの授業か不明</div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head next">改訂 — 具体日付＋断りも同型</div>
      <div class="compare-panel-body">
        ${renderApprovalItem(pending, 'pending')}
        ${renderApprovalItem(rejected, 'rejected')}
        <div class="problem-callout good">待ちも断りも同じ白カード。2行目に日付</div>
      </div>
    </div>
  `;
}

function bindHistoryClear() {
  document.querySelectorAll('[data-action="clear-history"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const panelId = btn.dataset.panelId;
      const card = panelId
        ? document.querySelector(`.approval-card[data-panel-id="${panelId}"]`)
        : btn.closest('.approval-card');
      if (!card) return;
      const list = card.querySelector('.approved-list');
      const scroll = card.querySelector('.approval-scroll-done');
      if (!list || !scroll) return;
      if (!window.confirm('表示中の承認済み履歴を削除します。\n（プレビュー：画面から消えるだけ）\nよろしいですか？')) return;
      list.innerHTML = '<div class="col-empty">承認済みの履歴はありません</div>';
      btn.disabled = true;
      btn.textContent = '削除済み';
      scroll.scrollTop = 0;
    });
  });
}

document.getElementById('evalSummary').innerHTML = EVAL;
document.getElementById('evalRecommend').innerHTML = RECOMMEND;
document.getElementById('principleList').innerHTML = PRINCIPLES.map(p => `<li>${p}</li>`).join('');
renderFullCompare();
renderWidthCompare();
renderRowCompare();
bindHistoryClear();
