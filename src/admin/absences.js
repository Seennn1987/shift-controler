import { SUBJECT_MAP, DAYS, SLOTS, WEEKDAY_JP, WEEK_FULL } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr, getTodayStr } from '../shared/date-utils.js';
import { firebaseConfig, fbAuth, fbDb, STORAGE_KEY, getSecondaryAuth, S } from './state.js';
import { getDayStatus } from './calendar.js';
import { getDateSlotState, isTeacherAvailableOnDate } from './schedule-core.js';
import { assignmentAppliesOnDate, findEffectiveAssignment, isAssignmentEffectiveInMonth, isPreferredSubjectForTeacher, issueAssignmentApproval } from './teacher-schedule-tab.js';

// ---- 欠席・振替（特定の実日付にのみ影響。曜日パターン自体は変えない） ----
// {id, studentId, courseId, subject, day, slot, date, status:'pending'|'resolved', makeup:null|{date,slot,teacherId}}
// ---- 講師の欠勤・代講（単発の急な欠勤専用。継続的な予定変更は講師本人の月次スケジュール編集で対応する） ----
// {id, teacherId, date, slots:[4,6], note} 欠勤登録そのもの（取り消し・監査用）
// {id, teacherId, date, slot, substituteTeacherId} その日その枠だけ、代講講師が担当する記録（曜日パターン自体は変えない）

function findAbsenceFor(studentId, courseId, dateStr, day, slot){
  return S.absences.find(ab=> ab.studentId===studentId && ab.courseId===courseId && ab.date===dateStr && ab.day===day && ab.slot===slot) || null;
}
function recordAbsence(studentId, courseId, subject, day, slot, dateStr){
  if(findAbsenceFor(studentId, courseId, dateStr, day, slot)) return;
  S.absences.push({
    id:'abs-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),
    studentId, courseId, subject, day, slot, date:dateStr, status:'pending', makeup:null
  });
}
function cancelAbsenceRecord(id){
  S.absences = S.absences.filter(a=>a.id!==id);
}
function cancelMakeup(id){
  const ab = S.absences.find(a=>a.id===id);
  if(!ab) return;
  ab.makeup = null;
  ab.status = 'pending';
}
// 振替を探さず、欠席のみで対応を終える（未振替の集計からは外れる）
function markNoMakeup(id){
  const ab = S.absences.find(a=>a.id===id);
  if(!ab) return;
  ab.status = 'no-makeup';
}

// ---- 講師の欠勤・代講 ----
// 指定講師・指定日の、確定授業を「コマ→その枠にいる生徒たち」の形でまとめて返す（代講対象が未確定の生の状態、代講適用前）
function getTeacherLessonsOnDate(teacherId, dateStr){
  const status = getDayStatus(dateStr);
  if(status.type!=='open') return {};
  const weekday = status.weekday;
  const yearMonth = dateStr.slice(0,7);
  const bySlot = {};
  S.assignments.forEach(a=>{
    if(a.teacherId!==teacherId || a.day!==weekday) return;
    if(!isAssignmentEffectiveInMonth(a, yearMonth)) return;
    if(findAbsenceFor(a.studentId, a.courseId, dateStr, a.day, a.slot)) return; // 既に生徒都合で欠席済みの分は対象外
    bySlot[a.slot] = bySlot[a.slot] || [];
    bySlot[a.slot].push({studentId:a.studentId, courseId:a.courseId, subject:a.subject});
  });
  return bySlot;
}

function findTeacherAbsence(teacherId, dateStr){
  return S.teacherAbsences.find(ta=>ta.teacherId===teacherId && ta.date===dateStr) || null;
}

function recordTeacherAbsence(teacherId, dateStr, slots){
  let ta = findTeacherAbsence(teacherId, dateStr);
  if(!ta){
    ta = {id:'tabs-'+Date.now()+'-'+Math.random().toString(36).slice(2,6), teacherId, date:dateStr, slots:[]};
    S.teacherAbsences.push(ta);
  }
  slots.forEach(s=>{ if(!ta.slots.includes(s)) ta.slots.push(s); });
  return ta;
}

