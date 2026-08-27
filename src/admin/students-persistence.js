import { SUBJECT_MAP, DAYS, SLOTS, WEEKDAY_JP, WEEK_FULL } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr, getTodayStr } from '../shared/date-utils.js';
import { firebaseConfig, fbAuth, fbDb, STORAGE_KEY, getSecondaryAuth, S } from './state.js';
import { getDayStatus, renderCalendar } from './calendar.js';
import { renderMatching } from './matching.js';
import { gradeLabel } from './schedule-core.js';
import { openTeacherScheduleEditor, renderTeacherScheduleTab } from './teacher-schedule-tab.js';
import { collapseTeacherCalendarEntries, formatDualSubjectLabel } from './dual-subject.js';
import { collectMakeupEntriesForTeacher, isTeacherAbsentForStudent, recordTeacherAbsence, studentAbsentDatesForAssignment } from './absences.js';
import { normalizeMatchingPriority } from './matching-config.js';
import { applyGradePromotionsIfNeeded } from './grade-promotion.js';






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
function teacherSubjectsDocRef(teacherId){
  const user = fbAuth.currentUser;
  if(!user) return null;
  return fbDb.collection('teacherSubjects').doc(`${user.uid}_${teacherId}`);
}
function subjectsFingerprint(list){
  return (list || [])
    .map(s=> `${s.level}\t${s.subject}\t${s.preferred ? '1' : '0'}`)
    .sort()
    .join('\n');
}
async function saveTeacherSubjectsDoc(teacher, updatedBy = 'admin'){
  if(!teacher || !teacher.loginUid) return;
  const ref = teacherSubjectsDocRef(teacher.id);
  if(!ref) return;
  try{
    await ref.set({
      adminUid: fbAuth.currentUser.uid,
      teacherId: teacher.id,
      teacherLoginUid: teacher.loginUid,
      subjects: teacher.subjects || [],
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedBy,
    }, { merge: true });
  }catch(err){
    console.error('担当教科の同期エラー:', err);
  }
}
async function syncMissingTeacherSubjects(){
  const user = fbAuth.currentUser;
  if(!user) return;
  try{
    const snap = await fbDb.collection('teacherSubjects').where('adminUid','==',user.uid).get();
    const existing = new Set();
    snap.forEach(doc=> existing.add(doc.data().teacherId));
    for(const teacher of S.teachers){
      if(!teacher.loginUid || existing.has(teacher.id)) continue;
      await saveTeacherSubjectsDoc(teacher, 'admin');
    }
  }catch(err){
    console.error('担当教科の初期同期エラー:', err);
  }
}
function applyTeacherSubjectsQuerySnap(snap){
  let changed = false;
  snap.forEach(doc=>{
    const d = doc.data();
    if(S.editingId && S.editingId === d.teacherId) return;
    const idx = S.teachers.findIndex(t=> t.id === d.teacherId);
    if(idx < 0) return;
    const next = d.subjects || [];
    if(subjectsFingerprint(S.teachers[idx].subjects) === subjectsFingerprint(next)) return;
    S.teachers[idx] = { ...S.teachers[idx], subjects: next };
    changed = true;
  });
  return changed;
}
async function pollTeacherSubjects(){
  const user = fbAuth.currentUser;
  if(!user) return;
  if(Date.now() - (S.lastLocalSubjectEditAt || 0) < 5000) return;
  try{
    const snap = await fbDb.collection('teacherSubjects').where('adminUid','==',user.uid).get();
    const changed = applyTeacherSubjectsQuerySnap(snap);
    if(!changed) return;
    scheduleSave();
    const { renderTeacherList } = await import('./teachers.js');
    renderTeacherList();
    renderMatching();
  }catch(err){
    console.error('担当教科の読み込みエラー:', err);
  }
}
function startTeacherSubjectsListener(){
  const user = fbAuth.currentUser;
  if(!user) return;
  if(S.teacherSubjectsPollTimer) clearInterval(S.teacherSubjectsPollTimer);
  pollTeacherSubjects();
  S.teacherSubjectsPollTimer = setInterval(pollTeacherSubjects, 10000);
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
  try{
    if(teacher) await saveTeacherSubjectsDoc({ ...teacher, loginUid }, 'admin');
  }catch(e){
    console.error('teacherSubjectsの更新エラー:', e);
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
function pendingMatchesTicket(p, ticket){
  if(ticket.studentId){
    if(p.studentId !== ticket.studentId) return false;
  }else{
    const student = S.students.find(s=> s.id === p.studentId);
    if(!student || student.name !== ticket.studentName) return false;
  }
  if(p.teacherId !== ticket.teacherId || p.day !== ticket.day || Number(p.slot) !== Number(ticket.slot)) return false;
  if(ticket.oneTimeDate){
    if(p.oneTimeDate !== ticket.oneTimeDate) return false;
  }else if(p.oneTimeDate){
    return false;
  }
  if(ticket.subjects?.length === 2){
    return ticket.subjects.includes(p.subject);
  }
  return p.subject === ticket.subject;
}

function findStudentForTicket(ticket){
  if(ticket?.studentId){
    const byId = S.students.find(s=> s.id === ticket.studentId);
    if(byId) return byId;
  }
  const named = (S.students || []).filter(s=> s.name === ticket.studentName);
  return named.length === 1 ? named[0] : null;
}

function dropRejectedOneTimeSubstitute(ticket){
  if(!ticket?.oneTimeDate) return;
  const student = findStudentForTicket(ticket);
  S.teacherSubstitutions = (S.teacherSubstitutions || []).filter(s=>{
    if(s.substituteTeacherId !== ticket.teacherId) return true;
    if(s.date !== ticket.oneTimeDate) return true;
    if(Number(s.slot) !== Number(ticket.slot)) return true;
    if(student && s.studentId && s.studentId !== student.id) return true;
    return false;
  });
}

function takePendingMatchingTicket(ticket){
  const indices = S.pendingAssignments
    .map((p, i)=> (pendingMatchesTicket(p, ticket) ? i : -1))
    .filter(i=> i !== -1)
    .sort((a, b)=> b - a);
  return indices.map(i=> S.pendingAssignments.splice(i, 1)[0]);
}

async function promotePendingAssignment(ticket, ticketId){
  const taken = takePendingMatchingTicket(ticket);
  if(taken.length === 0) return;
  S.assignments.push(...taken);
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
  dropRejectedOneTimeSubstitute(ticket);
  const taken = takePendingMatchingTicket(ticket);
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
      if(a.status!=='approved' || a.promoted) return;
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

    if(a.dualGroupId){
      const siblings = S.pendingAssignments.filter(p=>
        p.studentId === a.studentId &&
        p.teacherId === a.teacherId &&
        p.day === a.day &&
        Number(p.slot) === Number(a.slot) &&
        p.dualGroupId === a.dualGroupId
      );
      if(siblings.length >= 2){
        const subjects = siblings.map(p=> p.subject).sort((x, y)=> x.localeCompare(y, 'ja'));
        if(a.subject !== subjects[0]) continue;
        const subjectLabel = formatDualSubjectLabel(subjects, '・');
        const sameStudent = t=> t.studentId ? t.studentId === student.id : t.studentName === student.name;
        const sameOneTime = t=> (t.oneTimeDate || null) === (a.oneTimeDate || null);
        const hasPending = existing.some(t=>
          t.status==='pending' &&
          t.teacherId===a.teacherId &&
          t.day===a.day &&
          Number(t.slot)===Number(a.slot) &&
          sameStudent(t) &&
          sameOneTime(t) &&
          (t.subjects?.length === 2 ? t.subject === subjectLabel : t.subject === subjectLabel)
        );
        if(hasPending) continue;
        try{
          const payload = {
            adminUid: user.uid,
            teacherId: a.teacherId,
            teacherLoginUid: teacher.loginUid,
            studentId: student.id,
            studentName: student.name,
            studentGrade: gradeLabel(student),
            subject: subjectLabel,
            subjects,
            dualGroupId: a.dualGroupId,
            day: a.day,
            slot: a.slot,
            status: 'pending',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            ...(student.courseStartDate ? { courseStartDate: student.courseStartDate } : {}),
            ...(a.oneTimeDate ? { oneTimeDate: a.oneTimeDate } : {}),
          };
          await fbDb.collection('assignmentApprovals').add(payload);
          existing.push(payload);
        }catch(err){
          console.error('承認チケット補完エラー:', err);
        }
        continue;
      }
    }

    const sameStudent = t=> t.studentId ? t.studentId === student.id : t.studentName === student.name;
    const sameOneTime = t=> (t.oneTimeDate || null) === (a.oneTimeDate || null);
    const hasPending = existing.some(t=>
      t.status==='pending' &&
      t.teacherId===a.teacherId &&
      t.day===a.day &&
      Number(t.slot)===Number(a.slot) &&
      t.subject===a.subject &&
      sameStudent(t) &&
      sameOneTime(t)
    );
    if(hasPending) continue;
    try{
      const payload = {
        adminUid: user.uid,
        teacherId: a.teacherId,
        teacherLoginUid: teacher.loginUid,
        studentId: student.id,
        studentName: student.name,
        studentGrade: gradeLabel(student),
        subject: a.subject,
        day: a.day,
        slot: a.slot,
        status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        ...(student.courseStartDate ? { courseStartDate: student.courseStartDate } : {}),
        ...(a.oneTimeDate ? { oneTimeDate: a.oneTimeDate } : {}),
      };
      await fbDb.collection('assignmentApprovals').add(payload);
      existing.push(payload);
    }catch(err){
      console.error('承認チケット補完エラー:', err);
    }
  }
}

// ---- 休校日設定（定休日・祝日判定・個別休校日）を講師にも同期する ----
// 祝日データ（HOLIDAYS_JP）自体は静的データなので、講師専用ページ側にも同じものを複製で持たせている
async function syncClosureSettings(){
  const user = fbAuth.currentUser;
  if(!user){
    return { ok: false, msg: 'ログイン状態を確認できませんでした。' };
  }
  try{
    await fbDb.collection('classroomSettings').doc(user.uid).set({
      regularClosedDays: S.regularClosedDays,
      holidayAutoDetect: S.holidayAutoDetect,
      customClosures: S.customClosures,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    }, {merge:true});
    return { ok: true };
  }catch(err){
    console.error('休校日設定の同期エラー:', err);
    return { ok: false, msg: '講師画面への休校設定の反映に失敗しました。通信状況をご確認ください。' };
  }
}

async function syncClosureSettingsNow({ notify = false } = {}){
  const result = await syncClosureSettings();
  if(notify && !result.ok){
    const msgEl = document.getElementById('closureSyncMsg');
    if(msgEl) msgEl.textContent = result.msg || '講師画面への休校設定の反映に失敗しました。';
  }else if(notify){
    const msgEl = document.getElementById('closureSyncMsg');
    if(msgEl) msgEl.textContent = '';
  }
  return result;
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
  const absentDates = (S.teacherAbsences || [])
    .filter(ta=> isTeacherAbsentForStudent(teacherId, ta.date, a.slot, a.studentId))
    .map(ta=> ta.date);
  const base = {
    day: a.day,
    slot: a.slot,
    studentId: a.studentId || null,
    studentName: student ? student.name : '(削除された生徒)',
    studentGrade: student ? gradeLabel(student) : '',
    subject: a.subject,
    dualGroupId: a.dualGroupId || null,
    approvalStatus,
    isPreferredPair,
    absentDates,
    skippedDates: [...(a.skippedDates || []), ...studentAbsentDatesForAssignment(a)],
    courseStartDate: student?.courseStartDate || null,
  };
  if(a.oneTimeDate){
    if(absentDates.includes(a.oneTimeDate)) return [];
    if(base.skippedDates.includes(a.oneTimeDate)) return [];
    return [{ ...base, oneTimeDate: a.oneTimeDate }];
  }
  // 曜日パターン: シフト提出日に依存せず表示（講師マイカレンダー Phase 0）
  // 表示月の同曜日すべてに calendar.js が e.day === wd で展開する
  return [{ ...base }];
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
    collectMakeupEntriesForTeacher(t.id).forEach(e=> entries.push(e));
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
        studentId: original.studentId || null,
        studentGrade: student ? gradeLabel(student) : '',
        subject: original.subject,
        oneTimeDate: sub.date,
        approvalStatus: 'confirmed',
        isPreferredPair,
      });
    });
    const collapsed = collapseTeacherCalendarEntries(entries);
    const ref = fbDb.collection('teacherAssignments').doc(`${user.uid}_${t.id}`);
    try{
      await ref.set({
        adminUid: user.uid, teacherId: t.id, teacherLoginUid: t.loginUid,
        entries: collapsed, updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
      }, {merge:true});
    }catch(err){
      console.error('講師カレンダー同期エラー:', err);
    }
  }
  await ensureMissingApprovalTickets();
}

