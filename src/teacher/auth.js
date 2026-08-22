import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr } from '../shared/date-utils.js';
import { fbAuth, fbDb, S } from './state.js';
import { debugLog } from './debug.js';
import { startClassroomSettingsListener } from './classroom-settings.js';
import { startScheduleListener,loadMyPendingRequests } from './schedule.js';
import { loadResponseDrafts } from './response-draft.js';
import {
  loadNewAssignments,
  loadPendingCancellationRequests,
  startMyAssignmentsListener,
  initResponseDraftHandlers,
} from './approvals.js';
import { renderMyCalendar } from './calendar.js';
import { render } from './shift-ui.js';

function showLogin(msg){
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appHeader').style.display = 'none';
  document.getElementById('appRoot').style.display = 'none';
  document.getElementById('loginMsg').textContent = msg || '';
}

function handleLogin(){
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  const msg = document.getElementById('loginMsg');
  if(!email || !password){ msg.textContent = 'メールアドレスとパスワードを入力してください。'; return; }
  msg.textContent = '確認中…';
  fbAuth.signInWithEmailAndPassword(email, password).catch(err=>{
    let text = 'ログインに失敗しました。';
    if(err.code==='auth/invalid-email') text = 'メールアドレスの形式が正しくありません。';
    if(err.code==='auth/user-not-found' || err.code==='auth/wrong-password' || err.code==='auth/invalid-credential') text = 'メールアドレスまたはパスワードが正しくありません。';
    msg.textContent = text;
  });
}
document.getElementById('loginBtn').addEventListener('click', handleLogin);
document.getElementById('loginPassword').addEventListener('keydown', (e)=>{ if(e.key==='Enter') handleLogin(); });
document.getElementById('logoutBtn').addEventListener('click', ()=>{
  const uid = fbAuth.currentUser ? fbAuth.currentUser.uid : null;
  const draftCount = uid ? Object.keys(loadResponseDrafts(uid)).length : 0;
  if(draftCount > 0){
    const ok = window.confirm(
      `未送信の返事が${draftCount}件あります。\nこの端末に保存されたままログアウトします。\n\nよろしいですか？`
    );
    if(!ok) return;
  }
  fbAuth.signOut();
});

fbAuth.onAuthStateChanged(async user=>{
  if(user){
    await bootstrap(user);
  }else{
    S.myAdminUid = null; S.myTeacherId = null;
    showLogin();
  }
});

async function bootstrap(user){
  document.getElementById('loginMsg').textContent = '';
  let accSnap;
  try{
    accSnap = await fbDb.collection('teacherAccounts').doc(user.uid).get();
  }catch(err){
    showLogin('データの読み込みに失敗しました。時間をおいて再度お試しください。');
    return;
  }
  if(!accSnap.exists){
    let adminHint = '';
    try{
      const adminSnap = await fbDb.collection('classroomSettings').doc(user.uid).get();
      if(adminSnap.exists){
        adminHint = '教室長用のアカウントでログインしている可能性があります。教室長ページ（index.html）をお使いください。';
        await fbAuth.signOut();
      }
    }catch(e){
      // 判定に失敗しても、下の一般メッセージを表示する
    }
    console.error('teacherAccounts lookup failed for uid:', user.uid);
    showLogin(adminHint || `このアカウントは講師として登録されていません。教室長に「講師登録」画面でログイン再同期を依頼してください。（確認用ID: ${user.uid.slice(0, 8)}…）`);
    return;
  }
  const d = accSnap.data();
  S.myAdminUid = d.adminUid;
  S.myTeacherId = d.teacherId;
  S.myTeacherName = d.teacherName || '';
  debugLog(`[teacherAccounts] ★成功★ user.uid=${user.uid} → S.myAdminUid=${S.myAdminUid} S.myTeacherId=${S.myTeacherId} S.myTeacherName=${S.myTeacherName}`);

  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('appHeader').style.display = '';
  document.getElementById('appRoot').style.display = '';
  document.getElementById('myNameLabel').textContent = `${S.myTeacherName} さん`;
  document.getElementById('loginUserEmail').textContent = user.email || '';

  const t = new Date();
  if(S.curYear===undefined){ S.curYear = t.getFullYear(); S.curMonth = t.getMonth(); }
  if(S.myCalYear===undefined){ S.myCalYear = t.getFullYear(); S.myCalMonth = t.getMonth(); }
  S.responseDrafts = loadResponseDrafts(user.uid);
  initResponseDraftHandlers();
  startScheduleListener();
  startMyAssignmentsListener();
  startClassroomSettingsListener();
  await loadMyPendingRequests();
  S.newAssignments = await loadNewAssignments();
  S.pendingCancellationRequests = await loadPendingCancellationRequests();
  renderMyCalendar();
  render();
}
export { showLogin, handleLogin, bootstrap };
