import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr } from '../shared/date-utils.js';
import { fbAuth, fbDb, S } from './state.js';
import { debugLog } from './debug.js';
import { renderMyCalendar } from './calendar.js';

function startClassroomSettingsListener(){
  if(S.classroomSettingsTimer) clearInterval(S.classroomSettingsTimer);
  const poll = async ()=>{
    const path = `classroomSettings/${S.myAdminUid}`;
    const uidAtCallTime = fbAuth.currentUser ? fbAuth.currentUser.uid : '(null)';
    debugLog(`[classroomSettings] 呼び出し開始 path=${path} 呼び出し時のcurrentUser.uid=${uidAtCallTime}`);
    try{
      const snap = await fbDb.collection('classroomSettings').doc(S.myAdminUid).get();
      debugLog(`[classroomSettings] 成功 exists=${snap.exists}`);
      if(snap.exists){
        const d = snap.data();
        S.regularClosedDays = d.regularClosedDays || ['日'];
        S.holidayAutoDetect = !!d.holidayAutoDetect;
        S.customClosures = d.customClosures || [];
      }
      renderMyCalendar();
    }catch(err){
      debugLog(`[classroomSettings] ★失敗★ code=${err.code} message=${err.message}`);
      console.error('休校日設定の読み込みエラー:', err);
    }
  };
  poll();
  S.classroomSettingsTimer = setInterval(poll, 10000); // 10秒ごとに再取得（常時監視の代わり）
}
export { startClassroomSettingsListener };
