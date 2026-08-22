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

const EVAL = `
  「授業の確認状況」は<strong>コマを組んだあと</strong>に講師の返事を見るものです。
  シフト管理（出勤可能日の回収）と目的が違うため、<strong>カレンダー上部</strong>に置くのが自然です。
  すでにある「確定不足」と同じ<strong>1行サマリー＋詳細を開く</strong>の形に揃えます。
`;

const RECOMMEND = `
  <strong>カレンダー案</strong><br>
  ・1行目：確定不足（いまどおり）<br>
  ・2行目：<strong>講師の確認待ち N件 · 断り M件</strong> → 詳細 ▾<br>
  ・詳細内：2カラム（具体日付・同型カード・スクロール・履歴削除）<br>
  ・シフト管理から「授業の確認状況」カードは<strong>外す</strong>
`;

const PRINCIPLES = [
  'カレンダー上部の2本目のバー。説明は1行サマリーのみ（詳細内で同じ文言を繰り返さない）',
  '要対応が0件かつ断りも0件のときは2本目のバーごと非表示（または薄いOK表示は今回はしない）',
  '2行目は「2026-02-03（月）6講 · 生徒 · 教科」。毎週は「毎週」を添える',
  '断りも確認待ちと同じ白カード。左右スクロール。右に履歴削除',
  'シフト管理は「提出状況」「変更リクエスト」に専念',
  'スマホでも2本のバーが縦に並び、詳細は2カラム→縦積み',
];

function counts() {
  return {
    pending: SAMPLE.pending.length,
    rejected: SAMPLE.rejected.length,
    action: SAMPLE.pending.length + SAMPLE.rejected.length,
  };
}

function approvalSummaryText() {
  const c = counts();
  const parts = [`講師の確認待ち ${c.pending}件`];
  if (c.rejected > 0) parts.push(`断り ${c.rejected}件`);
  return parts.join(' · ');
}

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

function renderApprovalItem(item, status) {
  const b = badgeForStatus(status);
  const rowCls = status === 'rejected' ? ' approval-item-rejected' : '';
  return `<div class="approval-item${rowCls}">
    <div class="approval-item-teacher">${item.teacher}</div>
    <div class="approval-item-meta">${scheduleLine(item)}<span class="badge ${b.cls}">${b.text}</span></div>
  </div>`;
}

function renderApprovalDetail(panelId) {
  const c = counts();
  const approvedHtml = SAMPLE.approved.map(i => renderApprovalItem(i, 'approved')).join('');
  const rejectedHtml = SAMPLE.rejected.map(i => renderApprovalItem(i, 'rejected')).join('');
  const pendingHtml = SAMPLE.pending.length
    ? SAMPLE.pending.map(i => renderApprovalItem(i, 'pending')).join('')
    : '<div class="col-empty">確認待ちはありません</div>';

  return `<div class="approval-detail-well" data-panel-id="${panelId}">
    <div class="approval-two-col">
      <div class="approval-col approval-col-pending">
        <div class="col-label">要対応 <span class="num">${c.action}件</span></div>
        <div class="approval-scroll" aria-label="確認待ちと断られた授業">
          ${rejectedHtml}${pendingHtml}
        </div>
      </div>
      <div class="approval-col approval-col-done">
        <div class="col-label-row">
          <div class="col-label">承認済み（直近）</div>
          <button type="button" class="history-clear-btn" data-action="clear-history" data-panel-id="${panelId}">履歴削除</button>
        </div>
        <div class="approval-scroll approval-scroll-done" aria-label="承認済みの履歴">
          <div class="approved-list">${approvedHtml}</div>
        </div>
        <div class="col-footnote">※ 古い確定は表示しません</div>
      </div>
    </div>
  </div>`;
}

function renderShortageBar({ expanded = false, toggleId = null } = {}) {
  const toggleAttr = toggleId ? ` id="${toggleId}" data-toggle="shortage"` : '';
  const detailHidden = expanded ? '' : ' hidden';
  return `<div class="cal-status-bar is-warn">
    <div class="cal-status-inner">
      <div class="cal-status-text">3件の教科で確定が不足しています · 不足が多い順</div>
      <button type="button" class="btn-text"${toggleAttr}>詳細 ${expanded ? '▴' : '▾'}</button>
    </div>
    <div class="cal-status-detail"${detailHidden}>
      <div style="font-size:12px;color:#787E8D;padding:8px;">（確定不足一覧 — 実装済みの案A。ここでは省略）</div>
    </div>
  </div>`;
}

