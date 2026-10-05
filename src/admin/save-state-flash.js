// 保存の食い違い・失敗を、どのタブでも見える画面上部に出す（見た目は振替アラートと同じ型）

function host(){
  return document.getElementById('saveStateFlash');
}

function render(html){
  const el = host();
  if(!el) return null;
  el.hidden = false;
  el.innerHTML = html;
  return el;
}

export function showSaveConflictFlash(){
  const el = render(`<div class="matching-panel-result-msg warn" role="alert">
    <div class="matching-panel-flash-main">別の画面（ほかのタブや端末）で、データが先に更新されています</div>
    <div class="matching-panel-flash-followup">
      <span class="matching-panel-flash-followup-text">古い内容で上書きしないよう、この画面からは保存を止めました。最新の内容を読み込んでから操作してください。</span>
      <div class="matching-panel-flash-followup-actions">
        <button type="button" class="ghost matching-panel-flash-btn" data-action="reload">最新を読み込む</button>
      </div>
    </div>
  </div>`);
  el?.querySelector('[data-action=reload]')?.addEventListener('click', ()=> window.location.reload());
}

export function showSaveErrorFlash(){
  const el = host();
  if(!el || el.querySelector('[data-action=reload]')) return;
  render(`<div class="matching-panel-result-msg warn" role="alert">
    <div class="matching-panel-flash-main">保存できませんでした</div>
    <div class="matching-panel-flash-followup">
      <span class="matching-panel-flash-followup-text">通信状態を確かめてください。次の操作のときに、もう一度保存します。</span>
    </div>
  </div>`);
}

export function clearSaveErrorFlash(){
  const el = host();
  if(!el || el.querySelector('[data-action=reload]')) return;
  el.hidden = true;
  el.innerHTML = '';
}
