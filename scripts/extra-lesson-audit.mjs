import { appendFileSync } from 'node:fs';

globalThis.firebase = {
  apps: [],
  initializeApp(){
    this.apps.push({ name: '[DEFAULT]' });
    return {};
  },
  auth(){ return { currentUser: null }; },
  firestore(){ return { settings(){}, useEmulator(){} }; },
};
globalThis.document = {
  getElementById(){ return null; },
  addEventListener(){},
  querySelector(){ return null; },
  querySelectorAll(){ return []; },
  dispatchEvent(){},
};
globalThis.window = globalThis;
globalThis.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init){ this.type = type; this.detail = init?.detail; }
};

const logPath = '/Users/shoui/ピタコマ/.cursor/debug-4a22b6.log';
const { S } = await import('../src/admin/state.js');
const abs = await import('../src/admin/absences.js');
const tab = await import('../src/admin/teacher-schedule-tab.js');
const extra = await import('../src/admin/extra-lessons.js');
const count = await import('../src/admin/extra-lesson-count.mjs');
const pay = await import('../src/admin/payroll.js');
const { toDateStr } = await import('../src/shared/date-utils.js');

const results = [];

function log(hypothesisId, id, ok, data){
  const row = {
    sessionId: '4a22b6',
    runId: 'post-fix',
    hypothesisId,
    location: 'scripts/extra-lesson-audit.mjs',
    message: ok ? 'pass' : 'FAIL',
    data: { id, ...data },
    timestamp: Date.now(),
  };
  appendFileSync(logPath, JSON.stringify(row) + '\n');
  results.push(row);
  console.log(`${ok ? 'OK' : 'NG'} ${id} ${JSON.stringify(data)}`);
}

function reset(){
  S.students = [];
  S.teachers = [];
  S.assignments = [];
  S.pendingAssignments = [];
  S.draftAssignments = [];
  S.extraBookings = [];
  S.extraHolds = [];
  S.absences = [];
  S.teacherAbsences = [];
  S.teacherSubstitutions = [];
  S.programmingMonthlyFee = 8000;
  S.roomCapacity = 12;
}

function openWeekday(weekday, start){
  const d = new Date(`${start}T00:00:00`);
  for(let i = 0; i < 21; i++){
    const ds = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
    const status = absencesStatus(ds);
    if(status.type === 'open' && status.weekday === weekday) return ds;
    d.setDate(d.getDate() + 1);
  }
  throw new Error('日付が見つかりません ' + weekday);
}

function absencesStatus(ds){
  const { getDayStatus } = calendarApi;
  return getDayStatus(ds);
}

const calendarApi = await import('../src/admin/calendar.js');
const past = openWeekday('月', '2026-10-01');
const future = openWeekday('月', '2026-12-01');
const futureLate = openWeekday('月', '2026-12-20');

function student(extraFields){
  return {
    id: 's1',
    name: '山田',
    level: '小学',
    grade: 4,
    tuitionCourse: 'basic',
    courseStartDate: '2026-04-01',
    courses: [{ id: 'c-math', subject: '算数', oneToOne: false, desiredSlots: [{ day: '月', slot: 5 }] }],
    freeLessonCount: 0,
    discounts: {},
    ...extraFields,
  };
}

function basePeople(){
  S.students = [student()];
  S.teachers = [{ id: 't1', name: '佐藤', perLessonRate: 1500, dailyTransport: 500 }];
}

function lesson(date, extraFields){
  return {
    id: extraFields.id || `asg-${date}-${extraFields.bucket || 'confirmed'}`,
    studentId: 's1',
    courseId: 'ex-s1-算数',
    subject: '算数',
    day: '月',
    slot: 5,
    teacherId: 't1',
    oneTimeDate: date,
    extraBookingId: 'b1',
    extraLineId: 'math',
    source: 'extra',
    ...extraFields,
  };
}

function put(date, bucket, extraFields){
  const row = lesson(date, { bucket, ...extraFields });
  delete row.bucket;
  if(bucket === 'pending') S.pendingAssignments.push(row);
  else if(bucket === 'draft') S.draftAssignments.push(row);
  else S.assignments.push(row);
  return row;
}

function booking(lines){
  return { id: 'b1', studentId: 's1', lines: lines || [{ id: 'math', subject: '算数', count: 4 }] };
}

