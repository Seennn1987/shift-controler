import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr } from '../shared/date-utils.js';
import { fbAuth, fbDb, S } from './state.js';
import { debugLog } from './debug.js';

function stopScheduleListener(){
  if(S.scheduleTimer){
    clearInterval(S.scheduleTimer);
    S.scheduleTimer = null;
  }
}

function startScheduleListener(){
  if(S.scheduleTimer) clearInterval(S.scheduleTimer);
  const docId = `${S.myAdminUid}_${S.myTeacherId}`;
  const ref = fbDb.collection('teacherSchedules').doc(docId);
  const poll = async ()=>{
    const uidAtCallTime = fbAuth.currentUser ? fbAuth.currentUser.uid : '(null)';
    debugLog(`[teacherSchedules] 呼び出し開始 docId=${docId} 呼び出し時のcurrentUser.uid=${uidAtCallTime} S.myAdminUid=${S.myAdminUid} S.myTeacherId=${S.myTeacherId}`);
    try{
      const snap = await ref.get();
      debugLog(`[teacherSchedules] 成功 exists=${snap.exists}`);
      await loadMyPendingRequests();
      // 直近5秒以内にローカルで編集していた場合、まだサーバー側へ反映しきれていない古いデータで
      // 上書きしてしまう可能性があるため、今回の取得結果の適用を1回スキップする
      if(Date.now() - S.lastLocalScheduleEditAt < 5000){
        debugLog(`[teacherSchedules] 直近の編集があるため、今回の取得結果の適用をスキップしました`);
        const { renderMyCalendar } = await import('./calendar.js');
        renderMyCalendar();
        return;
      }
      S.scheduleDoc = snap.exists ? snap.data() : {months:{}};
      if(!S.scheduleDoc.months) S.scheduleDoc.months = {};
      debugLog(`[teacherSchedules] 取得結果を適用します。表示中の月(${S.curYear}-${pad2(S.curMonth+1)})のサーバー上のdays=${JSON.stringify((S.scheduleDoc.months[`${S.curYear}-${pad2(S.curMonth+1)}`]||{}).days||{})}`);
      const { renderMyCalendar } = await import('./calendar.js');
      renderMyCalendar();
    }catch(err){
      debugLog(`[teacherSchedules] ★失敗★ code=${err.code} message=${err.message}`);
      console.error('スケジュール読み込みエラー:', err);
    }
  };
  poll();
  S.scheduleTimer = setInterval(poll, 10000);
}

 // ローカルで編集した直後は、ポーリングによる古いデータでの上書きを一定時間避けるための記録
async function saveMonthEntry(yearMonth, entry){
  S.scheduleDoc.months = S.scheduleDoc.months || {};
  S.scheduleDoc.months[yearMonth] = entry;
  S.lastLocalScheduleEditAt = Date.now();
  const ref = fbDb.collection('teacherSchedules').doc(`${S.myAdminUid}_${S.myTeacherId}`);
  debugLog(`[保存] 開始 yearMonth=${yearMonth} 内容=${JSON.stringify(entry.days)}`);
  try{
    // 土台となるフィールド（adminUid等）を先に確実に用意する（ドキュメントが万一存在しない場合の保険）
    await ref.set({
      adminUid: S.myAdminUid,
      teacherId: S.myTeacherId,
      teacherLoginUid: fbAuth.currentUser.uid,
    }, {merge:true});
    // ここが本題：ドット記法のキーをネスト構造として正しく解釈させるには、
    // set({merge:true})ではなくupdate()を使う必要がある
    // （set()にドット入りのキーをそのまま渡すと、"months.2026-08"という文字通りの
    //   フィールド名で保存されてしまい、months配下のネスト構造にならないため）
    const monthKey = `months.${yearMonth}`;
    await ref.update({
      [monthKey]: entry,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    debugLog(`[保存] ★成功★ yearMonth=${yearMonth}`);
    return true;
  }catch(err){
    debugLog(`[保存] ★★★失敗★★★ code=${err.code} message=${err.message}`);
    console.error('保存エラー:', err);
    const msg = document.getElementById('formMsg');
    if(msg) msg.textContent = '保存に失敗しました。通信状況をご確認ください。';
    return false;
  }
}

async function loadMyPendingRequests(){
  const uid = fbAuth.currentUser ? fbAuth.currentUser.uid : null;
  if(!uid){ S.pendingRequests = []; return; }
  try{
    const snap = await fbDb.collection('scheduleChangeRequests')
      .where('teacherLoginUid','==',uid).get();
    S.pendingRequests = [];
    snap.forEach(doc=>{
      const data = doc.data();
      if(data.status === 'pending') S.pendingRequests.push({id:doc.id, ...data});
    });
  }catch(err){
    console.error('変更リクエスト読み込みエラー:', err);
    S.pendingRequests = [];
  }
}
export { startScheduleListener, stopScheduleListener, saveMonthEntry, loadMyPendingRequests };
