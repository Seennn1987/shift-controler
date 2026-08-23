const SAMPLE_EMAIL = 'mirailab.admin@gmail.com';

const TABS = [
  { id: 'calendar', label: 'カレンダー', home: true, active: true },
  { id: 'student', label: '生徒登録' },
  { id: 'manage', label: '講師登録' },
  { id: 'teacherSchedule', label: 'シフト管理' },
  { id: 'finance', label: '分析' },
  { id: 'settings', label: '設定' },
];

const VARIANTS = [
  {
    id: 'now',
    title: '現状',
    badge: 'いま',
    badgeCls: 'is-now',
    rec: false,
    height: '約 118px',
    note: '副題あり・上下の余白が大きい。比較用。',
    variantCls: '',
    unified: false,
    showSub: true,
  },
  {
    id: 'a',
    title: '案A 副題削除＋余白縮小',
    badge: 'おすすめ',
    rec: true,
    height: '約 82px',
    saved: '▲ 約36px',
    note: '変更が少なく安全。副題を消し、ロゴ・タブの余白だけ詰める。',
    variantCls: 'variant-a',
    unified: false,
    showSub: false,
  },
  {
    id: 'b',
    title: '案B 1段統合',
    badge: 'いちばん薄い',
    rec: false,
    height: '約 44px',
    saved: '▲ 約74px',
    note: '緑バーの中にタブを入れる。メールは非表示（ログアウトのみ）。',
    variantCls: 'variant-b',
    unified: true,
    showSub: false,
  },
  {
    id: 'c',
    title: '案C 2段コンパクト',
    badge: 'バランス',
    rec: false,
    height: '約 76px',
    saved: '▲ 約42px',
    note: '2段のまま上下を薄く。メールは省略表示。',
    variantCls: 'variant-c',
    unified: false,
    showSub: false,
  },
  {
    id: 'd',
    title: '案D 極薄2段',
    badge: '案Aより薄く',
    rec: false,
    height: '約 72px',
    saved: '▲ 約46px',
    note: '案Aよりさらに詰める。タブ行を白背景でヘッダーに密着。',
    variantCls: 'variant-d',
    unified: false,
    showSub: false,
  },
];

function renderTabs({ inHeader = false } = {}){
  const cls = inHeader ? 'tabs tabs-in-header' : 'tabs';
  return `<div class="${cls}">${TABS.map(tab=> `
    <button type="button" class="tab-btn${tab.home ? ' tab-btn-home' : ''}${tab.active ? ' active' : ''}" disabled>${tab.label}</button>
  `).join('')}</div>`;
}

function renderChrome(variant){
  const subHtml = variant.showSub
    ? '<div class="sub">個別指導塾のコマ組み・シフト管理</div>'
    : '';
  const headerHtml = `<header class="top">
    <div class="inner">
      <div class="brand"><h1>ピタコマ</h1>${subHtml}</div>
      <div class="header-account">
        <span class="header-email">${SAMPLE_EMAIL}</span>
        <button type="button" class="logout-btn" disabled>ログアウト</button>
      </div>
    </div>
  </header>`;

  const tabsHtml = variant.unified ? '' : renderTabs();

  if(variant.unified){
    return `<div class="mock-app ${variant.variantCls}">
      <header class="top">
        <div class="inner">
          <div class="brand"><h1>ピタコマ</h1></div>
          ${renderTabs({ inHeader: true })}
          <div class="header-account">
            <span class="header-email">${SAMPLE_EMAIL}</span>
            <button type="button" class="logout-btn" disabled>ログアウト</button>
          </div>
        </div>
      </header>
      <div class="mock-body"><strong>カレンダー</strong> — コマ組みバーがここから始まります</div>
    </div>`;
  }

  return `<div class="mock-app ${variant.variantCls}">
    ${headerHtml}
    ${tabsHtml}
    <div class="mock-body"><strong>カレンダー</strong> — コマ組みバーがここから始まります</div>
  </div>`;
}

function renderRecommend(){
  document.getElementById('recommendBox').innerHTML = `
    <strong>AIのおすすめ：案A</strong><br>
    まずは副題を消して余白だけ詰める案Aが安全です。さらに薄くしたい場合は案D、1段にまとめるなら案Bを検討してください。<br>
    <span style="color:var(--ink-soft)">※ 高さはブラウザ幅1200px付近での目安です。</span>
  `;

  document.getElementById('heightCompare').innerHTML = VARIANTS.map(v=> `
    <div class="height-chip${v.rec ? ' is-rec' : ''}">
      <strong>${v.title}</strong>
      ${v.height}${v.saved ? ` <span style="color:var(--success)">${v.saved}</span>` : ''}
    </div>
  `).join('');
}

function renderVariants(){
  const grid = document.getElementById('variantGrid');
  grid.innerHTML = VARIANTS.map(v=> `
    <article class="variant-panel${v.rec ? ' is-rec' : ''}">
      <div class="variant-panel-head">
        <h3>${v.title}</h3>
        <span class="variant-badge${v.badgeCls ? ` ${v.badgeCls}` : ''}">${v.badge}</span>
      </div>
      <p class="variant-panel-note">${v.note}（${v.height}）</p>
      <div class="variant-frame">${renderChrome(v)}</div>
    </article>
  `).join('');
}

const PROS_CONS = [
  {
    title: '案A 副題削除＋余白縮小 ★',
    rec: true,
    pros: ['いまの見た目をほぼ維持', '副題削除だけで縦が一段短く', '実装・確認が早い'],
    cons: ['案Bほどは薄くならない'],
  },
  {
    title: '案B 1段統合',
    pros: ['いちばん縦が短い', 'タブが常に目線の近く'],
    cons: ['緑バーがごちゃつきやすい', 'メールアドレスが見えない'],
  },
  {
    title: '案C 2段コンパクト',
    pros: ['2段のまま案Aより薄い', 'メールは省略表示で残る'],
    cons: ['メールが途中で切れる', '案Aと似ていて差が小さい'],
  },
  {
    title: '案D 極薄2段',
    pros: ['案Aよりさらに約4px分薄い', '白タブ行で区切りははっきり'],
    cons: ['文字が小さめ', 'タブとヘッダーの境目がやや詰まって見える'],
  },
];

function renderProsCons(){
  document.getElementById('prosConsGrid').innerHTML = PROS_CONS.map(card=> `
    <div class="pros-card${card.rec ? ' is-rec' : ''}">
      <h3>${card.title}</h3>
      <ul>
        ${card.pros.map(p=> `<li>＋ ${p}</li>`).join('')}
        ${card.cons.map(c=> `<li>− ${c}</li>`).join('')}
      </ul>
    </div>
  `).join('');
}

function setPreviewUrl(){
  const el = document.getElementById('previewUrl');
  if(!el) return;
  const path = `${window.location.origin}${window.location.pathname}`;
  el.textContent = path;
}

renderRecommend();
renderVariants();
renderProsCons();
setPreviewUrl();
