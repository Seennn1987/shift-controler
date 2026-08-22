export function clearWithdrawConfirms(root){
  if(!root) return;
  root.querySelectorAll('.mp-withdraw-confirm').forEach(el=> el.remove());
}

export function mountWithdrawConfirm(root, btn, { teacherName, onConfirm }){
  clearWithdrawConfirms(root);
  const slot = btn.closest('.match-slot');
  if(!slot) return;
  const name = teacherName || '講師';
  slot.insertAdjacentHTML('beforeend', `
    <div class="matching-panel-flash-followup mp-withdraw-confirm" role="group" aria-label="依頼取り消しの確認">
      <span class="matching-panel-flash-followup-text mp-withdraw-confirm-text">${name} への依頼を取り消し、別の講師を選びますか？</span>
      <div class="matching-panel-flash-followup-actions">
        <button type="button" class="mp-inline-action mp-withdraw-confirm-danger" data-action="confirm">依頼を取り消す</button>
        <button type="button" class="mp-inline-action mp-withdraw-cancel-btn" data-action="cancel">やめる</button>
      </div>
    </div>
  `);
  const box = slot.querySelector('.mp-withdraw-confirm');
  const textEl = box.querySelector('.mp-withdraw-confirm-text');
  box.querySelector('[data-action=cancel]').addEventListener('click', ()=> box.remove());
  box.querySelector('[data-action=confirm]').addEventListener('click', async ()=>{
    const confirmBtn = box.querySelector('[data-action=confirm]');
    confirmBtn.disabled = true;
    try{
      const result = await onConfirm();
      if(result && result.ok === false){
        textEl.textContent = result.msg || '取り消しに失敗しました。';
        confirmBtn.disabled = false;
        return;
      }
      box.remove();
    }catch(err){
      console.error('依頼取り消しエラー:', err);
      textEl.textContent = '取り消しに失敗しました。';
      confirmBtn.disabled = false;
    }
  });
}
