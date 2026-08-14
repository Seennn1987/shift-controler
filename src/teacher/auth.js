import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr } from '../shared/date-utils.js';
import { fbAuth, fbDb, S } from './state.js';
import { debugLog } from './debug.js';
import { startClassroomSettingsListener } from './classroom-settings.js';
import { startScheduleListener,loadMyPendingRequests } from './schedule.js';
import { loadNewAssignments,startMyAssignmentsListener } from './approvals.js';
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
document.getElementById('logoutBtn').addEventListener('click', ()=>{ fbAuth.signOut(); });

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
    console.error('teacherAccounts lookup failed for uid:', user.uid);
    showLogin(`このアカウント（ID: ${user.uid}）は講師として登録されていません。教室長にこのIDを伝えてご確認ください。`);
    // ここでは自動サインアウトしない（原因切り分けのため。ログイン画面には戻さず、この状態を維持する）
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
  startScheduleListener(); // 講師スケジュールをリアルタイム監視（教室長側の変更も即座に反映される）
  startMyAssignmentsListener(); // 担当授業一覧（マイカレンダー）をリアルタイム監視
  startClassroomSettingsListener(); // 休校日設定（定休日・祝日・個別休校日）をリアルタイム監視
  await loadMyPendingRequests();
  S.newAssignments = await loadNewAssignments();
  renderMyCalendar();
  render();
}
export { showLogin, handleLogin, bootstrap };
