const CONFIRM_SEL = '.app-inline-confirm';

function escapeHtml(value){
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatMessage(message){
  return escapeHtml(message).replace(/\n/g, '<br>');
}

function resolveMountEl(anchorEl, mountSelector){
  if(mountSelector){
    return anchorEl.closest(mountSelector) || anchorEl.parentElement;
  }
  return anchorEl.closest(
    '.match-slot, .change-req-row, .matching-panel-actions, .pending-banner-col, .header-account, .approval-col-head, .shortage-panel-head-split',
  ) || anchorEl.parentElement;
}

export function clearInlineConfirms(root, selector = CONFIRM_SEL){
  if(!root) return;
  root.querySelectorAll(selector).forEach(el=> el.remove());
}

export function mountInlineConfirm(root, anchorEl, {
  message,
  messageParts,
  confirmLabel = '実行する',
  cancelLabel = 'やめる',
  variant = 'danger',
  mountSelector,
  onConfirm,
}){
  clearInlineConfirms(root);
  const mountEl = resolveMountEl(anchorEl, mountSelector);
  if(!mountEl || !anchorEl) return;
  const confirmCls = variant === 'primary' ? 'app-inline-confirm-primary' : 'app-inline-confirm-danger';
  const actionsHtml = `
    <div class="matching-panel-flash-followup-actions">
      <button type="button" class="mp-inline-action ${confirmCls}" data-action="confirm">${escapeHtml(confirmLabel)}</button>
      <button type="button" class="mp-inline-action app-inline-cancel-btn" data-action="cancel">${escapeHtml(cancelLabel)}</button>
    </div>
  `;
  if(messageParts){
    mountEl.insertAdjacentHTML('beforeend', `
      <div class="app-inline-confirm app-inline-confirm--head-actions matching-panel-flash-followup" role="group">
        <div class="app-inline-confirm-head">
          <span class="app-inline-confirm-title">${formatMessage(messageParts.title)}</span>
          ${actionsHtml}
        </div>
        ${messageParts.body ? `<div class="app-inline-confirm-body">${formatMessage(messageParts.body)}</div>` : ''}
        ${messageParts.footer ? `<div class="app-inline-confirm-foot">${formatMessage(messageParts.footer)}</div>` : ''}
      </div>
    `);
  }else{
    mountEl.insertAdjacentHTML('beforeend', `
      <div class="app-inline-confirm matching-panel-flash-followup" role="group">
        <span class="app-inline-confirm-text matching-panel-flash-followup-text">${formatMessage(message)}</span>
        ${actionsHtml}
      </div>
    `);
  }
  const box = mountEl.querySelector('.app-inline-confirm');
  const textEl = box.querySelector('.app-inline-confirm-text')
    || box.querySelector('.app-inline-confirm-body')
    || box.querySelector('.app-inline-confirm-title');
  box.querySelector('[data-action=cancel]').addEventListener('click', ()=> box.remove());
  box.querySelector('[data-action=confirm]').addEventListener('click', async ()=>{
    const confirmBtn = box.querySelector('[data-action=confirm]');
    confirmBtn.disabled = true;
    try{
      const result = await onConfirm();
      if(result && result.ok === false){
        if(textEl) textEl.innerHTML = formatMessage(result.msg || '処理に失敗しました。');
        confirmBtn.disabled = false;
        return;
      }
      box.remove();
    }catch(err){
      console.error('[inline-confirm]', err);
      if(textEl) textEl.textContent = '処理に失敗しました。';
      confirmBtn.disabled = false;
    }
  });
}

export function showInlineNotice(container, message, { variant = 'warn', clear = true } = {}){
  if(!container) return;
  if(clear) container.querySelectorAll('.app-inline-notice').forEach(el=> el.remove());
  const cls = variant === 'ok' ? 'ok' : 'warn';
  container.insertAdjacentHTML('afterbegin', `
    <div class="app-inline-notice ${cls}" role="alert">${formatMessage(message)}</div>
  `);
}

export function showActiveTabNotice(message, { variant = 'warn' } = {}){
  const host = document.querySelector('.tab-view.active') || document.getElementById('appRoot');
  showInlineNotice(host, message, { variant, clear: true });
}
