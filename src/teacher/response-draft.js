const STORAGE_PREFIX = 'pitakoma_response_draft_v1_';

function storageKey(uid){
  return `${STORAGE_PREFIX}${uid}`;
}

export function draftKeyForTicket(ticketId){
  return `ticket:${ticketId}`;
}

export function draftKeyForSlot(dateStr, slotId){
  return `slot:${dateStr}|${slotId}`;
}

export function draftKeyForCancel(entry, dateStr){
  const d = dateStr || entry.dateStr || entry.oneTimeDate || '';
  return `cancel:${d}|${entry.day}|${entry.slot}|${entry.subject}|${entry.studentName}|${entry.oneTimeDate||''}`;
}

export function loadResponseDrafts(uid){
  if(!uid) return {};
  try{
    const raw = localStorage.getItem(storageKey(uid));
    return raw ? JSON.parse(raw) : {};
  }catch(err){
    console.error('返事下書きの読み込みエラー:', err);
    return {};
  }
}

export function saveResponseDrafts(uid, drafts){
  if(!uid) return;
  if(!drafts || Object.keys(drafts).length === 0){
    localStorage.removeItem(storageKey(uid));
    return;
  }
  localStorage.setItem(storageKey(uid), JSON.stringify(drafts));
}

export function summarizeDrafts(drafts){
  let approve = 0, reject = 0, cancel = 0;
  Object.values(drafts).forEach(d=>{
    if(d.action === 'approve') approve++;
    else if(d.action === 'reject') reject++;
    else if(d.action === 'cancel') cancel++;
  });
  const parts = [];
  if(approve) parts.push(`承認${approve}件`);
  if(reject) parts.push(`辞退${reject}件`);
  if(cancel) parts.push(`キャンセル依頼${cancel}件`);
  return parts.join('・') || '';
}

export function actionLabel(action){
  if(action === 'approve') return '承認';
  if(action === 'reject') return '辞退';
  if(action === 'cancel') return 'キャンセルを依頼';
  return action;
}
