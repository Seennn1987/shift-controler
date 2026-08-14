import { SUBJECT_MAP, DAYS, SLOTS, WEEKDAY_JP, WEEK_FULL } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr, getTodayStr } from '../shared/date-utils.js';
import { firebaseConfig, fbAuth, fbDb, STORAGE_KEY, getSecondaryAuth, S } from './state.js';
import { getDayStatus, renderCalendar } from './calendar.js';
import { renderMatching } from './matching.js';
import { gradeLabel } from './schedule-core.js';
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
  const payload = { adminUid: user.uid, teacherId, teacherLoginUid: loginUid };
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

// 講師スケジュールのリアルタイム監視（講師本人が講師専用ページから提出・変更した内容も、リロードなしで反映する）
function startTeacherScheduleListener(){
  const user = fbAuth.currentUser;
  if(!user) return;
  if(S.teacherScheduleUnsub) S.teacherScheduleUnsub();
  S.teacherScheduleUnsub = fbDb.collection('teacherSchedules').where('adminUid','==',user.uid)
    .onSnapshot(snap=>{
      const result = [];
      snap.forEach(doc=>{
        const d = doc.data();
        Object.keys(d.months||{}).forEach(ym=>{
          const m = d.months[ym];
          result.push({id:m.id, teacherId:d.teacherId, yearMonth:ym, status:m.status, days:m.days||{}, submittedBy: m.submittedBy || null});
        });
      });
      S.teacherSchedules = result;
      // 現在「講師スケジュール管理」タブを開いている場合は、その場で表示も更新する
      if(document.getElementById('view-teacherSchedule') && document.getElementById('view-teacherSchedule').classList.contains('active')){
        renderTeacherScheduleTab();
        if(S.tsSelectedTeacherId) openTeacherScheduleEditor(S.tsSelectedTeacherId);
      }
    }, err=>{
      console.error('講師スケジュール監視エラー:', err);
    });
}

// ---- 講師の承認をもって「承認待ち」から「確定」に昇格させる ----
// 単発の代講（oneTimeDateあり）は、緊急対応の性質上ここでは対象にしない（teacherSubstitutionsで即時反映済みのため）
async function promotePendingAssignment(ticket, ticketId){
  const idx = S.pendingAssignments.findIndex(p=>{
    if(!(p.teacherId===ticket.teacherId && p.day===ticket.day && p.slot===ticket.slot && p.subject===ticket.subject)) return false;
    const student = S.students.find(s=>s.id===p.studentId);
    return student && student.name===ticket.studentName;
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
  renderMatching();
  renderCalendar();
}

function startApprovalPromotionListener(){
  const user = fbAuth.currentUser;
  if(!user) return;
  if(S.approvalPromotionUnsub) S.approvalPromotionUnsub();
  S.approvalPromotionUnsub = fbDb.collection('assignmentApprovals')
    .where('adminUid','==',user.uid).where('status','==','approved')
    .onSnapshot(snap=>{
      snap.forEach(doc=>{
        const a = doc.data();
        if(a.promoted || a.oneTimeDate) return; // 昇格済み、または単発の代講（対象外）はスキップ
        promotePendingAssignment(a, doc.id);
      });
    }, err=>{
      console.error('承認昇格の監視エラー:', err);
    });
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
async function syncTeacherAssignments(){
  const user = fbAuth.currentUser;
  if(!user || !S.dataReady || !S.studentDataReady) return;
  const loginTeachers = S.teachers.filter(t=>t.loginUid);
  for(const t of loginTeachers){
    // 通常の（曜日繰り返しの）担当授業（確定済み）
    const entries = S.assignments.filter(a=>a.teacherId===t.id).map(a=>{
      const student = S.students.find(s=>s.id===a.studentId);
      return {
        day: a.day, slot: a.slot,
        studentName: student ? student.name : '(削除された生徒)',
        studentGrade: student ? gradeLabel(student) : '',
        subject: a.subject,
        oneTimeDate: null,
      };
    });
    // 承認待ちの授業も、講師のカレンダーに「その日」として表示できるよう含める
    S.pendingAssignments.filter(a=>a.teacherId===t.id).forEach(a=>{
      const student = S.students.find(s=>s.id===a.studentId);
      entries.push({
        day: a.day, slot: a.slot,
        studentName: student ? student.name : '(削除された生徒)',
        studentGrade: student ? gradeLabel(student) : '',
        subject: a.subject,
        oneTimeDate: null,
      });
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
      entries.push({
        day: getDayStatus(sub.date).weekday, slot: sub.slot,
        studentName: student ? student.name : '(削除された生徒)',
        studentGrade: student ? gradeLabel(student) : '',
        subject: original.subject,
        oneTimeDate: sub.date,
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
  await syncClosureSettings(); // 講師側にも休校日設定を同期しておく
  await syncTeacherAssignments(); // 講師のマイカレンダー用データも、ログインのたびに必ず作り直す（過去の同期失敗を自己修復するため）
}


export { loadStudents, saveStudents, getStateDocRef, teacherSchedDocRef, syncTeacherLoginUidEverywhere, saveTeacherScheduleDoc, loadAllTeacherSchedules, startTeacherScheduleListener, promotePendingAssignment, startApprovalPromotionListener, scheduleSyncClosureSettings, syncClosureSettings, scheduleSyncTeacherAssignments, syncTeacherAssignments, scheduleSave, saveAppState, loadAppStateFromFirestore };
