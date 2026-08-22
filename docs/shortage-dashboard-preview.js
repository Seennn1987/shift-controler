const SUBJECT_STYLE = {
  '国語': { bg: '#FCE8E6', text: '#9F1239' },
  '算数': { bg: '#E0F7FA', text: '#0E7490' },
  '数学': { bg: '#DBEAFE', text: '#1D4ED8' },
  '理科': { bg: '#E6F5EC', text: '#15803D' },
  '社会': { bg: '#FFF4E5', text: '#C2410C' },
  '英語': { bg: '#F3E8FF', text: '#7C3AED' },
};

/** スクショ相当の11件（不足コマ数が多い順） */
const SHORTAGE_ITEMS = [
  { student: 'テスト 太郎', grade: '中2', subject: '数学', confirmed: 0, need: 3, gap: 3 },
  { student: 'テスト はなこ', grade: '小4', subject: '国語', confirmed: 0, need: 3, gap: 3 },
  { student: 'テスト ゆうじ', grade: '小6', subject: '社会', confirmed: 0, need: 3, gap: 3 },
  { student: 'テスト 次郎', grade: '中1', subject: '数学', confirmed: 0, need: 3, gap: 3 },
  { student: 'テスト 花子', grade: '小5', subject: '国語', confirmed: 0, need: 3, gap: 3 },
  { student: 'テスト 一郎', grade: '小3', subject: '算数', confirmed: 0, need: 3, gap: 3 },
  { student: 'テスト あや', grade: '小5', subject: '理科', confirmed: 0, need: 3, gap: 3 },
  { student: 'テスト けん', grade: '中3', subject: '英語', confirmed: 0, need: 3, gap: 3 },
  { student: 'テスト みき', grade: '小2', subject: '国語', confirmed: 0, need: 3, gap: 3 },
  { student: 'テスト さくら', grade: '小1', subject: '算数', confirmed: 0, need: 3, gap: 3 },
  { student: 'テスト はなこ', grade: '小4', subject: '算数', confirmed: 0, need: 2, gap: 2 },
];

const EVAL_SUMMARY = '公開中は<strong>機能として正しい</strong>が、①同じ説明が3回 ②11行すべて同じ赤箱 ③生徒がバラバラに見える、の3点で読みづらい。総合<strong>★★★☆☆（60点）</strong>。';

const RECOMMEND = `
  <strong>おすすめ：案A（生徒ブロック＋浮きカード）</strong><br>
  ・説明は上の警告バー<strong>1回だけ</strong><br>
  ・<strong>生徒ごと1枚</strong>の白カード（週間カレンダーと同じ「浮き」）<br>
  ・教科行の右に「候補を確認」→ 目線が行内で完結<br>
  ・状態は <strong>週3 · 0確定 · あと3</strong> と短く、赤は「あとN」だけ
`;

const PRINCIPLES = [
  '警告の件数はステータスバー1か所だけ。詳細内に同じ文言を繰り返さない',
  '生徒1人＝白カード1枚。中に教科行を並べる（同名の生徒が2行にならない）',
  '表の背景は薄グレー、カードは白＋影（週間v6dと同系統）',
  '赤は「あとNコマ」など数字だけ。行全体をピンクにしない（0確定でも）',
  '「候補を確認」はその教科行の右端（画面右端まで目線を飛ばさない）',
];

function subjectTag(subject) {
  const s = SUBJECT_STYLE[subject] || { bg: '#EEE', text: '#333' };
  return `<span class="sr-tag" style="background:${s.bg};color:${s.text};">${subject}</span>`;
}

function liveStatusText(count) {
  return `${count}件の教科で確定が不足しています`;
}

function groupByStudent(items) {
  const map = new Map();
  items.forEach(item => {
    const key = item.student;
    if (!map.has(key)) {
      map.set(key, { student: item.student, grade: item.grade, courses: [] });
    }
    map.get(key).courses.push(item);
  });
  return Array.from(map.values());
}

