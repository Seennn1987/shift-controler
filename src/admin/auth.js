import { SUBJECT_MAP, DAYS, SLOTS, WEEKDAY_JP, WEEK_FULL } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr, getTodayStr } from '../shared/date-utils.js';
import { firebaseConfig, fbAuth, fbDb, STORAGE_KEY, getSecondaryAuth, S } from './state.js';
import { init } from './init.js';
import { loadAppStateFromFirestore } from './students-persistence.js';
import { authDebugLog, installAuthDebug, markAuthReload } from './auth-debug.js';

installAuthDebug({ fbAuth, S, getSecondaryAuth });

// ---------- ログイン／認証状態管理 ----------

function showLoginScreen(msg){
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appHeader').style.display = 'none';
  document.getElementById('appRoot').style.display = 'none';
  document.getElementById('loginMsg').textContent = msg || '';
}

async function showAppScreen(user){
  authDebugLog('showAppScreen 開始', { uid: user.uid.slice(0, 8) + '…', appInitialized: S.appInitialized });
  // 教室長UIには「これは教室長のログインか」を確認する仕組みがこれまで無く、
  // 講師専用ログイン（メールアドレス＋パスワード）でもそのままログインできてしまっていた。
  // Firebase Authenticationはログイン情報を教室長・講師で共有しているため、
  // ここで明示的に「講師として登録済みのアカウントではないか」を確認する。
  try{
    const teacherAccSnap = await fbDb.collection('teacherAccounts').doc(user.uid).get();
    if(teacherAccSnap.exists){
      authDebugLog('講師専用アカウントのため教室長画面を拒否');
      document.getElementById('loginLoading').style.display = 'none';
      document.getElementById('loginMsg').textContent = 'このログイン情報は講師専用のものです。教室長としてログインする場合は、教室長用に発行されたアカウントをお使いください。（講師の方は講師専用ページからログインしてください）';
      await fbAuth.signOut();
      return;
    }
    authDebugLog('教室長アカウント確認 OK');
  }catch(err){
    console.error('アカウント種別の確認エラー:', err);
    authDebugLog('教室長アカウント確認エラー', { code: err.code, message: err.message });
    // 確認自体が失敗した場合は、安全側に倒して教室長UIへの進行を止める
    document.getElementById('loginLoading').style.display = 'none';
    document.getElementById('loginMsg').textContent = 'ログイン確認中にエラーが発生しました。時間をおいて再度お試しください。';
    await fbAuth.signOut();
    return;
  }

  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appHeader').style.display = '';
  document.getElementById('appRoot').style.display = '';
  document.getElementById('loginUserEmail').textContent = user.email || '';

  if(!S.appInitialized){
    S.appInitialized = true; // initを待つ前にロックする（onAuthStateChangedが立て続けに複数回発火しても、init()内のイベント登録が二重に走らないようにするため）
    authDebugLog('アプリ初期化開始');
    document.getElementById('loginLoading').style.display = 'block';
    await loadAppStateFromFirestore();
    await init();
    document.getElementById('loginLoading').style.display = 'none';
    authDebugLog('アプリ初期化完了');
  }
}

function handleLogin(){
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const msg = document.getElementById('loginMsg');
  if(!email || !password){ msg.textContent = 'メールアドレスとパスワードを入力してください。'; return; }
  msg.textContent = '';
  document.getElementById('loginLoading').style.display = 'block';
  authDebugLog('ログインボタン押下', { email });
  fbAuth.signInWithEmailAndPassword(email, password)
    .then(cred=>{
      authDebugLog('signInWithEmailAndPassword 成功', { uid: cred.user.uid.slice(0, 8) + '…' });
    })
    .catch(err=>{
      authDebugLog('signInWithEmailAndPassword ★失敗★', { code: err.code, message: err.message });
      document.getElementById('loginLoading').style.display = 'none';
      let text = 'ログインに失敗しました。';
      if(err.code==='auth/invalid-email') text = 'メールアドレスの形式が正しくありません。';
      if(err.code==='auth/user-not-found' || err.code==='auth/wrong-password' || err.code==='auth/invalid-credential') text = 'メールアドレスまたはパスワードが正しくありません。';
      msg.textContent = text;
    });
}

document.getElementById('loginBtn').addEventListener('click', handleLogin);
document.getElementById('loginPassword').addEventListener('keydown', (e)=>{
  if(e.key==='Enter') handleLogin();
});
document.getElementById('logoutBtn').addEventListener('click', ()=>{
  authDebugLog('ログアウトボタンをクリック');
  fbAuth.signOut();
});

fbAuth.onAuthStateChanged(user=>{
  if(user){
    showAppScreen(user);
  }else{
    if(S.appInitialized){
      // 一度初期化済みの状態からログアウトした場合、イベント登録の二重化を避けるためページごと再読み込みする
      authDebugLog('ログイン状態が消えたためページ再読み込み');
      markAuthReload('ログイン状態が消えた → 再読み込み');
      window.location.reload();
      return;
    }
    authDebugLog('未ログイン → ログイン画面表示');
    showLoginScreen();
  }
});

export { showLoginScreen, showAppScreen, handleLogin };
