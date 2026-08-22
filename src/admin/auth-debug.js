/** 教室長画面：ログアウト原因調査用（原因特定後に削除予定）— コンソール出力のみ */

const LOG_KEY = 'pitakoma_auth_debug_log';
const MAX_LOG_LINES = 200;
const sessionStartMs = Date.now();
let signOutCalledRecently = false;
let lastUserSeenAt = null;
let lastUserUid = null;

function formatElapsed(){
  const sec = Math.round((Date.now() - sessionStartMs) / 1000);
  return `${sec}s`;
}

function getPersistedLogs(){
  try{
    return JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]');
  }catch(_e){
    return [];
  }
}

function persistLog(line){
  try{
    const prev = getPersistedLogs();
    prev.push(line);
    while(prev.length > MAX_LOG_LINES) prev.shift();
    sessionStorage.setItem(LOG_KEY, JSON.stringify(prev));
  }catch(_e){ /* ignore */ }
}

function authDebugLog(event, detail){
  const ts = new Date().toLocaleTimeString('ja-JP', { hour12: false });
  const elapsed = formatElapsed();
  const detailText = detail == null ? '' : (typeof detail === 'string' ? detail : JSON.stringify(detail));
  const line = `[${ts} +${elapsed}] ${event}${detailText ? ' | ' + detailText : ''}`;
  console.log('[ピタコマ Auth]', line);
  persistLog(line);
}

/** 再読み込み後、コンソールに全履歴を出力する（画面UIなし） */
function dumpPersistedLogsToConsole(){
  const logs = getPersistedLogs();
  console.group(`[ピタコマ Auth] 保存済みログ全件（${logs.length}件）`);
  logs.forEach(line=>console.log(line));
  console.groupEnd();
  console.info('[ピタコマ Auth] コピー用: copy(JSON.parse(sessionStorage.getItem("pitakoma_auth_debug_log")).join("\\n"))');
}

function printReloadHistory(reloadReason){
  const logs = getPersistedLogs();
  if(logs.length === 0 && !reloadReason) return;
  console.group('[ピタコマ Auth] 前回セッションの履歴（再読み込み後も参照できます）');
  if(reloadReason) console.warn('再読み込み理由:', reloadReason);
  logs.forEach(line=>console.log('[履歴]', line));
  console.groupEnd();
  console.info('[ピタコマ Auth] 履歴再表示: __pitakomaAuthDebugDump()');
}

function patchSignOut(fbAuth, label){
  if(fbAuth.__pitakomaSignOutPatched) return;
  fbAuth.__pitakomaSignOutPatched = true;
  const original = fbAuth.signOut.bind(fbAuth);
  fbAuth.signOut = function patchedSignOut(){
    signOutCalledRecently = true;
    setTimeout(()=>{ signOutCalledRecently = false; }, 3000);
    const stack = (new Error('signOut trace')).stack || '';
    const shortStack = stack.split('\n').slice(1, 5).join(' / ');
    authDebugLog(`${label} signOut() 呼び出し`, shortStack);
    return original();
  };
}

let getSecondaryAuthRef = null;

function wrapSecondaryAuthForDebug(){
  if(!getSecondaryAuthRef) return;
  try{
    const secAuth = getSecondaryAuthRef();
    patchSignOut(secAuth, '講師発行用（サブ）');
    if(!secAuth.__pitakomaStateListener){
      secAuth.__pitakomaStateListener = true;
      secAuth.onAuthStateChanged(user=>{
        authDebugLog('サブAuth onAuthStateChanged', user
          ? { uid: user.uid.slice(0, 8) + '…' }
          : { user: null });
      });
    }
  }catch(err){
    authDebugLog('サブAuth 監視セットアップ失敗', err.message || String(err));
  }
}

function noteUserPresence(user){
  if(user){
    lastUserSeenAt = Date.now();
    lastUserUid = user.uid;
    return;
  }
  if(!lastUserSeenAt) return;
  const heldSec = Math.round((Date.now() - lastUserSeenAt) / 1000);
  if(signOutCalledRecently){
    authDebugLog('★ログアウト検知★', { 原因: 'signOut() が呼ばれた', ログイン維持秒: heldSec, uid: lastUserUid?.slice(0, 8) + '…' });
  }else{
    authDebugLog('★ログアウト検知★', {
      原因: 'Firebase側でログイン状態が消えた（signOut未呼び出し）',
      ログイン維持秒: heldSec,
      uid: lastUserUid?.slice(0, 8) + '…',
      ヒント: '別タブの講師ページ・APIキー制限・ブラウザのCookie制限を疑う',
    });
  }
  lastUserSeenAt = null;
  lastUserUid = null;
}

