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

  function renderB(){
    return `<div class="actions-b">
      <div class="actions-toolbar">
        <button type="button" class="ghost">${BUTTONS.auto}</button>
        <button type="button" class="primary">${BUTTONS.send}</button>
        <span class="actions-sep" aria-hidden="true"></span>
        <button type="button" class="btn-text">${BUTTONS.cancelAuto}</button>
        <button type="button" class="btn-text">${BUTTONS.cancelDrafts}</button>
      </div>
    </div>`;
  }

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

  function variantCard(title, html, rec){
    return `<div class="variant-card${rec ? ' is-rec' : ''}">
      <div class="variant-head">${title}</div>
      <div class="variant-body">
        <div class="mock-zone">${mockFlow()}${html}</div>
      </div>
    </div>`;
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

  renderEval();
  renderVariants();
  renderProsCons();
  renderMobile();
})();
