import { fbAuth, fbDb, S } from './state.js';
import { debugLog } from './debug.js';
import { renderMyCalendar } from './calendar.js';
import { showInlineNotice } from '../shared/inline-confirm.js';

const POLL_MS = 3000;
const INITIAL_RETRY_DELAYS_MS = [0, 2000, 2000];

function applyClassroomSettingsData(data){
  S.regularClosedDays = data.regularClosedDays || ['日'];
  S.holidayAutoDetect = !!data.holidayAutoDetect;
  S.customClosures = data.customClosures || [];
}

function clearClassroomSettingsNotice(){
  const host = document.getElementById('submitDock') || document.getElementById('appRoot');
  host?.querySelectorAll('.app-inline-notice.is-closure-settings').forEach(el=> el.remove());
}

function showClassroomSettingsNotice(message){
  const host = document.getElementById('submitDock') || document.getElementById('appRoot');
  if(!host || !message) return;
  clearClassroomSettingsNotice();
  showInlineNotice(host, message, { variant: 'warn', clear: false });
  host.querySelector('.app-inline-notice:last-of-type')?.classList.add('is-closure-settings');
}

async function fetchClassroomSettingsOnce(){
  if(!S.myAdminUid){
    return { ok: false, loaded: false, msg: '教室情報を確認できませんでした。' };
  }
  const path = `classroomSettings/${S.myAdminUid}`;
  const uidAtCallTime = fbAuth.currentUser ? fbAuth.currentUser.uid : '(null)';
  debugLog(`[classroomSettings] 呼び出し開始 path=${path} 呼び出し時のcurrentUser.uid=${uidAtCallTime}`);
  try{
    const snap = await fbDb.collection('classroomSettings').doc(S.myAdminUid).get();
    debugLog(`[classroomSettings] 成功 exists=${snap.exists}`);
    if(snap.exists){
      applyClassroomSettingsData(snap.data());
      return { ok: true, loaded: true };
    }
    return { ok: true, loaded: false };
  }catch(err){
    debugLog(`[classroomSettings] ★失敗★ code=${err.code} message=${err.message}`);
    console.error('休校日設定の読み込みエラー:', err);
    return {
      ok: false,
      loaded: false,
      msg: '休校設定を読み込めませんでした。時間をおいて再度お試しください。',
    };
  }
}

async function loadClassroomSettingsWithRetry(){
  let lastResult = { ok: true, loaded: false };
  for(let i = 0; i < INITIAL_RETRY_DELAYS_MS.length; i++){
    if(i > 0) await new Promise(resolve=> setTimeout(resolve, INITIAL_RETRY_DELAYS_MS[i]));
    lastResult = await fetchClassroomSettingsOnce();
    if(!lastResult.ok || lastResult.loaded) return lastResult;
  }
  return lastResult;
}

function stopClassroomSettingsListener(){
  if(S.classroomSettingsTimer){
    clearInterval(S.classroomSettingsTimer);
    S.classroomSettingsTimer = null;
  }
}

async function startClassroomSettingsListener(){
  if(S.classroomSettingsTimer) clearInterval(S.classroomSettingsTimer);

  const first = await loadClassroomSettingsWithRetry();
  if(!first.ok){
    showClassroomSettingsNotice(first.msg);
  }else{
    clearClassroomSettingsNotice();
  }
  renderMyCalendar();

  const poll = async ()=>{
    const result = await fetchClassroomSettingsOnce();
    if(result.ok && result.loaded){
      clearClassroomSettingsNotice();
    }else if(!result.ok){
      showClassroomSettingsNotice(result.msg);
    }
    renderMyCalendar();
  };

  S.classroomSettingsTimer = setInterval(poll, POLL_MS);
}

export { startClassroomSettingsListener, stopClassroomSettingsListener };