function rememberRetiredTeacherLogin(teacher){
  if(!teacher?.loginUid || !teacher?.loginEmail) return;
  const email = String(teacher.loginEmail).trim().toLowerCase();
  S.retiredTeacherLogins = (S.retiredTeacherLogins || []).filter(x=> x.uid !== teacher.loginUid);
  S.retiredTeacherLogins.push({ uid: teacher.loginUid, email });
}

function findRetiredTeacherLogin(email){
  const key = String(email || '').trim().toLowerCase();
  return (S.retiredTeacherLogins || []).find(x=> x.email === key) || null;
}

function dropRetiredTeacherLogin(uid){
  S.retiredTeacherLogins = (S.retiredTeacherLogins || []).filter(x=> x.uid !== uid);
}

async function clearDeletedTeacherCloudDocs(teacher){
  const user = fbAuth.currentUser;
  if(!user || !teacher?.id) return;
  const teacherId = teacher.id;
  try{
    await fbDb.collection('teacherAssignments').doc(`${user.uid}_${teacherId}`).delete();
  }catch(err){
    console.error('削除した講師のカレンダーデータの消去エラー:', err);
  }
  try{
    const schedRef = teacherSchedDocRef(teacherId);
    if(schedRef) await schedRef.delete();
  }catch(err){
    console.error('削除した講師の出勤表データの消去エラー:', err);
  }
  try{
    const subjRef = teacherSubjectsDocRef(teacherId);
    if(subjRef) await subjRef.delete();
  }catch(err){
    console.error('削除した講師の担当教科データの消去エラー:', err);
  }
  if(teacher.loginUid){
    try{
      await fbDb.collection('teacherAccounts').doc(teacher.loginUid).delete();
    }catch(err){
      console.error('削除した講師のログイン紐付けの消去エラー:', err);
    }
  }
}

