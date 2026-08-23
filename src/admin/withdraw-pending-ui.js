import { clearInlineConfirms, mountInlineConfirm } from '../shared/inline-confirm.js';

export function clearWithdrawConfirms(root){
  clearInlineConfirms(root);
}

export function mountWithdrawConfirm(root, btn, { teacherName, onConfirm }){
  mountInlineConfirm(root, btn, {
    message: `${teacherName || '講師'} への依頼を取り消し、別の講師を選びますか？`,
    confirmLabel: '依頼を取り消す',
    cancelLabel: 'やめる',
    variant: 'danger',
    mountSelector: '.match-slot',
    onConfirm,
  });
}