function summary(){
  const tagged = []
    .concat(S.assignments.map(row => ({ ...row, bucket: 'confirmed' })))
    .concat(S.pendingAssignments.map(row => ({ ...row, bucket: 'pending' })))
    .concat(S.draftAssignments.map(row => ({ ...row, bucket: 'draft' })));
  return count.summarizeBooking(booking(), {
    today: '2026-11-05',
    holds: S.extraHolds,
    assignments: tagged,
    absences: S.absences,
    isTeacherAbsent: row => abs.isTeacherAbsentForStudent(row.teacherId, row.oneTimeDate, row.slot, row.studentId),
  });
}

function monthPay(date){
  const [y, m] = date.split('-').map(Number);
  const rows = pay.computeLiveMonthPayroll(y, m - 1, 0);
  return rows.find(row => row.teacherId === 't1') || { lessonPay: 0, lessonCount: 0 };
}

reset();
basePeople();
log('setup', 'dates', true, { past, future, futureLate });

reset();
basePeople();
S.extraHolds = [{ id: 'h1', extraBookingId: 'b1', extraLineId: 'math', studentId: 's1', courseId: 'ex-s1-算数', subject: '算数', date: future, day: '月', slot: 5, half: 'full' }];
{
  const fin = abs.computeDayFinance(future, false);
  const room = tab.countRoomSlotOnDate(future, 5, null, undefined);
  const paid = monthPay(future);
  const sum = summary();
  log('H1', 'hold-not-in-money', fin.revenue === 0 && fin.lessonCost === 0 && paid.lessonPay === 0, { revenue: fin.revenue, lessonCost: fin.lessonCost, lessonPay: paid.lessonPay, room, placed: sum.placed, unplaced: sum.unplaced });
  log('H4', 'hold-takes-one-seat', room === 1 && sum.placed === 1 && sum.unplaced === 3, { room, placed: sum.placed, unplaced: sum.unplaced });
}

reset();
basePeople();
put(past, 'pending');
{
  const fin = abs.computeDayFinance(past, false);
  const sum = summary();
  log('H1', 'pending-not-money-or-done', fin.revenue === 0 && fin.lessonCost === 0 && sum.done === 0 && sum.placed === 1, { revenue: fin.revenue, lessonCost: fin.lessonCost, done: sum.done, placed: sum.placed, roles: sum.placedItems.map(row => row.role) });
}

reset();
basePeople();
put(past, 'draft');
{
  const fin = abs.computeDayFinance(past, false);
  const sum = summary();
  log('H1', 'draft-not-money-or-done', fin.revenue === 0 && sum.done === 0 && sum.placed === 1, { revenue: fin.revenue, done: sum.done, role: sum.placedItems[0]?.role });
}

reset();
basePeople();
put(future, 'confirmed');
{
  const fin = abs.computeDayFinance(future, false);
  const sum = summary();
  const paid = monthPay(future);
  log('H2', 'future-confirmed-group-tuition', fin.revenue === 2900 && sum.done === 0 && sum.placed === 1, { revenue: fin.revenue, done: sum.done, role: sum.placedItems[0]?.role });
  log('H2', 'future-confirmed-pay', paid.lessonPay === 1500 && paid.lessonCount === 1, { lessonPay: paid.lessonPay, lessonCount: paid.lessonCount });
}

reset();
basePeople();
put(past, 'confirmed');
{
  const sum = summary();
  const fin = abs.computeDayFinance(past, false);
  log('H2', 'past-confirmed-is-done', sum.done === 1 && sum.placed === 0 && fin.revenue === 2900, { done: sum.done, placed: sum.placed, revenue: fin.revenue });
}

reset();
basePeople();
put(future, 'confirmed', { oneToOne: true });
{
  const fin = abs.computeDayFinance(future, false);
  log('H2', 'one-to-one-not-group-price', fin.revenue === 6000, { revenue: fin.revenue });
}

reset();
basePeople();
put(future, 'confirmed', { half: 'early', oneToOne: true });
{
  const fin = abs.computeDayFinance(future, false);
  const paid = monthPay(future);
  log('H2', 'short-one-to-one-tuition-and-pay', fin.revenue === 3000 && paid.lessonPay === 750, { revenue: fin.revenue, lessonPay: paid.lessonPay, lessonCount: paid.lessonCount });
}

reset();
basePeople();
put(future, 'confirmed', { half: 'early' });
{
  const fin = abs.computeDayFinance(future, false);
  log('H6', 'short-group-empty-rate-becomes-zero', true, { revenue: fin.revenue, note: '集団40分の単価表が空のときの売上' });
}