function resolveCancellationDate(req){
  if(req.dateStr) return req.dateStr;
  if(req.oneTimeDate) return req.oneTimeDate;
  if(!req.day) return null;
  const today = getTodayStr();
  const start = new Date(`${today}T00:00:00`);
  for(let i=0;i<60;i++){
    const d = new Date(start);
    d.setDate(start.getDate()+i);
    const dateStr = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
    if(getDayStatus(dateStr).weekday === req.day) return dateStr;
  }
  return null;
}

function resolveCancellationStudentId(req, dateStr, slot){
  if(req.studentId) return req.studentId;
  const named = (S.students || []).filter(s=> s.name === req.studentName);
  if(named.length === 1) return named[0].id;
  if(named.length === 0) return null;
  const all = S.assignments.concat(S.pendingAssignments || [], S.draftAssignments || []);
  const hit = all.find(a=>
    a.teacherId === req.teacherId &&
    Number(a.slot) === Number(slot) &&
    named.some(s=> s.id === a.studentId) &&
    (!req.day || a.day === req.day)
  );
  return hit?.studentId || named[0].id;
}

async function approveCancellationRequest(req, reqId, opts = {}){
  const dateStr = resolveCancellationDate(req);
  const slot = Number(req.slot);
  if(dateStr){
    if(req.oneTimeDate){
      S.teacherSubstitutions = S.teacherSubstitutions.filter(s=>
        !(s.substituteTeacherId===req.teacherId && s.date===req.oneTimeDate &&
          Number(s.slot)===slot)
      );
    }
    const studentId = resolveCancellationStudentId(req, dateStr, slot);
    recordTeacherAbsence(req.teacherId, dateStr, [slot], studentId || undefined);
  }else{
    console.error('欠勤承認に日付がありません', req);
  }
  try{
    await fbDb.collection('assignmentCancellationRequests').doc(reqId).update({status:'approved'});
  }catch(err){
    console.error('キャンセル承認の更新エラー:', err);
    throw err;
  }
  if(opts.skipRefresh) return;
  scheduleSyncTeacherAssignments();
  scheduleSave();
  renderMatching();
  renderCalendar();
}