function renderLiveRow(item) {
  return `<div class="live-row">
    <span class="sr-name">${item.student}</span>
    ${subjectTag(item.subject)}
    <span class="sr-status">確定 ${item.confirmed} / 週 ${item.need} コマ（あと ${item.gap} コマ）</span>
    <button type="button" class="sr-jump">候補を確認</button>
  </div>`;
}

function renderLivePanel(items, { limit = null } = {}) {
  const list = limit ? items.slice(0, limit) : items;
  const more = limit && items.length > limit
    ? `<div class="more-note">…ほか ${items.length - limit} 件（同じ見た目）</div>`
    : '';
  return `
    <div class="live-status-bar"><div class="live-status-text">${liveStatusText(items.length)}</div></div>
    <p class="live-desc">週の必要コマ数に対して、まだ確定が足りていない教科だけを一覧表示します。「候補を確認」でその生徒・その日の詳細にジャンプできます。</p>
    <div class="live-summary">${liveStatusText(items.length)}（不足コマ数が多い順）</div>
    ${list.map(renderLiveRow).join('')}
    ${more}
  `;
}

function renderCourseStatusA(item) {
  const mild = item.gap === 1 ? ' is-mild' : '';
  return `<span class="a-course-status${mild}">週${item.need} · ${item.confirmed}確定 · <strong>あと${item.gap}</strong></span>`;
}

function renderStudentBlockA(block) {
  const rows = block.courses.map(c => `
    <div class="a-course-row">
      ${subjectTag(c.subject)}
      ${renderCourseStatusA(c)}
      <button type="button" class="sr-jump">候補を確認</button>
    </div>
  `).join('');
  return `<div class="a-student-card">
    <div class="a-student-head">
      <span class="a-student-name">${block.student}</span>
      <span class="a-student-grade">${block.grade}</span>
    </div>
    ${rows}
  </div>`;
}

function renderPanelA(items, { limit = null } = {}) {
  const groups = groupByStudent(items);
  const list = limit ? groups.slice(0, limit) : groups;
  const more = limit && groups.length > limit
    ? `<div class="more-note">…ほか ${groups.length - limit} 名</div>`
    : '';
  return `
    <div class="a-status-bar">${liveStatusText(items.length)} · 不足が多い順</div>
    <div class="a-well">
      ${list.map(renderStudentBlockA).join('')}
      ${more}
    </div>
  `;
}

function renderRowB(item) {
  const cls = item.confirmed === 0 ? ' is-zero' : '';
  return `<div class="b-row${cls}">
    <span class="sr-name">${item.student}</span>
    ${subjectTag(item.subject)}
    <span class="sr-status">週${item.need} · ${item.confirmed}確定 · <em>あと${item.gap}</em></span>
    <button type="button" class="sr-jump">候補を確認</button>
  </div>`;
}

function renderPanelC(block) {
  const chips = block.courses.map(c => `
    <div class="c-chip">
      ${subjectTag(c.subject)}
      <span class="gap-label">あと${c.gap}コマ</span>
      <button type="button" class="sr-jump">候補を確認</button>
    </div>
  `).join('');
  return `<div class="c-student-card">
    <div class="c-head">${block.student} <span style="font-size:11px;font-weight:500;color:#787E8D;">${block.grade}</span></div>
    <div class="c-chips">${chips}</div>
  </div>`;
}

