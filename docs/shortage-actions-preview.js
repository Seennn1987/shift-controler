(function(){
  'use strict';

  const BUTTONS = {
    auto: '全コマを自動で組む',
    send: '講師にスケジュールを送信',
    cancelAuto: '自動マッチングで解除',
    cancelDrafts: '仮決めをすべて解除',
  };

  function mockFlow(){
    return `<div class="mock-flow">
      <span class="mock-flow-kpi">講師なし <span>0</span>コマ</span>
      <span aria-hidden="true">→</span>
      <span class="mock-flow-kpi">仮決め <span>26</span>件</span>
      <span aria-hidden="true">→</span>
      <span class="mock-flow-kpi">承認待ち <span>0</span>件</span>
      <span aria-hidden="true">→</span>
      <span class="mock-flow-kpi">確定 <span>0</span>件</span>
    </div>`;
  }

  function renderCurrent(){
    return `<div class="actions-current">
      <div class="shortage-actions-grid">
        <button type="button" class="ghost shortage-action-btn">${BUTTONS.auto}</button>
        <button type="button" class="primary shortage-action-btn">${BUTTONS.send}</button>
        <button type="button" class="danger-ghost shortage-action-btn">${BUTTONS.cancelAuto}</button>
        <button type="button" class="danger-ghost shortage-action-btn">${BUTTONS.cancelDrafts}</button>
      </div>
    </div>`;
  }

  function renderA(){
    return `<div class="actions-a">
      <div class="actions-row">
        <button type="button" class="primary">${BUTTONS.send}</button>
        <button type="button" class="ghost">${BUTTONS.auto}</button>
      </div>
      <div class="actions-row">
        <span class="actions-row-label">取り消し</span>
        <button type="button" class="btn-text">${BUTTONS.cancelAuto}</button>
        <button type="button" class="btn-text">${BUTTONS.cancelDrafts}</button>
      </div>
    </div>`;
  }

  function toolbarHtml(className, autoClass){
    const autoCls = autoClass || 'ghost';
    return `<div class="${className}">
      <div class="actions-toolbar">
        <button type="button" class="${autoCls}">${BUTTONS.auto}</button>
        <button type="button" class="primary">${BUTTONS.send}</button>
        <span class="actions-sep" aria-hidden="true"></span>
        <button type="button" class="btn-text">${BUTTONS.cancelAuto}</button>
        <button type="button" class="btn-text">${BUTTONS.cancelDrafts}</button>
      </div>
    </div>`;
  }

  function renderB(){ return toolbarHtml('actions-b'); }
  function renderB2(){ return toolbarHtml('actions-b2'); }
  function renderB3(){ return toolbarHtml('actions-b3', 'ghost-muted'); }
  function renderB4(){ return toolbarHtml('actions-b4', 'ghost-strong'); }

  function renderC(){
    return `<div class="actions-c">
      <div class="actions-groups">
        <div class="actions-group">
          <span class="actions-group-label">実行</span>
          <button type="button" class="ghost">${BUTTONS.auto}</button>
          <button type="button" class="primary">${BUTTONS.send}</button>
        </div>
        <div class="actions-group is-danger">
          <span class="actions-group-label">取り消し</span>
          <button type="button" class="danger-ghost">${BUTTONS.cancelAuto}</button>
          <button type="button" class="danger-ghost">${BUTTONS.cancelDrafts}</button>
        </div>
      </div>
    </div>`;
  }

  function renderD(){
    return `<div class="actions-d">
      <div class="actions-primary-row">
        <button type="button" class="primary">${BUTTONS.send}</button>
      </div>
      <div class="actions-secondary-row">
        <button type="button" class="ghost">${BUTTONS.auto}</button>
        <button type="button" class="ghost is-danger-text">${BUTTONS.cancelAuto}</button>
        <button type="button" class="ghost is-danger-text">${BUTTONS.cancelDrafts}</button>
      </div>
    </div>`;
  }

  function variantCard(title, html, rec, whiteBg){
    const zoneCls = whiteBg ? 'mock-zone is-white-bg' : 'mock-zone';
    return `<div class="variant-card${rec ? ' is-rec' : ''}">
      <div class="variant-head">${title}</div>
      <div class="variant-body">
        <div class="${zoneCls}">${mockFlow()}${html}</div>
      </div>
    </div>`;
  }

  function renderGhostEval(){
    document.getElementById('ghostEval').innerHTML = [
      ['問題', '白上の白', '案Bの「全コマを自動で組む」は <strong>白背景＋白ボタン＋薄い枠</strong>。ページも白なので、ボタンがあること自体が分かりにくい。'],
      ['原因', 'ghost の定義', '副ボタン = <code>surface-card</code>（白）＋ <code>border</code>（#D4D8DD）。コントラストが弱い。'],
      ['影響', '押せるか不明', '教室長が「ここを押すの？」と迷う。無効状態と見間違える可能性も。'],
    ].map(([tag, title, body])=>`<div class="eval-row"><strong>${tag}<br>${title}</strong><span>${body}</span></div>`).join('');

    document.getElementById('ghostRecommend').innerHTML =
      '<strong>おすすめ：案B2</strong> — 4ボタン全体を<strong>薄グレーの帯（surface-muted）</strong>に載せる。白ボタンが帯の上に浮いて見える。案Bの1行レイアウトはそのまま。';
  }

  function renderGhostFixGrid(){
    document.getElementById('ghostFixGrid').innerHTML = [
      variantCard('公開中（案B）— 白に白で見えにくい', renderB(), false, true),
      variantCard('案B2（おすすめ）— ツールバー全体を薄グレー', renderB2(), true, true),
      variantCard('案B3 — 副ボタンだけ薄グレー塗り', renderB3(), false, true),
      variantCard('案B4 — 副ボタン枠を濃く＋軽い影', renderB4(), false, true),
    ].join('');
  }

  function renderGhostProsCons(){
    const items = [
      {
        title: '案B2（おすすめ）',
        rec: true,
        pros: ['操作ゾーン全体が1塊と分かる', '白ボタンがはっきり見える', '週間カレンダーのマス（薄グレー）と同系統', '案Bの並び・区切り線を維持'],
        cons: ['帯の分だけ縦が数px増える'],
      },
      {
        title: '案B3 — 副ボタンだけグレー',
        pros: ['変更が最小（ボタン1つの色だけ）', '白背景のまま'],
        cons: ['帯がないので操作エリアのまとまりは弱い'],
      },
      {
        title: '案B4 — 枠を濃く',
        pros: ['白背景のままコントラストUP'],
        cons: ['枠+影は他ボタンとまた別ルール', '帯より弱い'],
      },
    ];
    document.getElementById('ghostProsCons').innerHTML = items.map(it=>`
      <div class="pros-cons-card${it.rec ? ' is-rec' : ''}">
        <div class="pros-cons-head">${it.title}</div>
        <div class="pros-cons-body">
          <h4>長所</h4><ul>${it.pros.map(p=>`<li>${p}</li>`).join('')}</ul>
          <h4>短所</h4><ul>${it.cons.map(c=>`<li>${c}</li>`).join('')}</ul>
        </div>
      </div>`).join('');
  }

  function renderEval(){
    document.getElementById('evalGrid').innerHTML = [
      ['★★☆☆☆', '色の統一', '白枠・青塗り・赤枠×2の<strong>4種類</strong>が同じ大きさで並び、どれが主操作か分かりにくい。'],
      ['横幅', '2列×100%幅', '1ボタンが画面の<strong>半分</strong>を占める。文字は短いのに箱だけ大きい。'],
      ['階層', '操作の順序', 'フローは「自動→送信→確定」なのに、ボタン配置が2×2で<strong>優先順位と無関係</strong>。'],
      ['危険操作', '解除2つ', '同じ danger-ghost だが、ホバーで見え方が変わり<strong>色が揃って見えない</strong>ことがある。'],
      ['ガイドライン', '4種ボタン', '主=青 / 副=ghost / 危険=赤文字 — この使い分けは正しいが、<strong>全部同サイズの巨大ボタン</strong>にしているのが問題。'],
    ].map(([score, title, body])=>`<div class="eval-row"><strong>${score}<br>${title}</strong><span>${body}</span></div>`).join('');

    document.getElementById('recommendBox').innerHTML =
      '<strong>おすすめ：案A</strong> — 1行目に「送信（主）＋自動（副）」を<strong>文字幅のボタン</strong>で横並び。2行目「取り消し」は btn-text（赤文字・枠なし）で小さく。横幅100%をやめ、操作の強弱が一目で分かる。';
  }

  function renderVariants(){
    document.getElementById('variantGrid').innerHTML = [
      variantCard('公開中（いま）', renderCurrent(), false),
      variantCard('案A（おすすめ）— 段階レイアウト＋内容幅', renderA(), true),
      variantCard('案B — 1行ツールバー', renderB(), false),
      variantCard('案C — 実行 / 取り消しグループ', renderC(), false),
      variantCard('案D — 主1ボタン＋副3同型', renderD(), false),
    ].join('');
  }

  function renderProsCons(){
    const items = [
      {
        title: '案A（おすすめ）',
        rec: true,
        pros: ['主操作（送信）だけ青で目立つ', '解除は小さく・誤タップしにくい', '横幅=文字量に合わせてスッキリ', 'フローの「実行→取り消し」と並びが一致'],
        cons: ['2行になる（縦はやや増える）'],
      },
      {
        title: '案B — 1行ツールバー',
        pros: ['1行に収まる', '区切り線で解除を分離'],
        cons: ['狭い画面で折り返し', '解除が小さすぎて見落としの可能性'],
      },
      {
        title: '案C — グループ枠',
        pros: ['実行と取り消しが枠で明確'],
        cons: ['枠が増えてやや重い', '解除ボタンがまだ大きめ'],
      },
      {
        title: '案D — 主1＋副3',
        pros: ['送信だけ独立して目立つ'],
        cons: ['副3が同型で解除2つがまだ目立つ', '危険操作の差が弱い'],
      },
    ];
    document.getElementById('prosCons').innerHTML = items.map(it=>`
      <div class="pros-cons-card${it.rec ? ' is-rec' : ''}">
        <div class="pros-cons-head">${it.title}</div>
        <div class="pros-cons-body">
          <h4>長所</h4><ul>${it.pros.map(p=>`<li>${p}</li>`).join('')}</ul>
          <h4>短所</h4><ul>${it.cons.map(c=>`<li>${c}</li>`).join('')}</ul>
        </div>
      </div>`).join('');
  }

  function renderMobile(){
    document.getElementById('mobileA').innerHTML = `
      <div class="variant-head is-rec">案A — 375px</div>
      <div class="variant-body"><div class="mock-zone">${mockFlow()}${renderA()}</div></div>`;
  }

  renderGhostEval();
  renderGhostFixGrid();
  renderGhostProsCons();
  renderEval();
  renderVariants();
  renderProsCons();
  renderMobile();
})();