// その日その枠に代講候補になりうる講師を探す（欠勤本人を除外、その枠にいる全生徒の教科・学年に対応でき、空きがある講師）
// その日その枠・その生徒1人分について、代講候補になりうる講師を探す
// （実際の当日の負荷=getEffectiveDayAssignmentsベースで空きを判定するため、同じ枠内で他の生徒に既に代講が決まっていても正しく数えられる）
// その日その枠・その生徒1人分について、代講候補になりうる講師を、追加コストが低い順に並べて返す
// 優先順位：①その枠に既に1人だけ担当している講師（追加コストゼロ）
//         ②当日は他のコマで出勤予定があり、この枠が空いている講師（交通費の追加なし）
//         ③当日の出勤予定はないが、この枠に○/△を申告している講師（コマ単価が低い順）
//         ④それ以外の対応可能な講師全員（最終手段）
// ②③④の同グループ内は「得意科目が合うか→コマ単価が低い順」で並べる
function findSubstituteCandidatesForStudent(dateStr, slot, absentTeacherId, studentId, subject){
  const student = S.students.find(s=>s.id===studentId);
  if(!student) return [];
  const status = getDayStatus(dateStr);
  if(status.type!=='open') return [];
  const weekday = status.weekday;
  const dayList = getEffectiveDayAssignments(dateStr);

  const qualified = S.teachers.filter(t=>{
    if(t.id===absentTeacherId) return false;
    if(!t.subjects.some(ts=>ts.level===student.level && ts.subject===subject)) return false;
    const used = dayList.filter(a=>a.teacherId===t.id && a.slot===slot).length;
    return used < S.teacherCapacity;
  });

  function groupOf(t){
    const usedInSlot = dayList.filter(a=>a.teacherId===t.id && a.slot===slot).length;
    if(usedInSlot>=1) return 1; // ①既にその枠に生徒がいる（まだ定員に空きがあることはqualifiedの時点で保証済み）
    const worksElsewhereToday = dayList.some(a=>a.teacherId===t.id && a.slot!==slot);
    if(worksElsewhereToday) return 2; // ②当日は出勤予定あり、この枠は空き
    if(isTeacherAvailableOnDate(t.id, dateStr, slot)) return 3; // ③当日の出勤予定はないが○/△申告あり
    return 4; // ④それ以外
  }

  const withKeys = qualified.map(t=>({
    teacher: t,
    group: groupOf(t),
    prefSubject: isPreferredSubjectForTeacher(t, student.level, subject),
    rate: getTeacherRateForDate(t, dateStr),
  }));
  withKeys.sort((a,b)=>{
    if(a.group !== b.group) return a.group - b.group;
    if(a.prefSubject !== b.prefSubject) return a.prefSubject ? -1 : 1;
    return a.rate - b.rate;
  });
  return withKeys.map(k=>k.teacher);
}

// 代講講師を確定する（その日その枠・その生徒だけ担当者が変わる。曜日パターン自体は変更しない）
// studentIdを省略すると、その枠の全員に一括適用する
function confirmSubstitute(teacherId, dateStr, slot, substituteTeacherId, studentId){
  studentId = studentId || null;
  S.teacherSubstitutions = S.teacherSubstitutions.filter(s=>!(s.teacherId===teacherId && s.date===dateStr && s.slot===slot && s.studentId===studentId));
  S.teacherSubstitutions.push({id:'tsub-'+Date.now()+'-'+Math.random().toString(36).slice(2,6), teacherId, date:dateStr, slot, substituteTeacherId, studentId});

  // 代講講師にも、既存の「授業の承認」の仕組みで通知する（単発の代講であることが分かるよう日付を添える）
  const status = getDayStatus(dateStr);
  const weekday = status.weekday;
  const targets = studentId
    ? [{studentId}]
    : S.assignments.filter(a=>a.teacherId===teacherId && a.day===weekday && a.slot===slot);
  targets.forEach(a=>{
    const original = S.assignments.find(x=>x.teacherId===teacherId && x.day===weekday && x.slot===slot && x.studentId===a.studentId);
    if(!original) return;
    issueAssignmentApproval(original.studentId, original.courseId, original.subject, weekday, slot, substituteTeacherId, dateStr);
  });
}
function cancelSubstitute(teacherId, dateStr, slot, studentId){
  studentId = studentId || null;
  S.teacherSubstitutions = S.teacherSubstitutions.filter(s=>!(s.teacherId===teacherId && s.date===dateStr && s.slot===slot && s.studentId===studentId));
}

