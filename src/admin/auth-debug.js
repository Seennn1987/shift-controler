/** 教室長画面：ログアウト原因調査用（原因特定後に削除予定） */

const LOG_KEY = 'pitakoma_auth_debug_log';
const MAX_LOG_LINES = 80;
const sessionStartMs = Date.now();
let panelEl = null;
let logListEl = null;

function formatElapsed(){
  const sec = Math.round((Date.now() - sessionStartMs) / 1000);
  return `${sec}s`;
}

function persistLog(line){
  try{
    const prev = JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]');
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
  if(logListEl){
    const row = document.createElement('div');
    row.className = 'auth-debug-line';
    row.textContent = line;
    logListEl.appendChild(row);
    while(logListEl.childElementCount > 12) logListEl.removeChild(logListEl.firstChild);
    logListEl.scrollTop = logListEl.scrollHeight;
  }
}

function ensurePanel(){
  if(panelEl) return;
  panelEl = document.createElement('div');
  panelEl.id = 'authDebugPanel';
  panelEl.innerHTML = `
    <div class="auth-debug-head">
      <strong>ログイン診断</strong>
      <span class="auth-debug-note">原因調査中・関係者以外は無視してください</span>
      <button type="button" id="authDebugCopyBtn">ログをコピー</button>
    </div>
    <div id="authDebugLogList"></div>
  `;
  document.body.appendChild(panelEl);
  logListEl = document.getElementById('authDebugLogList');
  document.getElementById('authDebugCopyBtn').addEventListener('click', ()=>{
    const lines = JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]');
    const text = lines.join('\n');
    navigator.clipboard.writeText(text).then(()=>{
      authDebugLog('ログをクリップボードにコピーしました');
    }).catch(()=>{
      authDebugLog('コピー失敗（コンソールを確認してください）');
    });
  });
}

function restorePreviousSessionLogs(){
  try{
    const prev = JSON.parse(sessionStorage.getItem(LOG_KEY) || '[]');
    if(prev.length === 0) return;
    authDebugLog('前回ページのログを引き継ぎ', `${prev.length}件`);
    prev.slice(-5).forEach(line=>console.log('[ピタコマ Auth 履歴]', line));
  }catch(_e){ /* ignore */ }
}

function patchSignOut(fbAuth, label){
  if(fbAuth.__pitakomaSignOutPatched) return;
  fbAuth.__pitakomaSignOutPatched = true;
  const original = fbAuth.signOut.bind(fbAuth);
  fbAuth.signOut = function patchedSignOut(){
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

function installAuthDebug({ fbAuth, S, getSecondaryAuth }){
  getSecondaryAuthRef = getSecondaryAuth;
  ensurePanel();
  restorePreviousSessionLogs();

  authDebugLog('診断開始', {
    href: location.href,
    hostname: location.hostname,
    appInitialized: S.appInitialized,
  });

  const reloadReason = sessionStorage.getItem('pitakoma_auth_reload_reason');
  if(reloadReason){
    authDebugLog('再読み込み直後', reloadReason);
    sessionStorage.removeItem('pitakoma_auth_reload_reason');
  }

  patchSignOut(fbAuth, '教室長');

  fbAuth.onAuthStateChanged(user=>{
    authDebugLog('onAuthStateChanged', user
      ? { uid: user.uid.slice(0, 8) + '…', email: user.email || '(なし)' }
      : { user: null, appInitialized: S.appInitialized });
  });

  fbAuth.onIdTokenChanged(user=>{
    authDebugLog('onIdTokenChanged（トークン更新など）', user
      ? { uid: user.uid.slice(0, 8) + '…' }
      : { user: null });
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
}

function markAuthReload(reason){
  sessionStorage.setItem('pitakoma_auth_reload_reason', reason);
}

export { authDebugLog, installAuthDebug, markAuthReload, wrapSecondaryAuthForDebug };
