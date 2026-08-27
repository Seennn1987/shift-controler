import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr } from '../shared/date-utils.js';
import { fbAuth, fbDb, S } from './state.js';
import { debugLog } from './debug.js';
import { startClassroomSettingsListener } from './classroom-settings.js';
import { startScheduleListener,loadMyPendingRequests } from './schedule.js';
import { loadResponseDrafts } from './response-draft.js';
import { mountInlineConfirm, showInlineNotice } from '../shared/inline-confirm.js';
import {
  loadNewAssignments,
  loadPendingCancellationRequests,
  loadAdminCancelledNotices,
  reloadDraftsFromStorage,
  startMyAssignmentsListener,
  initResponseDraftHandlers,
} from './approvals.js';
import { renderMyCalendar } from './calendar.js';
import { startTeacherSubjectsListener, stopTeacherSubjectsListener } from './subject-settings.js';

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
    let text = 'ログインできませんでした。もう一度お試しください。';
    if(err.code==='auth/invalid-email') text = 'メールアドレスの形式が正しくありません。';
    if(err.code==='auth/user-not-found' || err.code==='auth/wrong-password' || err.code==='auth/invalid-credential') text = 'メールアドレスまたはパスワードが正しくありません。';
    msg.textContent = text;
  });
}
document.getElementById('loginBtn').addEventListener('click', handleLogin);
document.getElementById('loginPassword').addEventListener('keydown', (e)=>{ if(e.key==='Enter') handleLogin(); });
document.getElementById('logoutBtn').addEventListener('click', ()=>{
  const logoutBtn = document.getElementById('logoutBtn');
  const uid = fbAuth.currentUser ? fbAuth.currentUser.uid : null;
  const draftCount = uid ? Object.keys(loadResponseDrafts(uid)).length : 0;
  if(draftCount > 0){
    mountInlineConfirm(document.getElementById('appHeader'), logoutBtn, {
      message: `まだ教室長に提出していない内容が${draftCount}件あります。\nこの端末に保存されたままログアウトします。\n\nよろしいですか？`,
      confirmLabel: 'ログアウトする',
      variant: 'danger',
      mountSelector: '.header-account',
      onConfirm: async ()=>{
        fbAuth.signOut();
        return { ok: true };
      },
    });
    return;
  }
  fbAuth.signOut();
});

fbAuth.onAuthStateChanged(async user=>{
  if(user){
    await bootstrap(user);
  }else{
    S.myAdminUid = null; S.myTeacherId = null; S.mySubjects = [];
    stopTeacherSubjectsListener();
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
    await fbAuth.signOut();
    showLogin('教室長に連絡してください。');
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

  const t = new Date();
  if(S.curYear===undefined){ S.curYear = t.getFullYear(); S.curMonth = t.getMonth(); }
  initResponseDraftHandlers();
  startScheduleListener();
  startMyAssignmentsListener();
  startTeacherSubjectsListener();
  await loadMyPendingRequests();
  S.newAssignments = await loadNewAssignments();
  S.pendingCancellationRequests = await loadPendingCancellationRequests();
  S.adminCancelledNotices = await loadAdminCancelledNotices();
  reloadDraftsFromStorage();
  await startClassroomSettingsListener();
}
export { showLogin, handleLogin, bootstrap };