// 代講が見つからない・選ばない場合：対象の生徒を、既存の生徒側「欠席」フローに乗せる（1人単位でも複数人まとめてでも使える）
function resolveSlotViaStudentAbsence(teacherId, dateStr, slot, studentEntries){
  const status = getDayStatus(dateStr);
  if(status.type!=='open') return;
  const weekday = status.weekday;
  studentEntries.forEach(e=>{
    recordAbsence(e.studentId, e.courseId, e.subject, weekday, slot, dateStr);
  });
}

function cancelTeacherAbsence(id){
  const ta = S.teacherAbsences.find(t=>t.id===id);
  if(!ta) return;
  // 紐づく代講記録も一緒に取り消す（生徒都合の欠席として既に処理された分はそのまま維持する）
  S.teacherSubstitutions = S.teacherSubstitutions.filter(s=>!(s.teacherId===ta.teacherId && s.date===ta.date && ta.slots.includes(s.slot)));
  S.teacherAbsences = S.teacherAbsences.filter(t=>t.id!==id);
}

// 指定日・指定コマにおける講師の実際の負荷（曜日パターンの確定分から、その日欠席の生徒を除き、振替で入る生徒を足す）
function countTeacherLoadOnDate(teacherId, dateStr, slot, excludeStudentId){
  const status = getDayStatus(dateStr);
  if(status.type!=='open') return 0;
  const weekday = status.weekday;
  const yearMonth = dateStr.slice(0,7);
  let count = 0;
  S.assignments.forEach(a=>{
    if(a.teacherId!==teacherId || a.day!==weekday || a.slot!==slot) return;
    if(!isAssignmentEffectiveInMonth(a, yearMonth)) return;
    if(a.studentId===excludeStudentId) return;
    if(findAbsenceFor(a.studentId, a.courseId, dateStr, a.day, a.slot)) return; // その日欠席なら除外
    count++;
  });
  S.absences.forEach(ab=>{
    if(!ab.makeup) return;
    if(ab.makeup.date!==dateStr || ab.makeup.slot!==slot || ab.makeup.teacherId!==teacherId) return;
    if(ab.studentId===excludeStudentId) return;
    count++;
  });
  return count;
}
// 指定日・指定コマにおける教室全体の実際の負荷
function countRoomLoadOnDate(dateStr, slot, excludeStudentId){
  const status = getDayStatus(dateStr);
  if(status.type!=='open') return 0;
  const weekday = status.weekday;
  const yearMonth = dateStr.slice(0,7);
  let count = 0;
  S.assignments.forEach(a=>{
    if(a.day!==weekday || a.slot!==slot) return;
    if(!isAssignmentEffectiveInMonth(a, yearMonth)) return;
    if(a.studentId===excludeStudentId) return;
    if(findAbsenceFor(a.studentId, a.courseId, dateStr, a.day, a.slot)) return;
    count++;
  });
  S.absences.forEach(ab=>{
    if(!ab.makeup) return;
    if(ab.makeup.date!==dateStr || ab.makeup.slot!==slot) return;
    if(ab.studentId===excludeStudentId) return;
    count++;
  });
  return count;
}

