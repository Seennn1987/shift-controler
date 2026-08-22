import { SUBJECT_MAP, DAYS, SLOTS, WEEKDAY_JP, WEEK_FULL } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr, getTodayStr } from '../shared/date-utils.js';
import { firebaseConfig, fbAuth, fbDb, STORAGE_KEY, getSecondaryAuth, S } from './state.js';
import { getDayStatus, renderCalendar } from './calendar.js';
import { renderMatching } from './matching.js';
import { gradeLabel, buildMonthDaysFromBaseAvailability, getOrCreateDraftSchedule } from './schedule-core.js';
import { openTeacherScheduleEditor, renderTeacherScheduleTab } from './teacher-schedule-tab.js';






async function loadStudents(){
  // 実データはloadAppStateFromFirestore()で読み込み済み。ここではフラグだけ立てる
  S.studentDataReady = true;
}
async function saveStudents(){
  scheduleSave();
  return true;
}

// ---- 割当確定・定員管理（Firestoreで永続化） ----

// ---- 収支管理：学年別の1コマあたり授業料（教室共通設定） ----


function getStateDocRef(){
  const user = fbAuth.currentUser;
  if(!user) return null;
  return fbDb.collection('appState').doc(user.uid);
}

// 講師スケジュールは教室長の巨大なデータとは別のコレクションに保存する（講師本人が自分の分だけ読み書きできるようにするため）
function teacherSchedDocRef(teacherId){
  const user = fbAuth.currentUser;
  if(!user) return null;
  return fbDb.collection('teacherSchedules').doc(`${user.uid}_${teacherId}`);
}
// 講師のログインIDを、紐づく全てのドキュメント（S.teacherSchedules・teacherAssignments）に一括で反映する
// （どちらか一方だけ更新すると、もう一方が古いままになり権限エラーの原因になるため、必ずこの関数を通す）
async function syncTeacherLoginUidEverywhere(teacherId, loginUid){
  const user = fbAuth.currentUser;
  if(!user) return;
  const teacher = S.teachers.find(t=>t.id===teacherId);
  const payload = { adminUid: user.uid, teacherId, teacherLoginUid: loginUid };
  try{
    await fbDb.collection('teacherAccounts').doc(loginUid).set({
      adminUid: user.uid,
      teacherId,
      teacherName: teacher ? teacher.name : '',
    }, {merge:true});
  }catch(e){
    console.error('teacherAccountsの更新エラー:', e);
  }
  try{
    const schedRef = teacherSchedDocRef(teacherId);
    if(schedRef) await schedRef.set(payload, {merge:true});
  }catch(e){
    console.error('teacherSchedulesのteacherLoginUid更新エラー:', e);
  }
  try{
    const assignRef = fbDb.collection('teacherAssignments').doc(`${user.uid}_${teacherId}`);
    await assignRef.set(payload, {merge:true});
  }catch(e){
    console.error('teacherAssignmentsのteacherLoginUid更新エラー:', e);
  }
  // 念のため、担当授業一覧そのものも今の状態で作り直しておく
  await syncTeacherAssignments();
}
async function saveTeacherScheduleDoc(sch){
  if(!sch.id){
    // 最終防御：ここまでにidが付与されていなければ、保存直前に必ず補完する（Firestoreはundefinedを保存できないため）
    sch.id = 'tsch-'+Date.now()+'-'+Math.random().toString(36).slice(2,6);
  }
  const teacher = S.teachers.find(t=>t.id===sch.teacherId);
  const ref = teacherSchedDocRef(sch.teacherId);
  if(!ref) return;
  try{
    // まず土台となるフィールド（adminUid等）をドキュメントが無くても作れるよう用意する
    await ref.set({
      adminUid: fbAuth.currentUser.uid,
      teacherId: sch.teacherId,
      teacherLoginUid: teacher ? (teacher.loginUid || null) : null,
    }, {merge:true});
    // ここが本題：ドット記法のキーをmonths配下のネスト構造として正しく書き込むには、
    // set({merge:true})ではなくupdate()を使う必要がある
    // （set()にドット入りのキーをそのまま渡すと、"months.2026-08"という文字通りの
    //   フィールド名で保存されてしまい、months配下のネスト構造にならないため）
    const monthKey = `months.${sch.yearMonth}`;
    await ref.update({
      [monthKey]: {id:sch.id, status:sch.status, days:sch.days, submittedBy: sch.submittedBy || null},
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }catch(err){
    console.error('講師スケジュール保存エラー:', err);
  }
}
async function loadAllTeacherSchedules(){
  const user = fbAuth.currentUser;
  if(!user) return [];
  try{
    const snap = await fbDb.collection('teacherSchedules').where('adminUid','==',user.uid).get();
    const result = [];
    snap.forEach(doc=>{
      const d = doc.data();
      Object.keys(d.months||{}).forEach(ym=>{
        const m = d.months[ym];
        result.push({id:m.id, teacherId:d.teacherId, yearMonth:ym, status:m.status, days:m.days||{}, submittedBy: m.submittedBy || null});
      });
    });
    return result;
  }catch(err){
    console.error('講師スケジュール読み込みエラー:', err);
    return [];
  }
}

// 講師スケジュールの定期取得（講師本人が講師専用ページから提出・変更した内容も反映する）
// ※公開ページでは onSnapshot が permission denied になり、ログイン状態不安定の一因になるため .get() ポーリングを使う（講師画面と同様）
function applyTeacherSchedulesQuerySnap(snap){
  const result = [];
  snap.forEach(doc=>{
    const d = doc.data();
    Object.keys(d.months||{}).forEach(ym=>{
      const m = d.months[ym];
      result.push({id:m.id, teacherId:d.teacherId, yearMonth:ym, status:m.status, days:m.days||{}, submittedBy: m.submittedBy || null});
    });
  });
  S.teacherSchedules = result;
  if(document.getElementById('view-teacherSchedule') && document.getElementById('view-teacherSchedule').classList.contains('active')){
    renderTeacherScheduleTab();
    if(S.tsSelectedTeacherId) openTeacherScheduleEditor(S.tsSelectedTeacherId);
  }
}

async function pollTeacherSchedules(){
  const user = fbAuth.currentUser;
  if(!user) return;
  try{
    const snap = await fbDb.collection('teacherSchedules').where('adminUid','==',user.uid).get();
    applyTeacherSchedulesQuerySnap(snap);
  }catch(err){
    console.error('講師スケジュール読み込みエラー:', err);
  }
}

function startTeacherScheduleListener(){
  const user = fbAuth.currentUser;
  if(!user) return;
  if(S.teacherSchedulePollTimer) clearInterval(S.teacherSchedulePollTimer);
  pollTeacherSchedules();
  S.teacherSchedulePollTimer = setInterval(pollTeacherSchedules, 10000);
}

// ---- 講師の承認をもって「承認待ち」から「確定」に昇格させる ----
// 単発の代講（oneTimeDateあり）は、緊急対応の性質上ここでは対象にしない（teacherSubstitutionsで即時反映済みのため）
async function promotePendingAssignment(ticket, ticketId){
  const idx = S.pendingAssignments.findIndex(p=>{
    if(!(p.teacherId===ticket.teacherId && p.day===ticket.day && Number(p.slot)===Number(ticket.slot) && p.subject===ticket.subject)) return false;
    const student = S.students.find(s=>s.id===p.studentId);
    if(!student || student.name!==ticket.studentName) return false;
    if(ticket.oneTimeDate) return p.oneTimeDate === ticket.oneTimeDate;
    return !p.oneTimeDate;
  });
  if(idx===-1) return; // 既に処理済み、または対応する承認待ちが見つからない
  const entry = S.pendingAssignments[idx];
  S.pendingAssignments.splice(idx, 1);
  S.assignments.push(entry);
  try{
    await fbDb.collection('assignmentApprovals').doc(ticketId).update({promoted:true});
  }catch(e){
    console.error('チケットの昇格フラグ更新エラー:', e);
  }
  scheduleSyncTeacherAssignments();
  scheduleSave();
  renderMatching();
  renderCalendar();
}

async function rejectPendingAssignment(ticket, ticketId){
  const idx = S.pendingAssignments.findIndex(p=>{
    if(!(p.teacherId===ticket.teacherId && p.day===ticket.day && Number(p.slot)===Number(ticket.slot) && p.subject===ticket.subject)) return false;
    const student = S.students.find(s=>s.id===p.studentId);
    if(!student || student.name!==ticket.studentName) return false;
    if(ticket.oneTimeDate) return p.oneTimeDate === ticket.oneTimeDate;
    return !p.oneTimeDate;
  });
  if(idx===-1){
    try{
      await fbDb.collection('assignmentApprovals').doc(ticketId).update({handled:true});
    }catch(e){
      console.error('チケットの処理済みフラグ更新エラー:', e);
    }
    return;
  }
  S.pendingAssignments.splice(idx, 1);
  try{
    await fbDb.collection('assignmentApprovals').doc(ticketId).update({handled:true});
  }catch(e){
    console.error('チケットの処理済みフラグ更新エラー:', e);
  }
  scheduleSyncTeacherAssignments();
  scheduleSave();
  renderMatching();
  renderCalendar();
}

async function pollApprovalPromotions(){
  const user = fbAuth.currentUser;
  if(!user) return;
  try{
    const snap = await fbDb.collection('assignmentApprovals')
      .where('adminUid','==',user.uid).get();
    snap.forEach(doc=>{
      const a = doc.data();
      if(a.status!=='approved' || a.promoted || a.oneTimeDate) return;
      promotePendingAssignment(a, doc.id);
    });
  }catch(err){
    console.error('承認昇格の読み込みエラー:', err);
  }
}

async function pollApprovalRejections(){
  const user = fbAuth.currentUser;
  if(!user) return;
  try{
    const snap = await fbDb.collection('assignmentApprovals')
      .where('adminUid','==',user.uid).get();
    snap.forEach(doc=>{
      const a = doc.data();
      if(a.status!=='rejected' || a.handled) return;
      rejectPendingAssignment(a, doc.id);
    });
  }catch(err){
    console.error('承認拒否の読み込みエラー:', err);
  }
}

function startApprovalPromotionListener(){
  const user = fbAuth.currentUser;
  if(!user) return;
  if(S.approvalPromotionPollTimer) clearInterval(S.approvalPromotionPollTimer);
  pollApprovalPromotions();
  pollApprovalRejections();
  S.approvalPromotionPollTimer = setInterval(()=>{
    pollApprovalPromotions();
    pollApprovalRejections();
  }, 10000);
}

// pendingAssignments に対応する承認チケットが無ければ補完する（過去データの取りこぼし修復）
async function ensureMissingApprovalTickets(){
  const user = fbAuth.currentUser;
  if(!user) return;
  let existing = [];
  try{
    const snap = await fbDb.collection('assignmentApprovals').where('adminUid','==',user.uid).get();
    snap.forEach(doc=> existing.push(doc.data()));
  }catch(err){
    console.error('承認チケット一覧の読み込みエラー:', err);
    return;
  }
  for(const a of S.pendingAssignments){
    const teacher = S.teachers.find(t=>t.id===a.teacherId);
    if(!teacher || !teacher.loginUid) continue;
    const student = S.students.find(s=>s.id===a.studentId);
    if(!student) continue;
    const hasPending = existing.some(t=>
      t.status==='pending' &&
      t.teacherId===a.teacherId &&
      t.day===a.day &&
      Number(t.slot)===Number(a.slot) &&
      t.subject===a.subject &&
      t.studentName===student.name
    );
    if(hasPending) continue;
    try{
      await fbDb.collection('assignmentApprovals').add({
        adminUid: user.uid,
        teacherId: a.teacherId,
        teacherLoginUid: teacher.loginUid,
        studentName: student.name,
        studentGrade: gradeLabel(student),
        subject: a.subject,
        day: a.day,
        slot: a.slot,
        status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
    }catch(err){
      console.error('承認チケット補完エラー:', err);
    }
  }
}

// ---- 休校日設定（定休日・祝日判定・個別休校日）を講師にも同期する ----
// 祝日データ（HOLIDAYS_JP）自体は静的データなので、講師専用ページ側にも同じものを複製で持たせている
function scheduleSyncClosureSettings(){
  if(S.syncClosureSettingsTimer) clearTimeout(S.syncClosureSettingsTimer);
  S.syncClosureSettingsTimer = setTimeout(syncClosureSettings, 1200);
}
async function syncClosureSettings(){
  const user = fbAuth.currentUser;
  if(!user) return;
  try{
    await fbDb.collection('classroomSettings').doc(user.uid).set({
      regularClosedDays: S.regularClosedDays,
      holidayAutoDetect: S.holidayAutoDetect,
      customClosures: S.customClosures,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, {merge:true});
  }catch(err){
    console.error('休校日設定の同期エラー:', err);
  }
}

// ---- 講師本人が「マイカレンダー」で見るための、担当授業一覧の同期 ----
// （生徒個人情報を含む S.assignments 全体は講師には見せず、その講師自身が担当する分だけを抜き出して渡す）
function scheduleSyncTeacherAssignments(){
  if(S.syncTeacherAssignmentsTimer) clearTimeout(S.syncTeacherAssignmentsTimer);
  S.syncTeacherAssignmentsTimer = setTimeout(syncTeacherAssignments, 1200);
}
function expandAssignmentForTeacherCalendar(a, approvalStatus, teacherId){
  const student = S.students.find(s=>s.id===a.studentId);
  const isPreferredPair = S.preferredPairs.some(p=>
    p.studentId===a.studentId && p.courseId===a.courseId && p.teacherId===teacherId
  );
  const base = {
    day: a.day,
    slot: a.slot,
    studentName: student ? student.name : '(削除された生徒)',
    studentGrade: student ? gradeLabel(student) : '',
    subject: a.subject,
    approvalStatus,
    isPreferredPair,
  };
  if(a.oneTimeDate){
    return [{ ...base, oneTimeDate: a.oneTimeDate }];
  }
  const out = [];
  S.teacherSchedules.filter(s=>s.teacherId===a.teacherId && s.status==='submitted').forEach(sch=>{
    Object.keys(sch.days || {}).forEach(dateStr=>{
      const wd = WEEKDAY_JP[new Date(dateStr+'T00:00:00').getDay()];
      if(wd !== a.day) return;
      if(!(sch.days[dateStr]||[]).some(e=>Number(e.slot)===Number(a.slot))) return;
      out.push({ ...base, oneTimeDate: dateStr });
    });
  });
  return out;
}

async function syncTeacherAssignments(){
  const user = fbAuth.currentUser;
  if(!user || !S.dataReady || !S.studentDataReady) return;
  const loginTeachers = S.teachers.filter(t=>t.loginUid);
  for(const t of loginTeachers){
    const entries = [];
    S.assignments.filter(a=>a.teacherId===t.id).forEach(a=>{
      expandAssignmentForTeacherCalendar(a, 'confirmed', t.id).forEach(e=> entries.push(e));
    });
    S.pendingAssignments.filter(a=>a.teacherId===t.id).forEach(a=>{
      expandAssignmentForTeacherCalendar(a, 'pending', t.id).forEach(e=> entries.push(e));
    });
    // この講師が「代講」として単発で担当する授業（該当日だけの特別枠）
    S.teacherSubstitutions.forEach(sub=>{
      if(sub.substituteTeacherId!==t.id) return;
      const original = S.assignments.find(a=>
        a.teacherId===sub.teacherId && a.day===getDayStatus(sub.date).weekday && a.slot===sub.slot &&
        (!sub.studentId || a.studentId===sub.studentId)
      );
      if(!original) return;
      const student = S.students.find(s=>s.id===original.studentId);
      const isPreferredPair = S.preferredPairs.some(p=>
        p.studentId===original.studentId && p.courseId===original.courseId && p.teacherId===t.id
      );
      entries.push({
        day: getDayStatus(sub.date).weekday, slot: sub.slot,
        studentName: student ? student.name : '(削除された生徒)',
        studentGrade: student ? gradeLabel(student) : '',
        subject: original.subject,
        oneTimeDate: sub.date,
        approvalStatus: 'confirmed',
        isPreferredPair,
      });
    });
    const ref = fbDb.collection('teacherAssignments').doc(`${user.uid}_${t.id}`);
    try{
      await ref.set({
        adminUid: user.uid, teacherId: t.id, teacherLoginUid: t.loginUid,
        entries, updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, {merge:true});
    }catch(err){
      console.error('講師カレンダー同期エラー:', err);
    }
  }
  await ensureMissingApprovalTickets();
}

async function approveCancellationRequest(req, reqId){
  if(req.oneTimeDate){
    S.teacherSubstitutions = S.teacherSubstitutions.filter(s=>
      !(s.substituteTeacherId===req.teacherId && s.date===req.oneTimeDate &&
        Number(s.slot)===Number(req.slot))
    );
  }else{
    const idx = S.assignments.findIndex(a=>{
      if(a.teacherId!==req.teacherId) return false;
      if(a.day!==req.day) return false;
      if(Number(a.slot)!==Number(req.slot)) return false;
      if(a.subject!==req.subject) return false;
      const student = S.students.find(s=>s.id===a.studentId);
      return student && student.name===req.studentName;
    });
    if(idx!==-1) S.assignments.splice(idx, 1);
  }
  try{
    await fbDb.collection('assignmentCancellationRequests').doc(reqId).update({status:'approved'});
  }catch(err){
    console.error('キャンセル承認の更新エラー:', err);
    throw err;
  }
  scheduleSyncTeacherAssignments();
  scheduleSave();
  renderMatching();
  renderCalendar();
}

async function rejectCancellationRequest(reqId){
  try{
    await fbDb.collection('assignmentCancellationRequests').doc(reqId).update({status:'rejected'});
  }catch(err){
    console.error('キャンセル却下の更新エラー:', err);
    throw err;
  }
}


// 全データを1つのドキュメントにまとめてFirestoreへ保存する（呼び出しが重ならないよう1.2秒デバウンス）
// ※teacherSchedulesは別コレクション（S.teacherSchedules）で管理するため、ここには含めない
function scheduleSave(){
  if(!S.firestoreReady) return; // 初回ロードが終わるまでは保存しない（空データで上書きするのを防ぐ）
  if(S.saveTimer) clearTimeout(S.saveTimer);
  S.saveTimer = setTimeout(saveAppState, 1200);
}

async function saveAppState(){
  const ref = getStateDocRef();
  if(!ref) return;
  const state = {
    teachers: S.teachers,
    students: S.students,
    assignments: S.assignments,
    pendingAssignments: S.pendingAssignments,
    absences: S.absences,
    teacherAbsences: S.teacherAbsences,
    teacherSubstitutions: S.teacherSubstitutions,
    terms: S.terms,
    customClosures: S.customClosures,
    preferredPairs: S.preferredPairs,
    tuitionRates: S.tuitionRates,
    regularClosedDays: S.regularClosedDays,
    holidayAutoDetect: S.holidayAutoDetect,
    roomCapacity: S.roomCapacity,
    teacherCapacity: S.teacherCapacity,
    finGradientMin: S.finGradientMin,
    finGradientMax: S.finGradientMax,
    matchingPriority: S.matchingPriority,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  try{
    await ref.set(state, {merge:true});
  }catch(err){
    console.error('Firestore保存エラー:', err);
  }
}

// ログイン後、Firestoreから全データを読み込む（初回ログイン時はドキュメントが無いので空データで初期化する）
async function loadAppStateFromFirestore(){
  const ref = getStateDocRef();
  if(!ref) return;
  const snap = await ref.get();
  if(snap.exists){
    const d = snap.data();
    S.teachers = d.teachers || [];
    S.students = d.students || [];
    S.assignments = d.assignments || [];
    S.pendingAssignments = d.pendingAssignments || [];
    S.absences = d.absences || [];
    S.teacherAbsences = d.teacherAbsences || [];
    S.teacherSubstitutions = d.teacherSubstitutions || [];
    S.terms = d.terms || [];
    S.customClosures = d.customClosures || [];
    S.preferredPairs = d.preferredPairs || [];
    S.tuitionRates = d.tuitionRates || {'小学':2900, '中学':3900, '高校':5200};
    S.regularClosedDays = d.regularClosedDays || ['日'];
    S.holidayAutoDetect = !!d.holidayAutoDetect;
    S.roomCapacity = d.roomCapacity || 12;
    S.teacherCapacity = d.teacherCapacity || 2;
    S.finGradientMin = (d.finGradientMin!=null) ? d.finGradientMin : 25;
    S.finGradientMax = (d.finGradientMax!=null) ? d.finGradientMax : 60;
    S.matchingPriority = d.matchingPriority || null;
  }else{
    // 初回ログイン：実運用として空のデータから始める（テスト用サンプルデータは使わない）
    S.teachers = [];
    S.students = [];
    S.assignments = [];
    S.pendingAssignments = [];
    S.absences = [];
    S.teacherAbsences = [];
    S.teacherSubstitutions = [];
    S.terms = [];
    S.customClosures = [];
    S.preferredPairs = [];
    S.holidayAutoDetect = false;
  }
  S.teacherSchedules = await loadAllTeacherSchedules();
  startTeacherScheduleListener(); // 以降は講師本人による変更もリアルタイムで反映する
  startApprovalPromotionListener(); // 講師が承認したら、承認待ち→確定へ自動的に昇格させる
  S.dataReady = true;
  S.studentDataReady = true;
  S.firestoreReady = true;

  // 一度だけ：古い授業マッチデータをすべて削除（2026-08-14）
  const MATCHING_RESET_KEY = 'pitakoma_clear_all_matching_v1';
  let matchingWasCleared = false;
  if(typeof localStorage !== 'undefined' && localStorage.getItem(MATCHING_RESET_KEY) !== 'done'){
    S.assignments = [];
    S.pendingAssignments = [];
    localStorage.setItem(MATCHING_RESET_KEY, 'done');
    matchingWasCleared = true;
    await saveAppState();
  }

  // 一度だけ：担当組み・欠席・代講・承認チケットをすべて削除（日付ベース修正後のリセット）
  const MATCHING_RESET_V2_KEY = 'pitakoma_clear_all_matching_v2';
  let matchingV2WasCleared = false;
  if(typeof localStorage !== 'undefined' && localStorage.getItem(MATCHING_RESET_V2_KEY) !== 'done'){
    clearMatchingStateInMemory();
    localStorage.setItem(MATCHING_RESET_V2_KEY, 'done');
    matchingV2WasCleared = true;
  }

  if(matchingV2WasCleared){
    const user = fbAuth.currentUser;
    if(user) await deleteAdminMatchingFirestore(user.uid);
    await saveAppState();
    console.info('[ピタコマ] 授業マッチデータをすべて削除しました（担当・欠席・代講・承認待ち）。');
  }

  await syncClosureSettings(); // 講師側にも休校日設定を同期しておく
  await syncTeacherAssignments(); // 講師のマイカレンダー用データも、ログインのたびに必ず作り直す（過去の同期失敗を自己修復するため）
  if(matchingWasCleared){
    console.info('[ピタコマ] 授業マッチデータをすべて削除しました。');
  }

  // 一度だけ：各講師の基本スケジュールから2026年8月の提出済みスケジュールを登録
  const AUG_SCHEDULE_SEED_KEY = 'pitakoma_seed_aug2026_from_base_v1';
  if(typeof localStorage !== 'undefined' && localStorage.getItem(AUG_SCHEDULE_SEED_KEY) !== 'done'){
    const seedResult = await seedTeacherMonthSchedulesFromBase('2026-08');
    localStorage.setItem(AUG_SCHEDULE_SEED_KEY, 'done');
    console.info('[ピタコマ] 8月の講師スケジュールを基本スケジュールから登録しました。', seedResult);
  }
}


async function seedTeacherMonthSchedulesFromBase(yearMonth){
  const result = { yearMonth, saved: [], skipped: [], noBase: [] };
  for(const teacher of S.teachers){
    const base = teacher.baseAvailability || [];
    if(base.length === 0){
      result.noBase.push(teacher.name || teacher.id);
      continue;
    }
    const schedule = getOrCreateDraftSchedule(teacher.id, yearMonth);
    schedule.days = buildMonthDaysFromBaseAvailability(teacher, yearMonth);
    if(Object.keys(schedule.days).length === 0){
      result.skipped.push(teacher.name || teacher.id);
      continue;
    }
    schedule.status = 'submitted';
    schedule.submittedBy = 'admin';
    await saveTeacherScheduleDoc(schedule);
    result.saved.push(teacher.name || teacher.id);
  }
  return result;
}


async function deleteFirestoreDocsByAdminUid(collectionName, adminUid){
  try{
    const snap = await fbDb.collection(collectionName).where('adminUid', '==', adminUid).get();
    if(snap.empty) return 0;
    const batch = fbDb.batch();
    snap.forEach(doc=> batch.delete(doc.ref));
    await batch.commit();
    return snap.size;
  }catch(err){
    console.error(`${collectionName}削除エラー:`, err);
    return 0;
  }
}

async function deleteAdminMatchingFirestore(adminUid){
  await deleteFirestoreDocsByAdminUid('assignmentApprovals', adminUid);
  await deleteFirestoreDocsByAdminUid('assignmentCancellationRequests', adminUid);
}

function clearMatchingStateInMemory(){
  S.assignments = [];
  S.pendingAssignments = [];
  S.absences = [];
  S.teacherAbsences = [];
  S.teacherSubstitutions = [];
}

async function clearAllMatchingData(){
  clearMatchingStateInMemory();
  const user = fbAuth.currentUser;
  if(user) await deleteAdminMatchingFirestore(user.uid);
  if(!S.firestoreReady) return;
  await saveAppState();
  await syncTeacherAssignments();
}


export { loadStudents, saveStudents, getStateDocRef, teacherSchedDocRef, syncTeacherLoginUidEverywhere, saveTeacherScheduleDoc, loadAllTeacherSchedules, startTeacherScheduleListener, promotePendingAssignment, startApprovalPromotionListener, scheduleSyncClosureSettings, syncClosureSettings, scheduleSyncTeacherAssignments, syncTeacherAssignments, scheduleSave, saveAppState, loadAppStateFromFirestore, clearAllMatchingData, seedTeacherMonthSchedulesFromBase, approveCancellationRequest, rejectCancellationRequest };