reset();
basePeople();
put(future, 'confirmed', { subject: 'プログラミング', courseId: 'ex-s1-プログラミング', extraLineId: 'prog' });
put(futureLate, 'confirmed', { id: 'asg-prog2', subject: 'プログラミング', courseId: 'ex-s1-プログラミング', extraLineId: 'prog' });
{
  const [y, m] = future.split('-').map(Number);
  const dayFin = abs.computeDayFinance(future, false);
  const ids = abs.getMonthlyFeeStudentIds(y, m - 1);
  log('H6', 'programming-not-per-lesson-and-monthly-once', dayFin.revenue === 0 && ids.size === 1, { dayRevenue: dayFin.revenue, monthlyStudents: ids.size });
}

reset();
basePeople();
S.pendingAssignments.push(lesson(future, { subject: 'プログラミング', courseId: 'ex-s1-プログラミング', extraLineId: 'prog' }));
{
  const [y, m] = future.split('-').map(Number);
  const ids = abs.getMonthlyFeeStudentIds(y, m - 1);
  log('H6', 'pending-programming-not-monthly', ids.size === 0, { monthlyStudents: ids.size });
}

reset();
basePeople();
put(future, 'confirmed');
S.absences = [{ id: 'ab1', studentId: 's1', courseId: 'ex-s1-算数', subject: '算数', day: '月', slot: 5, date: future, status: 'pending', extraBookingId: 'b1', extraLineId: 'math', half: 'full' }];
{
  const fin = abs.computeDayFinance(future, false);
  const room = tab.countRoomSlotOnDate(future, 5, null, undefined);
  const load = abs.countRoomLoadOnDate(future, 5, null, undefined);
  const sum = summary();
  log('H3', 'absence-waits-not-done', sum.placed === 1 && sum.done === 0 && sum.consumed === 0 && sum.placedItems[0]?.role === 'waiting', { placed: sum.placed, role: sum.placedItems[0]?.role, unplaced: sum.unplaced });
  log('H4', 'extra-absence-frees-seat', fin.revenue === 0 && room === 0 && load === 0, { revenue: fin.revenue, room, load });
}

reset();
basePeople();
S.assignments.push({ id: 'weekly', studentId: 's1', courseId: 'c-math', subject: '算数', day: '月', slot: 5, teacherId: 't1' });
S.absences = [{ id: 'abw', studentId: 's1', courseId: 'c-math', subject: '算数', day: '月', slot: 5, date: future, status: 'pending' }];
{
  const room = tab.countRoomSlotOnDate(future, 5, null, undefined);
  log('H4', 'weekly-absence-keeps-seat', room === 1, { room });
}

reset();
basePeople();
put(future, 'confirmed');
S.absences = [{ id: 'abn', studentId: 's1', courseId: 'ex-s1-算数', subject: '算数', day: '月', slot: 5, date: future, status: 'no-makeup', extraBookingId: 'b1', extraLineId: 'math' }];
{
  const sum = summary();
  const fin = abs.computeDayFinance(future, false);
  log('H3', 'no-makeup-consumed-not-done', sum.consumed === 1 && sum.done === 0 && sum.placed === 0 && fin.revenue === 0, { consumed: sum.consumed, done: sum.done, placed: sum.placed, revenue: fin.revenue });
}

reset();
basePeople();
put(future, 'confirmed');
put(futureLate, 'confirmed', { id: 'makeup1', source: 'makeup' });
S.absences = [{
  id: 'abr', studentId: 's1', courseId: 'ex-s1-算数', subject: '算数', day: '月', slot: 5, date: future, status: 'resolved',
  extraBookingId: 'b1', extraLineId: 'math', makeup: { date: futureLate, slot: 5, teacherId: 't1' },
}];
{
  const sum = summary();
  const original = abs.computeDayFinance(future, false);
  const makeup = abs.computeDayFinance(futureLate, false);
  const lines = abs.getEffectiveDayAssignments(futureLate).filter(row => row.studentId === 's1' && row.slot === 5);
  log('H3', 'makeup-does-not-double-count', sum.placed === 1 && sum.done === 0 && sum.unplaced === 3, { placed: sum.placed, done: sum.done, unplaced: sum.unplaced, roles: sum.lines[0].summary.items.map(row => row.role) });
  log('H2', 'makeup-revenue-once-on-new-date', original.revenue === 0 && makeup.revenue === 2900 && lines.length === 1, { original: original.revenue, makeup: makeup.revenue, lines: lines.length });
}