// 欠席日より後（いつでも可・当日振替の制限なし）から、対応可能な振替候補を日付順に探す
function findMakeupCandidates(studentId, level, subject, afterDateStr, limit){
  limit = limit || 6;
  const results = [];
  const start = new Date(afterDateStr+'T00:00:00');
  for(let i=1; i<=45 && results.length<limit; i++){
    const d = new Date(start);
    d.setDate(start.getDate()+i);
    const dateStr = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
    const status = getDayStatus(dateStr);
    if(status.type!=='open') continue;
    for(const slot of SLOTS){
      if(results.length>=limit) break;
      const roomLoad = countRoomLoadOnDate(dateStr, slot.id, studentId);
      if(roomLoad >= S.roomCapacity) continue;
      const cands = S.teachers
        .filter(t=> t.subjects.some(ts=>ts.level===level && ts.subject===subject))
        .filter(t=> isTeacherAvailableOnDate(t.id, dateStr, slot.id))
        .map(t=>({teacher:t, used: countTeacherLoadOnDate(t.id, dateStr, slot.id, studentId)}))
        .filter(c=> c.used < S.teacherCapacity)
        .sort((a,b)=> a.used-b.used);
      if(cands.length>0){
        results.push({date:dateStr, slot, candidates:cands});
      }
    }
  }
  return results;
}
function confirmMakeup(absenceId, makeupDate, makeupSlot, teacherId){
  const ab = S.absences.find(a=>a.id===absenceId);
  if(!ab) return {ok:false, msg:'欠席記録が見つかりません。'};
  const roomLoad = countRoomLoadOnDate(makeupDate, makeupSlot, ab.studentId);
  if(roomLoad>=S.roomCapacity) return {ok:false, msg:'その日程は教室全体の定員に達しています。'};
  const teacherLoad = countTeacherLoadOnDate(teacherId, makeupDate, makeupSlot, ab.studentId);
  if(teacherLoad>=S.teacherCapacity) return {ok:false, msg:'その講師はその日程の定員に達しています。'};
  ab.makeup = {date:makeupDate, slot:makeupSlot, teacherId};
  ab.status = 'resolved';
  return {ok:true};
}

// 指定日の「実際に何が起きるか」を、曜日パターン＋欠席＋振替を反映して求める（教室全体表示・週表示で使用）
function getEffectiveDayAssignments(dateStr){
  const status = getDayStatus(dateStr);
  if(status.type!=='open') return [];
  const weekday = status.weekday;
  const list = [];
  const yearMonth = dateStr.slice(0,7);
  S.assignments.forEach(a=>{
    if(a.day!==weekday) return;
    if(!assignmentAppliesOnDate(a, dateStr)) return;
    if(findAbsenceFor(a.studentId, a.courseId, dateStr, a.day, a.slot)) return;
    // studentId指定ありの代講（この生徒だけ）を優先し、なければ全体向け（studentId:null）の代講を見る
    const sub = S.teacherSubstitutions.find(s=>s.teacherId===a.teacherId && s.date===dateStr && s.slot===a.slot && s.studentId===a.studentId)
      || S.teacherSubstitutions.find(s=>s.teacherId===a.teacherId && s.date===dateStr && s.slot===a.slot && !s.studentId);
    const effectiveTeacherId = sub ? sub.substituteTeacherId : a.teacherId;
    list.push({studentId:a.studentId, courseId:a.courseId, subject:a.subject, slot:a.slot, teacherId:effectiveTeacherId, kind:'normal', source:a.source, substituted: !!sub, originalTeacherId: sub ? a.teacherId : null});
  });
  S.pendingAssignments.forEach(a=>{
    if(a.day!==weekday) return;
    if(!assignmentAppliesOnDate(a, dateStr)) return;
    list.push({studentId:a.studentId, courseId:a.courseId, subject:a.subject, slot:a.slot, teacherId:a.teacherId, kind:'normal', source:a.source, pending:true});
  });
  S.draftAssignments.forEach(a=>{
    if(a.day!==weekday) return;
    if(!assignmentAppliesOnDate(a, dateStr)) return;
    if(findAbsenceFor(a.studentId, a.courseId, dateStr, a.day, a.slot)) return;
    list.push({studentId:a.studentId, courseId:a.courseId, subject:a.subject, slot:a.slot, teacherId:a.teacherId, kind:'normal', source:a.source, draft:true});
  });
  S.absences.forEach(ab=>{
    if(!ab.makeup || ab.makeup.date!==dateStr) return;
    list.push({studentId:ab.studentId, courseId:ab.courseId, subject:ab.subject, slot:ab.makeup.slot, teacherId:ab.makeup.teacherId, kind:'makeup'});
  });
  return list;
}