function renderApprovalBar({ expanded = false, toggleId = null, detailId = null } = {}) {
  const toggleAttr = toggleId ? ` id="${toggleId}" data-toggle="approval"` : '';
  const detailHidden = expanded ? '' : ' hidden';
  const detailIdAttr = detailId ? ` id="${detailId}"` : '';
  const panelId = detailId || 'approval-detail';
  return `<div class="cal-status-bar is-warn">
    <div class="cal-status-inner">
      <div class="cal-status-text">${approvalSummaryText()}</div>
      <button type="button" class="btn-text"${toggleAttr}>詳細 ${expanded ? '▴' : '▾'}</button>
    </div>
    <div class="cal-status-detail"${detailIdAttr}${detailHidden}>
      ${renderApprovalDetail(panelId)}
    </div>
  </div>`;
}

function renderMiniCalendar() {
  const heads = ['月', '火', '水', '木', '金', '土', '日'];
  const cells = [
    { d: 3, entries: [{ t: '社:確認待ち', pending: true }] },
    { d: 4, entries: [{ t: '算:確認待ち', pending: true }] },
    { d: 5, entries: [{ t: '国:太郎', pending: false }] },
    { d: 10, entries: [] },
    { d: 11, entries: [{ t: '数:次郎', pending: false }] },
    { d: 12, entries: [] },
    { d: 13, entries: [] },
  ];
  let html = heads.map(h => `<div class="mini-cal-head">${h}</div>`).join('');
  for (let i = 0; i < 7; i++) {
    html += '<div class="mini-cal-cell"></div>';
  }
  cells.forEach(c => {
    const entries = c.entries.map(e =>
      `<div class="entry${e.pending ? ' pending' : ''}">${e.t}</div>`
    ).join('');
    html += `<div class="mini-cal-cell"><div class="daynum">${c.d}</div>${entries}</div>`;
  });
  for (let i = 0; i < 7; i++) {
    html += '<div class="mini-cal-cell"></div>';
  }
  return `<div class="mini-cal">${html}</div>`;
}

function renderCalendarMock(options = {}) {
  const {
    approvalExpanded = false,
    shortageExpanded = false,
    interactive = false,
    rootId = '',
  } = options;
  const rootAttr = rootId ? ` id="${rootId}"` : '';
  const shortageToggleId = interactive ? `${rootId || 'mock'}-shortage-toggle` : null;
  const approvalToggleId = interactive ? `${rootId || 'mock'}-approval-toggle` : null;
  const approvalDetailId = interactive ? `${rootId || 'mock'}-approval-detail` : null;

  return `<div class="mock-app"${rootAttr}>
    <div class="mock-tabs">
      <span class="mock-tab is-active">カレンダー</span>
      <span class="mock-tab is-dim">生徒登録</span>
      <span class="mock-tab is-dim">講師登録</span>
      <span class="mock-tab is-dim">シフト管理</span>
      <span class="mock-tab is-dim">分析</span>
    </div>
    ${renderShortageBar({ expanded: shortageExpanded, toggleId: shortageToggleId })}
    ${renderApprovalBar({ expanded: approvalExpanded, toggleId: approvalToggleId, detailId: approvalDetailId })}
    <div class="cal-action-zone">
      <div class="cal-zone-label">操作</div>
      <div class="cal-action-bar">
        <span class="btn-primary">コマを組む</span>
        <span class="btn-secondary">生徒都合の変更 ▾</span>
        <span class="btn-secondary">講師都合の変更 ▾</span>
      </div>
    </div>
    <div class="cal-card">
      <div class="cal-toolbar">
        <span class="cal-nav-btn">‹</span>
        <div class="cal-period-label">2026年2月</div>
        <span class="cal-nav-btn">›</span>
        <span class="cal-today-btn">今月</span>
      </div>
      ${renderMiniCalendar()}
    </div>
  </div>`;
}

