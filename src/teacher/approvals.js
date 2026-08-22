import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr } from '../shared/date-utils.js';
import { fbAuth, fbDb, S } from './state.js';
import { debugLog } from './debug.js';
import { renderMyCalendar } from './calendar.js';

// ---- 新しく決まった授業の承認 ----
 // 承認待ちチケット（assignmentApprovals）
 // 実際の担当授業一覧（teacherAssignments、曜日繰り返し＋単発の代講）

async function loadNewAssignments(){
  const uid = fbAuth.currentUser ? fbAuth.currentUser.uid : null;
  if(!uid) return [];
  try{
    // where は1つだけ（複合索引不要）。pending の絞り込みはクライアント側（教室長画面と同じ方針）
    const snap = await fbDb.collection('assignmentApprovals')
      .where('teacherLoginUid','==',uid).get();
    const list = [];
    snap.forEach(doc=>{
      const data = doc.data();
      if(data.status === 'pending') list.push({id:doc.id, ...data});
    });
    debugLog(`[assignmentApprovals] 成功 pending=${list.length}件`);
    return list;
  }catch(err){
    debugLog(`[assignmentApprovals] ★失敗★ code=${err.code} message=${err.message}`);
    console.error('新しい授業の読み込みエラー:', err);
    return [];
  }
}

// 承認待ちチケットと、実際の担当授業一覧を突き合わせ、該当する授業に承認待ちの目印を付ける
function findPendingTicket(day, slot, subject, studentName, oneTimeDate){
  const slotNum = Number(slot);
  return S.newAssignments.find(a=>
    a.day===day && Number(a.slot)===slotNum && a.subject===subject && a.studentName===studentName &&
    (oneTimeDate ? a.oneTimeDate===oneTimeDate : !a.oneTimeDate)
  );
}

function startMyAssignmentsListener(){
  if(S.myAssignTimer) clearInterval(S.myAssignTimer);
  const docId = `${S.myAdminUid}_${S.myTeacherId}`;
  const ref = fbDb.collection('teacherAssignments').doc(docId);
  const poll = async ()=>{
    const uidAtCallTime = fbAuth.currentUser ? fbAuth.currentUser.uid : '(null)';
    debugLog(`[teacherAssignments] 呼び出し開始 docId=${docId} 呼び出し時のcurrentUser.uid=${uidAtCallTime}`);
    try{
      const snap = await ref.get();
      debugLog(`[teacherAssignments] 成功 exists=${snap.exists}`);
      S.myAssignmentEntries = snap.exists ? (snap.data().entries || []) : [];
      S.newAssignments = await loadNewAssignments();
      renderMyCalendar();
    }catch(err){
      debugLog(`[teacherAssignments] ★失敗★ code=${err.code} message=${err.message}`);
      console.error('担当授業の読み込みエラー:', err);
    }
  };
  poll();
  S.myAssignTimer = setInterval(poll, 10000);
}

async function refreshPendingAndRender(){
  S.newAssignments = await loadNewAssignments();
  renderMyCalendar();
}

async function approveTicket(id){
  try{
    await fbDb.collection('assignmentApprovals').doc(id).update({status:'approved'});
  }catch(err){
    console.error('承認エラー:', err);
    return;
  }
  await refreshPendingAndRender();
}

document.getElementById('approveAllBtn').addEventListener('click', async ()=>{
  const btn = document.getElementById('approveAllBtn');
  btn.disabled = true;
  try{
    for(const a of S.newAssignments){
      await fbDb.collection('assignmentApprovals').doc(a.id).update({status:'approved'});
    }
  }catch(err){
    console.error('一括承認エラー:', err);
  }
  btn.disabled = false;
  await refreshPendingAndRender();
});
export { loadNewAssignments, findPendingTicket, refreshPendingAndRender, approveTicket, startMyAssignmentsListener };