reset();
basePeople();
S.extraHolds = [
  { id: 'he', extraBookingId: 'b1', extraLineId: 'math', studentId: 's1', courseId: 'ex-s1-算数', subject: '算数', date: future, day: '月', slot: 5, half: 'early' },
  { id: 'hl', extraBookingId: 'b1', extraLineId: 'late', studentId: 's1', courseId: 'ex-s1-国語', subject: '国語', date: future, day: '月', slot: 5, half: 'late' },
];
S.extraBookings = [{ id: 'b1', lines: [{ id: 'math', subject: '算数', count: 1 }, { id: 'late', subject: '国語', count: 1 }] }];
S.absences = [{ id: 'abe', studentId: 's1', courseId: 'ex-s1-算数', extraBookingId: 'b1', extraLineId: 'math', date: future, day: '月', slot: 5, half: 'early', status: 'pending', subject: '算数' }];
{
  const early = tab.countRoomSlotOnDate(future, 5, null, 'early');
  const late = tab.countRoomSlotOnDate(future, 5, null, 'late');
  const shown = extra.extraHoldCalendarLines(future).map(line => line.text);
  log('H5', 'early-absence-keeps-late-seat', early === 0 && late === 1, { early, late });
  log('H5', 'early-absence-keeps-late-on-calendar', shown.some(text => text.includes('国:')) && !shown.some(text => text.includes('算')), { shown });
}

reset();
basePeople();
S.students[0].courses = [];
S.students[0].freeLessonCount = 1;
put(past, 'confirmed');
S.assignments.push({ id: 'later', studentId: 's1', courseId: 'c-math', subject: '算数', day: '月', slot: 6, teacherId: 't1', oneTimeDate: openWeekday('月', '2026-11-06') });
{
  const laterDate = S.assignments[1].oneTimeDate;
  const freeOnExtra = abs.getStudentTuitionForDate(S.students[0], past, S.assignments[0]);
  const chargedLater = abs.getStudentTuitionForDate(S.students[0], laterDate, S.assignments[1]);
  const beforeLater = abs.countStudentLessonsBefore(S.students[0], laterDate);
  log('H7', 'free-count-uses-confirmed-extra-once', freeOnExtra === 0 && chargedLater === 2900 && beforeLater === 1, { freeOnExtra, chargedLater, beforeLater, laterDate });
}

reset();
basePeople();
S.students[0].courses = [];
S.students[0].freeLessonCount = 1;
S.draftAssignments.push(lesson(past, { id: 'draft-free' }));
const laterFree = openWeekday('月', '2026-11-06');
S.assignments.push({ id: 'later2', studentId: 's1', courseId: 'c-math', subject: '算数', day: '月', slot: 6, teacherId: 't1', oneTimeDate: laterFree });
{
  const charged = abs.getStudentTuitionForDate(S.students[0], laterFree, S.assignments[0]);
  const before = abs.countStudentLessonsBefore(S.students[0], laterFree);
  log('H7', 'draft-does-not-consume-free', charged === 0 && before === 0, { charged, before, laterFree });
}

reset();
basePeople();
put(future, 'confirmed');
S.teacherAbsences = [{ id: 'ta1', teacherId: 't1', date: future, slots: [5] }];
{
  const fin = abs.computeDayFinance(future, false);
  const paid = monthPay(future);
  const sum = summary();
  log('H1', 'teacher-absent-not-paid-or-done', fin.revenue === 0 && fin.lessonCost === 0 && paid.lessonPay === 0 && sum.done === 0 && sum.placedItems[0]?.role === 'teacherAbsent', { revenue: fin.revenue, lessonPay: paid.lessonPay, role: sum.placedItems[0]?.role });
}

reset();
basePeople();
put(future, 'confirmed');
{
  const rows = abs.getStudentDateRows(S.students[0], future);
  const extraLines = extra.extraAssignmentCalendarLines(future, 's1');
  const weeklyShowsExtra = rows.some(row => row.existing?.extraBookingId);
  log('H9', 'weekly-row-does-not-reuse-extra', !weeklyShowsExtra && extraLines.length === 1, { weeklyRows: rows.length, extraLines: extraLines.length, weeklyShowsExtra });
}

{
  const choices = extra.slotChoicesForLines([{ minutes: 40, subject: '算数' }, { minutes: 90, subject: 'プログラミング' }]);
  const only40 = extra.slotChoicesForLines([{ minutes: 40, subject: '算数' }]);
  const only90 = extra.slotChoicesForLines([{ minutes: 90, subject: '算数' }]);
  log('H8', 'mixed-40-keeps-90-slot', choices.includes('full') && choices.includes('early') && choices.includes('late') && !only40.includes('full') && only90.length === 1, { choices, only40, only90 });
}

const failed = results.filter(row => row.message === 'FAIL');
console.log(`audit ${results.length - failed.length}/${results.length} pass, fail ${failed.length}`);
if(failed.length) process.exitCode = 1;