async function approveCancellationRequests(requests){
  for(const req of requests){
    await approveCancellationRequest(req, req.id, { skipRefresh: true });
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
    draftAssignments: S.draftAssignments,
    absences: S.absences,
    teacherAbsences: S.teacherAbsences,
    teacherSubstitutions: S.teacherSubstitutions,
    retiredTeacherLogins: S.retiredTeacherLogins || [],
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
    lastGradePromotionYear: S.lastGradePromotionYear,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  };
  try{
    await ref.set(state, {merge:true});
    await syncClosureSettings();
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
    S.draftAssignments = d.draftAssignments || [];
    S.absences = d.absences || [];
    S.teacherAbsences = d.teacherAbsences || [];
    S.teacherSubstitutions = d.teacherSubstitutions || [];
    S.retiredTeacherLogins = d.retiredTeacherLogins || [];
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
    S.matchingPriority = normalizeMatchingPriority(d.matchingPriority || null);
    S.lastGradePromotionYear = d.lastGradePromotionYear != null ? d.lastGradePromotionYear : null;
  }else{
    // 初回ログイン：実運用として空のデータから始める（テスト用サンプルデータは使わない）
    S.teachers = [];
    S.students = [];
    S.assignments = [];
    S.pendingAssignments = [];
    S.draftAssignments = [];
    S.absences = [];
    S.teacherAbsences = [];
    S.teacherSubstitutions = [];
    S.retiredTeacherLogins = [];
    S.terms = [];
    S.customClosures = [];
    S.preferredPairs = [];
    S.holidayAutoDetect = false;
    S.lastGradePromotionYear = null;
  }
  S.teacherSchedules = await loadAllTeacherSchedules();

  startTeacherScheduleListener(); // 以降は講師本人による変更もリアルタイムで反映する
  startApprovalPromotionListener(); // 講師が承認したら、承認待ち→確定へ自動的に昇格させる
  S.dataReady = true;
  S.studentDataReady = true;
  S.firestoreReady = true;

  const promo = await applyGradePromotionsIfNeeded();
  if(promo.didWrite) await saveAppState();

  await syncClosureSettings(); // 講師側にも休校日設定を同期しておく
  await syncTeacherAssignments(); // 講師のマイカレンダー用データも、ログインのたびに必ず作り直す（過去の同期失敗を自己修復するため）
  await pollTeacherSubjects();
  startTeacherSubjectsListener();
  await syncMissingTeacherSubjects();
}


export { loadStudents, saveStudents, getStateDocRef, teacherSchedDocRef, syncTeacherLoginUidEverywhere, saveTeacherScheduleDoc, loadAllTeacherSchedules, startTeacherScheduleListener, promotePendingAssignment, startApprovalPromotionListener, syncClosureSettings, syncClosureSettingsNow, scheduleSyncTeacherAssignments, syncTeacherAssignments, scheduleSave, saveAppState, loadAppStateFromFirestore, approveCancellationRequest, approveCancellationRequests, rejectCancellationRequest, saveTeacherSubjectsDoc, startTeacherSubjectsListener, clearDeletedTeacherCloudDocs, rememberRetiredTeacherLogin, findRetiredTeacherLogin, dropRetiredTeacherLogin };
