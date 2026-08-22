const SUBJECT = {
  国語: { bg: '#FCE8E6', text: '#9F1239' },
  数学: { bg: '#DBEAFE', text: '#1D4ED8' },
};

const EVAL = `
  前案（統一案）にも<strong>3つの問題</strong>がありました。<br>
  ①「承認待ち」と「依頼済み・返事待ち」が<strong>同じ意味を二重</strong>に表示<br>
  ②承認待ちだけ「テスト講師2 <strong>先生</strong>」、候補は「三田 千遥」と<strong>呼び方が不一致</strong><br>
  ③コマ枠の中に候補リスト枠が入り<strong>箱が二重</strong>
`;

const RECOMMEND = `
  <strong>修正版（v2）</strong><br>
  ・状態バッジは<strong>コマ見出しの1つだけ</strong>（承認待ち / 未確定）。行の下に同じ意味を足さない<br>
  ・講師名は候補と同じ<strong>登録名そのまま</strong>（「先生」「講師：」なし）<br>
  ・<strong>1コマ = 枠1枚</strong>。候補行は区切り線だけ。内側のリスト用ボックスは使わない<br>
  ・ボタンサイズは「この講師に依頼」と同じ（白枠＝別の講師を選ぶ）
`;

const PRINCIPLES = [
  'コマ見出し：時間＋教科タグ＋状態バッジ（承認待ち or 未確定）— ここだけ',
  '承認待ち行：講師名 ＋ 右端「別の講師を選ぶ」（追加バッジ・「講師：」なし）',
  '未確定行：番号 ＋ 講師名 ＋ 理由タグ ＋ 右端「この講師に依頼」',
  '講師名はすべて teacher.name と同じ表記（候補も依頼中も同じ）',
  '枠は match-slot 1枚。行は border-top の区切りのみ（match-cand-list の二重枠は使わない）',
];

function subjectTag(name) {
  const s = SUBJECT[name] || { bg: '#EEE', text: '#333' };
  return `<span class="sched-student-tag" style="background:${s.bg};color:${s.text};">${name}</span>`;
}

function candRow({ rank, name, badges = '', actions }) {
  return `<div class="match-cand-row">
    <span class="match-cand-rank">${rank}</span>
    <div class="match-cand-main">
      <div class="match-cand-head">
        <span class="match-cand-name">${name}</span>
        <div class="match-cand-actions">${actions}</div>
      </div>
      ${badges ? `<div class="match-cand-badges">${badges}</div>` : ''}
    </div>
  </div>`;
}

function renderSlotShell({ slotLabel, subject, statusBadge, statusCls, rowsHtml, extraCls = '' }) {
  return `<div class="match-slot ${extraCls}">
    <div class="ms-slot-label">${slotLabel}</div>
    <div class="mp-slot-subject">${subjectTag(subject)}<span class="mp-slot-badge ${statusCls}">${statusBadge}</span></div>
    <div class="match-slot-rows">${rowsHtml}</div>
  </div>`;
}

function renderUnconfirmedSlot5() {
  const rows =
    candRow({
      rank: '1',
      name: '三田 千遥',
      badges: '<span class="match-reason-badge">得意教科</span><span class="match-reason-badge">講師希望コマ</span><span class="match-reason-badge">1/3コマ</span>',
      actions: '<button type="button" class="btn-confirm">この講師に依頼</button>',
    }) +
    candRow({
      rank: '2',
      name: '岩田 昌己',
      badges: '<span class="match-reason-badge">得意教科</span><span class="match-reason-badge">全コマ対応</span>',
      actions: '<button type="button" class="btn-confirm">この講師に依頼</button>',
    });
  return renderSlotShell({
    slotLabel: '5講（16:40～18:10）<span class="mp-slot-meta">教室 0/12</span>',
    subject: '数学',
    statusBadge: '未確定',
    statusCls: 'pending',
    rowsHtml: rows,
  });
}

function renderWaitingSlot4Live() {
  return renderSlotShell({
    slotLabel: '4講（14:50～16:20）<span class="mp-slot-meta">教室 1/12</span>',
    subject: '国語',
    statusBadge: '承認待ち',
    statusCls: 'waiting',
    extraCls: 'is-waiting-live',
    rowsHtml: `
      <div class="waiting-teacher-live">講師：テスト講師2 先生</div>
      <div class="waiting-actions-live"><button type="button" class="btn-ghost-large">別の講師を選ぶ</button></div>
    `,
  });
}