function renderShiftMock() {
  return `<div class="shift-mock">
    <div class="mock-tabs">
      <span class="mock-tab is-dim">カレンダー</span>
      <span class="mock-tab is-dim">生徒登録</span>
      <span class="mock-tab is-dim">講師登録</span>
      <span class="mock-tab is-active">シフト管理</span>
      <span class="mock-tab is-dim">分析</span>
    </div>
    <div class="shift-card is-faded">
      <h3>授業の確認状況</h3>
      <div class="removed-note">カレンダーへ移すため、ここからは<strong>外す</strong></div>
    </div>
    <div class="shift-card">
      <h3>講師からの変更リクエスト</h3>
      <div class="ts-row"><span class="name">テスト講師2</span><span class="meta">2/10 5講 → 不可</span><span class="ts-badge wait">未処理</span></div>
    </div>
    <div class="shift-card is-main">
      <h3>2026年2月 — シフト提出状況</h3>
      <div class="ts-row"><span class="name">テスト講師2</span><span class="meta">希望12 · 授業8</span><span class="ts-badge ok">提出済</span></div>
      <div class="ts-row"><span class="name">テスト講師1</span><span class="meta">希望10 · 授業6</span><span class="ts-badge wait">未提出</span></div>
    </div>
  </div>`;
}

function renderPlacementCompare() {
  document.getElementById('placementCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head live">いま — シフト管理タブ</div>
      <div class="compare-panel-body">
        ${renderShiftMock()}
        <div class="problem-callout bad">画面の目的（シフト提出）と中身（授業の確認）がずれる</div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head next">カレンダー案</div>
      <div class="compare-panel-body">
        ${renderCalendarMock({ approvalExpanded: false })}
        <div class="problem-callout good">コマ組み・確定不足・講師返事が同じ画面に集まる</div>
      </div>
    </div>
  `;
}

function renderCalendarCollapsed() {
  document.getElementById('calendarCollapsed').innerHTML = `
    <div class="compare-panel-body" style="padding:14px;">
      ${renderCalendarMock({
        approvalExpanded: false,
        interactive: true,
        rootId: 'collapsed-mock',
      })}
      <div class="problem-callout good" style="margin-top:12px;">2行目だけ赤系バー。押すまでカレンダーは広いまま</div>
    </div>
  `;
}

function renderCalendarExpanded() {
  document.getElementById('calendarExpanded').innerHTML = `
    <div class="compare-panel-body" style="padding:14px;">
      ${renderCalendarMock({
        approvalExpanded: true,
        interactive: true,
        rootId: 'expanded-mock',
      })}
      <div class="problem-callout good" style="margin-top:12px;">確定不足と独立して開閉。中身は2カラム＋スクロール</div>
    </div>
  `;
}

function renderMobileMock() {
  document.getElementById('mobileMock').innerHTML = renderCalendarMock({
    approvalExpanded: true,
    rootId: 'mobile-mock',
  });
}

function bindToggle(root, toggleId, detailId) {
  const btn = root.querySelector(`#${toggleId}`);
  const detail = root.querySelector(`#${detailId}`);
  if (!btn || !detail) return;
  btn.addEventListener('click', () => {
    const open = detail.hasAttribute('hidden');
    if (open) {
      detail.removeAttribute('hidden');
      btn.textContent = '詳細 ▴';
    } else {
      detail.setAttribute('hidden', '');
      btn.textContent = '詳細 ▾';
    }
  });
}

function bindHistoryClear(root) {
  root.querySelectorAll('[data-action="clear-history"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const panelId = btn.dataset.panelId;
      const well = root.querySelector(`.approval-detail-well[data-panel-id="${panelId}"]`)
        || btn.closest('.approval-detail-well');
      if (!well) return;
      const list = well.querySelector('.approved-list');
      if (!list) return;
      if (!window.confirm('表示中の承認済み履歴を削除します。\n（プレビュー：画面から消えるだけ）\nよろしいですか？')) return;
      list.innerHTML = '<div class="col-empty">承認済みの履歴はありません</div>';
      btn.disabled = true;
      btn.textContent = '削除済み';
    });
  });
}

function bindInteractiveMocks() {
  ['collapsed-mock', 'expanded-mock'].forEach(rootId => {
    const root = document.getElementById(rootId);
    if (!root) return;
    bindToggle(root, `${rootId}-approval-toggle`, `${rootId}-approval-detail`);
    bindHistoryClear(root);
  });
}

document.getElementById('evalSummary').innerHTML = EVAL;
document.getElementById('evalRecommend').innerHTML = RECOMMEND;
document.getElementById('principleList').innerHTML = PRINCIPLES.map(p => `<li>${p}</li>`).join('');

renderPlacementCompare();
renderCalendarCollapsed();
renderCalendarExpanded();
renderMobileMock();
bindInteractiveMocks();