// 指定日について、講師が○・△を付けた枠のうち「あと◯人」「講師空き」を集計する（onlyTeacherId指定時はその講師だけ）
function computeTeacherOpenings(dateStr, onlyTeacherId){
  const status = getDayStatus(dateStr);
  if(status.type!=='open') return {partialCount:0, emptyCount:0, rows:[]};
  const dayList = getEffectiveDayAssignments(dateStr);
  const targetTeachers = onlyTeacherId ? S.teachers.filter(t=>t.id===onlyTeacherId) : S.teachers;
  let partialCount = 0, emptyCount = 0;
  const rows = [];
  targetTeachers.forEach(t=>{
    SLOTS.forEach(slot=>{
      const state = getDateSlotState(t.id, dateStr, slot.id); // 'none'|'normal'|'preferred'
      if(state==='none') return; // ×は対象外
      const booked = dayList.filter(a=>a.teacherId===t.id && a.slot===slot.id).length;
      let kind;
      if(booked===0){ kind='empty'; emptyCount++; }
      else if(booked<S.teacherCapacity){ kind='partial'; partialCount++; }
      else{ kind='full'; }
      rows.push({teacher:t, slot, state, booked, kind, remaining: S.teacherCapacity-booked});
    });
  });
  return {partialCount, emptyCount, rows};
}

// その日の実際のレッスン一覧（欠席・振替反映済み）から、売上・講師コスト・コスト率を計算する
// includeTransport指定時は交通費込みの合計コストとコスト率を返す。省略時はグローバル設定(S.finIncludeTransport)に従う
// 指定講師の、指定日"より前"の実施コマ累計数を数える（指定日から遡って最大370日分までで打ち切る。計算コストを抑えるための上限）
// 指定講師の、指定日"より前"の実施コマ累計数を数える（指定日から遡って最大370日分。計算コストを抑えるための上限）
function countTeacherLessonsBefore(teacherId, dateStr){
  let count = 0;
  let d = new Date(dateStr+'T00:00:00');
  d.setDate(d.getDate()-370);
  const end = new Date(dateStr+'T00:00:00');
  let guard = 0;
  while(d < end && guard < 370){
    const ds = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
    const list = getEffectiveDayAssignments(ds);
    count += list.filter(a=>a.teacherId===teacherId).length;
    d.setDate(d.getDate()+1);
    guard++;
  }
  return count;
}

// その講師の、指定日に適用されるコマ単価を判定する（優先順位：①最初のXコマ特例 → ②昇給スケジュール → ③基本単価）
function getTeacherRateForDate(teacher, dateStr){
  if(teacher.earlyLessonException && teacher.earlyLessonException.lessonCount > 0){
    const before = countTeacherLessonsBefore(teacher.id, dateStr);
    if(before < teacher.earlyLessonException.lessonCount){
      return teacher.earlyLessonException.rate;
    }
  }
  if(teacher.raiseSchedule && teacher.raiseSchedule.length > 0){
    const ym = dateStr.slice(0,7);
    const applicable = teacher.raiseSchedule.filter(r=>r.yearMonth <= ym);
    if(applicable.length > 0){
      applicable.sort((a,b)=> a.yearMonth < b.yearMonth ? 1 : -1);
      return applicable[0].rate;
    }
  }
  return teacher.perLessonRate || 0;
}