function renderWaitingSlot4Prev() {
  return renderSlotShell({
    slotLabel: '4講（14:50～16:20）<span class="mp-slot-meta">教室 1/12</span>',
    subject: '国語',
    statusBadge: '承認待ち',
    statusCls: 'waiting',
    extraCls: 'is-waiting-prev',
    rowsHtml: candRow({
      rank: '✓',
      name: 'テスト講師2 先生',
      badges: '<span class="assigned-badge">依頼済み・返事待ち</span>',
      actions: '<button type="button" class="btn-secondary-inline">別の講師を選ぶ</button>',
    }),
  });
}

function renderWaitingSlot4Next() {
  return renderSlotShell({
    slotLabel: '4講（14:50～16:20）<span class="mp-slot-meta">教室 1/12</span>',
    subject: '国語',
    statusBadge: '承認待ち',
    statusCls: 'waiting',
    rowsHtml: candRow({
      rank: '—',
      name: 'テスト講師2',
      actions: '<button type="button" class="btn-secondary-inline">別の講師を選ぶ</button>',
    }),
  });
}

function renderDayPanel(label, headCls, slot4Html, slot5Html, calloutCls, calloutText) {
  return `<div class="compare-panel">
    <div class="compare-panel-head ${headCls}">${label}</div>
    <div class="compare-panel-body">
      <div class="drawer-mock">
        <div class="day-head">8月6日（木）</div>
        <div class="slot-list">${slot4Html}${slot5Html}</div>
      </div>
      <div class="problem-callout ${calloutCls}">${calloutText}</div>
    </div>
  </div>`;
}

function renderDayCompare() {
  document.getElementById('dayCompare').innerHTML =
    renderDayPanel(
      '公開中',
      'live',
      renderWaitingSlot4Live(),
      renderUnconfirmedSlot5(),
      'bad',
      '4講だけ別レイアウト。大きいボタン。「先生」表記もバラバラ',
    ) +
    renderDayPanel(
      '修正版 v2',
      'next',
      renderWaitingSlot4Next(),
      renderUnconfirmedSlot5(),
      'good',
      '4講・5講とも同じ1枠＋行型。状態・名前・ボタンサイズが揃う',
    );
}

function renderPrevMistake() {
  document.getElementById('prevMistake').innerHTML = renderDayPanel(
    '前案（却下）— 二重表示・二重枠',
    'live',
    renderWaitingSlot4Prev(),
    '',
    'bad',
    '承認待ち＋依頼済みが重複。「先生」だけ付く。内側にまた枠',
  );
}

function renderWaitingZoom() {
  document.getElementById('waitingZoom').innerHTML =
    renderDayPanel('公開中 — 4講', 'live', renderWaitingSlot4Live(), '', 'bad', '講師行とボタンが離れ、ボタンが大きい') +
    renderDayPanel('修正版 v2 — 4講', 'next', renderWaitingSlot4Next(), '', 'good', '未確定の候補行と同じ型。余計な文言なし');
}

function renderButtonCompare() {
  document.getElementById('buttonCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head live">公開中</div>
      <div class="compare-panel-body">
        <div class="button-row-demo"><span>依頼</span><button type="button" class="btn-confirm">この講師に依頼</button></div>
        <div class="button-row-demo"><span>別講師</span><button type="button" class="btn-ghost-large">別の講師を選ぶ</button></div>
        <div class="problem-callout bad">高さ・文字サイズが約2倍違う</div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head next">修正版 v2</div>
      <div class="compare-panel-body">
        <div class="button-row-demo"><span>依頼</span><button type="button" class="btn-confirm">この講師に依頼</button></div>
        <div class="button-row-demo"><span>別講師</span><button type="button" class="btn-secondary-inline">別の講師を選ぶ</button></div>
        <div class="problem-callout good">同じ 11px · padding 4×10</div>
      </div>
    </div>
  `;
}

document.getElementById('evalSummary').innerHTML = EVAL;
document.getElementById('evalRecommend').innerHTML = RECOMMEND;
document.getElementById('principleList').innerHTML = PRINCIPLES.map(p => `<li>${p}</li>`).join('');
renderDayCompare();
renderPrevMistake();
renderWaitingZoom();
renderButtonCompare();
