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

let dialogPromise = null;
let dialogResolve = null;
let keyHandler = null;

function getOverlay(){
  return document.getElementById('appConfirmOverlay');
}

function closeDialog(result){
  const overlay = getOverlay();
  if(!overlay) return;
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('app-confirm-open');
  if(keyHandler){
    document.removeEventListener('keydown', keyHandler);
    keyHandler = null;
  }
  const extra = document.getElementById('appConfirmExtra');
  if(extra){
    extra.hidden = true;
    extra.innerHTML = '';
  }
  if(dialogResolve){
    dialogResolve(result);
    dialogResolve = null;
  }
  dialogPromise = null;
}

/**
 * 画面中央の確認ポップアップ（ブラウザ標準ダイアログは使わない）
 * @returns {Promise<boolean>} 確定=true / やめる=false
 */
export function showAppConfirmDialog({
  title,
  message = '',
  extraHtml = '',
  confirmLabel = '実行する',
  cancelLabel = 'やめる',
  variant = 'primary',
  ackOnly = false,
}){
  if(dialogPromise) closeDialog(false);

  const overlay = getOverlay();
  const titleEl = document.getElementById('appConfirmTitle');
  const bodyEl = document.getElementById('appConfirmBody');
  const extraEl = document.getElementById('appConfirmExtra');
  const submitBtn = document.getElementById('appConfirmSubmitBtn');
  const cancelBtn = document.getElementById('appConfirmCancelBtn');
  const closeBtn = document.getElementById('appConfirmCloseBtn');
  if(!overlay || !titleEl || !bodyEl || !extraEl || !submitBtn || !cancelBtn) {
    return Promise.resolve(false);
  }

  titleEl.textContent = title || '';
  bodyEl.innerHTML = message ? formatMessage(message) : '';
  if(extraHtml){
    extraEl.innerHTML = extraHtml;
    extraEl.hidden = false;
  }else{
    extraEl.innerHTML = '';
    extraEl.hidden = true;
  }

  submitBtn.textContent = confirmLabel;
  submitBtn.className = variant === 'danger'
    ? 'app-confirm-submit danger-ghost'
    : 'app-confirm-submit primary';
  cancelBtn.textContent = cancelLabel;
  cancelBtn.hidden = !!ackOnly;

  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('app-confirm-open');
  (ackOnly ? submitBtn : cancelBtn).focus();

  const onCancel = ()=> closeDialog(false);
  const onConfirm = ()=> closeDialog(true);

  cancelBtn.onclick = onCancel;
  if(closeBtn) closeBtn.onclick = onCancel;
  submitBtn.onclick = onConfirm;
  overlay.onclick = (ev)=>{
    if(ev.target === overlay) onCancel();
  };

  keyHandler = (ev)=>{
    if(ev.key === 'Escape') onCancel();
  };
  document.addEventListener('keydown', keyHandler);

  dialogPromise = new Promise(resolve=>{
    dialogResolve = resolve;
  });
  return dialogPromise;
}

/** 知らせ専用（OK または右上の × で閉じる） */
export function showAppNoticeDialog({ title, message, confirmLabel = 'OK' }){
  return showAppConfirmDialog({ title, message, confirmLabel, ackOnly: true });
}

/** 開いている確認ポップアップを閉じる */
export function dismissAppConfirmDialog(confirmed = false){
  closeDialog(confirmed);
}

export async function runAppConfirmDialog(options, onConfirm){
  const ok = await showAppConfirmDialog(options);
  if(!ok) return { ok: false, cancelled: true };
  try{
    const result = await onConfirm();
    if(result && result.ok === false){
      return result;
    }
    return { ok: true, ...(result || {}) };
  }catch(err){
    console.error('[app-confirm-dialog]', err);
    return { ok: false, msg: '処理に失敗しました。' };
  }
}