function computeDayFinance(dateStr, includeTransport){
  if(includeTransport===undefined) includeTransport = S.finIncludeTransport;
  const status = getDayStatus(dateStr);
  if(status.type!=='open') return {revenue:0, lessonCost:0, transportCost:0, cost:0, ratio:null, lessonCount:0};
  const list = getEffectiveDayAssignments(dateStr).filter(a=>!a.pending && !a.draft); // 承認待ち・下書きはまだ確定していないため収支に含めない
  if(list.length===0) return {revenue:0, lessonCost:0, transportCost:0, cost:0, ratio:null, lessonCount:0};

  let revenue = 0;
  list.forEach(a=>{
    const student = S.students.find(s=>s.id===a.studentId);
    revenue += student ? (S.tuitionRates[student.level] || 0) : 0;
  });

  // 講師コスト（コマ給）は「講師×コマ」単位で1回だけ支払う（同じコマに生徒が2人いても、講師が受け取るのは1コマ分）
  let lessonCost = 0;
  const teacherSlotSet = new Set(); // "teacherId|slot" の重複排除
  const teacherIdsToday = new Set();
  list.forEach(a=>{
    teacherSlotSet.add(`${a.teacherId}|${a.slot}`);
    teacherIdsToday.add(a.teacherId);
  });
  teacherSlotSet.forEach(key=>{
    const tid = key.split('|')[0];
    const teacher = S.teachers.find(t=>t.id===tid);
    lessonCost += teacher ? getTeacherRateForDate(teacher, dateStr) : 0;
  });
  // 交通費（出勤日1回だけ）は別集計にしておき、含める/含めないを切り替えられるようにする
  let transportCost = 0;
  teacherIdsToday.forEach(tid=>{
    const teacher = S.teachers.find(t=>t.id===tid);
    transportCost += teacher ? (teacher.dailyTransport || 0) : 0;
  });

  const cost = lessonCost + (includeTransport ? transportCost : 0);
  const ratio = revenue>0 ? (cost/revenue*100) : null;
  return {revenue, lessonCost, transportCost, cost, ratio, lessonCount:list.length};
}

// コスト率に応じて、白→赤へ連続的に濃くなる色を返す（3段階の分類はしない。100%以上は最大濃度で頭打ち）

function costRatioColor(ratio){
  if(ratio==null) return null;
  const range = S.finGradientMax - S.finGradientMin;
  const t = range>0 ? Math.min(Math.max((ratio-S.finGradientMin)/range, 0), 1) : (ratio>=S.finGradientMax ? 1 : 0);
  const r = Math.round(255 + (179-255)*t);
  const g = Math.round(255 + (70-255)*t);
  const b = Math.round(255 + (44-255)*t);
  return {bg:`rgb(${r},${g},${b})`, text: t>0.5 ? '#fff' : 'var(--ink)'};
}

// 生徒フィルター時：その日・その生徒の各コマの状態（通常確定／欠席／振替先／未確定）をまとめる
function getStudentDateRows(student, dateStr){
  const status = getDayStatus(dateStr);
  const weekday = status.weekday;
  const rows = [];
  student.courses.forEach(course=>{
    course.desiredSlots.forEach(ds=>{
      if(ds.day!==weekday) return;
      const slot = SLOTS.find(sl=>sl.id===ds.slot);
      const absence = findAbsenceFor(student.id, course.id, dateStr, ds.day, ds.slot);
      const yearMonth = dateStr.slice(0,7);
      const eff = findEffectiveAssignment(student.id, course.id, ds.day, ds.slot, yearMonth, dateStr);
      let existing = eff ? eff.entry : null;
      let isPending = eff ? eff.isPending : false;
      let isDraft = eff ? eff.isDraft : false;
      rows.push({slot, course, existing, absence, isMakeupTarget:false, isPending, isDraft});
    });
  });
  S.absences.forEach(ab=>{
    if(ab.studentId!==student.id || !ab.makeup || ab.makeup.date!==dateStr) return;
    const slot = SLOTS.find(sl=>sl.id===ab.makeup.slot);
    const course = student.courses.find(c=>c.id===ab.courseId);
    if(course) rows.push({slot, course, existing:null, absence:ab, isMakeupTarget:true});
  });
  rows.sort((a,b)=> a.slot.id - b.slot.id);
  return rows;
}


export { findAbsenceFor, recordAbsence, cancelAbsenceRecord, cancelMakeup, markNoMakeup, getTeacherLessonsOnDate, findTeacherAbsence, recordTeacherAbsence, findSubstituteCandidatesForStudent, confirmSubstitute, cancelSubstitute, resolveSlotViaStudentAbsence, cancelTeacherAbsence, countTeacherLoadOnDate, countRoomLoadOnDate, isTeacherAvailableOnDate, findMakeupCandidates, confirmMakeup, getEffectiveDayAssignments, computeTeacherOpenings, countTeacherLessonsBefore, getTeacherRateForDate, computeDayFinance, costRatioColor, getStudentDateRows };