function installAuthDebug({ fbAuth, S, getSecondaryAuth }){
  getSecondaryAuthRef = getSecondaryAuth;

  window.__pitakomaAuthDebugDump = dumpPersistedLogsToConsole;
  window.__pitakomaAuthDebugClear = ()=>{
    sessionStorage.removeItem(LOG_KEY);
    sessionStorage.removeItem('pitakoma_auth_reload_reason');
    console.info('[ピタコマ Auth] ログを消去しました');
  };

  const reloadReason = sessionStorage.getItem('pitakoma_auth_reload_reason');
  if(reloadReason){
    printReloadHistory(reloadReason);
    sessionStorage.removeItem('pitakoma_auth_reload_reason');
  }

  authDebugLog('診断開始', {
    href: location.href,
    hostname: location.hostname,
    appInitialized: S.appInitialized,
    引き継ぎ件数: getPersistedLogs().length,
  });
  console.info('[ピタコマ Auth] 再読み込み後に履歴を見る: __pitakomaAuthDebugDump()');

  patchSignOut(fbAuth, '教室長');

  fbAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
    .then(()=>authDebugLog('ログイン状態の保存方式 LOCAL 設定 OK'))
    .catch(err=>authDebugLog('ログイン状態の保存方式 設定失敗', { code: err.code, message: err.message }));

  fbAuth.onAuthStateChanged(user=>{
    noteUserPresence(user);
    authDebugLog('onAuthStateChanged', user
      ? { uid: user.uid.slice(0, 8) + '…', email: user.email || '(なし)' }
      : { user: null, appInitialized: S.appInitialized });
  });

  fbAuth.onIdTokenChanged(async user=>{
    authDebugLog('onIdTokenChanged（トークン更新など）', user
      ? { uid: user.uid.slice(0, 8) + '…' }
      : { user: null });
    if(!user) return;
    try{
      await user.getIdToken(false);
      authDebugLog('getIdToken 成功（onIdTokenChanged直後）');
    }catch(err){
      authDebugLog('getIdToken ★失敗★（onIdTokenChanged直後）', { code: err.code, message: err.message });
    }
  });

  document.addEventListener('visibilitychange', ()=>{
    authDebugLog('タブの表示状態が変化', {
      state: document.visibilityState,
      hasUser: !!fbAuth.currentUser,
    });
  });

  window.addEventListener('pagehide', ()=>{
    authDebugLog('pagehide（ページを離れる直前）', { hasUser: !!fbAuth.currentUser });
  });

  window.addEventListener('beforeunload', ()=>{
    authDebugLog('beforeunload（再読み込み/閉じる直前）', { hasUser: !!fbAuth.currentUser });
  });

  window.addEventListener('storage', (e)=>{
    if(!e.key || !e.key.includes('firebase')) return;
    authDebugLog('別タブで storage 変更（Firebase関連）', {
      key: e.key,
      hasUser: !!fbAuth.currentUser,
    });
  });

  setInterval(()=>{
    authDebugLog('heartbeat（10秒ごと）', {
      hasUser: !!fbAuth.currentUser,
      uid: fbAuth.currentUser ? fbAuth.currentUser.uid.slice(0, 8) + '…' : null,
      appInitialized: S.appInitialized,
    });
  }, 10000);

  setInterval(async ()=>{
    const user = fbAuth.currentUser;
    if(!user) return;
    try{
      await user.getIdToken(true);
      authDebugLog('getIdToken(forceRefresh) 成功');
    }catch(err){
      authDebugLog('getIdToken(forceRefresh) ★失敗★', { code: err.code, message: err.message });
    }
  }, 20000);
}

function markAuthReload(reason){
  sessionStorage.setItem('pitakoma_auth_reload_reason', reason);
}

export { authDebugLog, installAuthDebug, markAuthReload, wrapSecondaryAuthForDebug };