function renderFullListCompare() {
  document.getElementById('fullListCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head live">公開中</div>
      <div class="compare-panel-body">
        ${renderLivePanel(SHORTAGE_ITEMS, { limit: 5 })}
        <div class="problem-callout bad">説明が3回・11行すべて同じ赤箱・「はなこ」が2行</div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head a">案A ★おすすめ</div>
      <div class="compare-panel-body">
        ${renderPanelA(SHORTAGE_ITEMS, { limit: 4 })}
        <div class="problem-callout good">10名分に整理・白カード・説明1回・ボタンは各行の右</div>
      </div>
    </div>
  `;
}

function renderStudentZoomCompare() {
  const hanakoItems = SHORTAGE_ITEMS.filter(i => i.student === 'テスト はなこ');
  const hanakoBlock = groupByStudent(hanakoItems)[0];

  document.getElementById('studentZoomCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head live">公開中 — 2行バラバラ</div>
      <div class="compare-panel-body">
        ${hanakoItems.map(renderLiveRow).join('')}
        <div class="problem-callout bad">同じ生徒なのに別々の赤箱</div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head a">案A — 1枚の白カード</div>
      <div class="compare-panel-body">
        ${renderStudentBlockA(hanakoBlock)}
        <div class="problem-callout good">生徒名は1回。教科行ごとにボタン</div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head c">案C — チップ型</div>
      <div class="compare-panel-body">
        ${renderPanelC(hanakoBlock)}
        <div class="problem-callout bad">コンパクトだが「週○確定」の情報が薄い</div>
      </div>
    </div>
  `;
}

function renderStatusTextCompare() {
  const sample = SHORTAGE_ITEMS[0];
  document.getElementById('statusTextCompare').innerHTML = `
    <div class="compare-panel">
      <div class="compare-panel-head live">公開中 — 長文・全部赤</div>
      <div class="compare-panel-body">
        <div class="status-sample">
          <div class="label">1行の状態</div>
          <div class="status-sample live">確定 ${sample.confirmed} / 週 ${sample.need} コマ（あと ${sample.gap} コマ）</div>
        </div>
        <div class="problem-callout bad">数字が多く、すべて同じ赤太字</div>
      </div>
    </div>
    <div class="compare-panel">
      <div class="compare-panel-head a">案A — 短く・赤は「あとN」</div>
      <div class="compare-panel-body">
        <div class="status-sample">
          <div class="label">1行の状態</div>
          <div class="status-sample a">週${sample.need} · ${sample.confirmed}確定 · <strong>あと${sample.gap}</strong></div>
        </div>
        <div class="status-sample">
          <div class="label">あと1コマ（ゆうじ・社会）</div>
          <div class="status-sample a">週1 · 0確定 · <strong style="color:#333;">あと1</strong> ← 緊急度低めの色</div>
        </div>
        <div class="problem-callout good">比較しやすい。赤の使い方を絞れる</div>
      </div>
    </div>
  `;
}

const PROS_CONS = [
  {
    title: '案A 生徒ブロック（おすすめ）',
    rec: true,
    good: ['生徒単位で頭の中と一致', '週間カレンダーと同じ浮きカード', '説明の重複を解消', 'ボタンが行の近く'],
    bad: ['実装はグループ化が必要', '1生徒に教科が多いとカードが縦に長い'],
  },
  {
    title: '案B フラット行・短文',
    rec: false,
    good: ['今のHTML構造に近い', '実装が軽い'],
    bad: ['生徒のまとまりは解消しない', '11行のまま'],
  },
  {
    title: '案C チップ型',
    rec: false,
    good: ['コンパクト', 'ボタンが教科の横'],
    bad: ['「週○コマ中」の情報が弱い', 'チップが増えるとごちゃつく'],
  },
  {
    title: '公開中',
    rec: false,
    good: ['すでに動いている', '1行1教科で検索しやすい'],
    bad: ['赤だらけ', '説明3回', '同一生徒が複数行'],
  },
];

function renderProsCons() {
  document.getElementById('prosConsGrid').innerHTML = PROS_CONS.map(p => `
    <div class="pros-item${p.rec ? ' is-rec' : ''}">
      <h4>${p.title}</h4>
      <strong>良い点</strong>
      <ul>${p.good.map(g => `<li>${g}</li>`).join('')}</ul>
      <strong>弱い点</strong>
      <ul>${p.bad.map(b => `<li>${b}</li>`).join('')}</ul>
    </div>
  `).join('');
}

document.getElementById('evalSummary').innerHTML = EVAL_SUMMARY;
document.getElementById('evalRecommend').innerHTML = RECOMMEND;
document.getElementById('principleList').innerHTML = PRINCIPLES.map(p => `<li>${p}</li>`).join('');
renderFullListCompare();
renderStudentZoomCompare();
renderStatusTextCompare();
renderProsCons();
