/**
 * 切り替え日（学年・コース・1対1）と追加コマ送信のまわりで、数字が場所ごとに食い違わないか調べる。
 * 使い方: node scripts/change-date-consistency-audit.mjs
 */
import { createServer } from 'vite';
import { copyFileSync, appendFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LOG = '/Users/shoui/ピタコマ/.cursor/debug-4a22b6.log';
function dummy(){
  const fn = function(){ return dummy(); };
  return new Proxy(fn, {
    get(_t, prop){
      if(prop === 'then' || typeof prop === 'symbol' && prop !== Symbol.toPrimitive) return undefined;
      if(prop === Symbol.toPrimitive) return () => '';
      if(prop === 'length') return 0;
      if(prop === 'style') return {};
      if(prop === 'classList') return { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
      if(prop === 'dataset') return {};
      if(prop === 'children' || prop === 'childNodes') return [];
      return dummy();
    },
    apply(){ return dummy(); },
  });
}
const elements = new Map();
function el(id){
  if(!elements.has(id)){
    const store = { value: '', textContent: '', innerHTML: '', checked: false, hidden: false };
    elements.set(id, new Proxy(store, {
      get(t, p){ if(p in t) return t[p]; if(p === 'then') return undefined; if(p === 'style') return (t.style ||= {}); if(p === 'classList') return { add(){}, remove(){}, toggle(){}, contains(){ return false; } }; return dummy(); },
      set(t, p, v){ t[p] = v; return true; },
    }));
  }
  return elements.get(id);
}
const radios = {};
globalThis.window = globalThis;
globalThis.window.scrollTo = () => {};
globalThis.document = {
  getElementById: el,
  querySelector(sel){ const m = /^input\[name=(\w+)\]:checked$/.exec(sel); return m && radios[m[1]] !== undefined ? { value: radios[m[1]] } : null; },
  querySelectorAll(){ return []; },
  createElement(){ return dummy(); },
  addEventListener(){}, removeEventListener(){}, dispatchEvent(){},
  body: dummy(), documentElement: dummy(), head: dummy(),
};
globalThis.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };
globalThis.CustomEvent = class { constructor(t, i){ this.type = t; this.detail = i?.detail; } };
function fakeDb(){
  const fn = function(){ return fakeDb(); };
  return new Proxy(fn, {
    get(_t, p){
      if(p === 'then') return undefined;
      if(p === 'settings') return () => {};
      if(p === 'onSnapshot') return () => () => {};
      if(['add', 'set', 'update', 'delete', 'commit', 'get'].includes(p)) return () => Promise.resolve({ id: 'x', exists: false, empty: true, docs: [], forEach(){}, data(){ return null; } });
      return fakeDb();
    },
    apply(){ return fakeDb(); },
  });
}
globalThis.firebase = {
  apps: [], initializeApp(){ const a = { name: '[DEFAULT]' }; this.apps.push(a); return a; },
  auth(){ return { currentUser: { uid: 'audit', email: 'boss@example.com' }, onAuthStateChanged(){} }; },
  firestore(){ return fakeDb(); },
};
globalThis.firebase.firestore.FieldValue = { serverTimestamp(){ return null; }, delete(){ return null; } };

const ROOT = fileURLToPath(new URL('..', import.meta.url));
copyFileSync(`${ROOT}src/admin/matching.js`, `${ROOT}src/admin/zz-audit-matching.js`);
appendFileSync(`${ROOT}src/admin/zz-audit-matching.js`, '\nexport { collectUpcomingDraftsFlat, collectUpcomingPendingFlat, persistFormCourses };\n');
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
let fails = 0;
function log(hypothesisId, id, ok, data){
  if(!ok) fails++;
  appendFileSync(LOG, JSON.stringify({ sessionId: '4a22b6', runId: 'audit', hypothesisId, location: 'scripts/change-date-consistency-audit.mjs', message: ok ? 'pass' : 'FAIL', data: { id, ...data }, timestamp: Date.now() }) + '\n');
  console.log(`${ok ? 'OK' : 'NG'} [${hypothesisId}] ${id} ${JSON.stringify(data)}`);
}
try{
  const { S } = await server.ssrLoadModule('/src/admin/state.js');
  const sched = await server.ssrLoadModule('/src/admin/teacher-schedule-tab.js');
  const abs = await server.ssrLoadModule('/src/admin/absences.js');
  const hist = await server.ssrLoadModule('/src/admin/course-history.js');
  const fm = await server.ssrLoadModule('/src/admin/finance-metrics.js');
  const pay = await server.ssrLoadModule('/src/admin/payroll.js');
  const m = await server.ssrLoadModule('/src/admin/zz-audit-matching.js');

  const MON = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'];
  const OCT = ['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26'];
  function reset(){
    Object.assign(S, {
      referenceYearMonth: '2026-11', teacherCapacity: 2, roomCapacity: 12, regularClosedDays: ['日'], holidayAutoDetect: false,
      closedHolidayDates: [], customClosures: [], absences: [], teacherAbsences: [], teacherSubstitutions: [],
      assignments: [], pendingAssignments: [], draftAssignments: [], extraBookings: [], extraHolds: [], payrollLocks: {},
      saveBlocked: false, saveTimer: null, studentFees: {}, programmingMonthlyFee: 0, finIncludeTransport: false,
    });
    S.teachers = [
      { id: 't1', name: '佐藤', loginUid: 'u1', perLessonRate: 1500, dailyTransport: 0, subjects: [{ level: '小学', subject: '算数' }, { level: '小学', subject: '国語' }] },
    ];
    S.teacherSchedules = ['2026-10', '2026-11'].map(ym => ({ id: `s-${ym}`, teacherId: 't1', yearMonth: ym, status: 'submitted',
      days: Object.fromEntries([...OCT, ...MON].filter(d => d.startsWith(ym)).map(d => [d, [{ slot: 5, priority: 'hope' }]])) }));
    S.tuitionGradeRates.basic['小学4'] = 2900;
    S.tuitionGradeRates.advance['小学4'] = 3500;
    S.tuitionGradeRatesOne.basic['小学4'] = 6000;
    S.tuitionGradeRatesOne.advance['小学4'] = 8000;
    S.students = [
      { id: 's1', name: '大内', nameKana: 'おおうち', level: '小学', grade: 4, tuitionCourse: '', courseStartDate: '2026-04-01', freeLessonCount: 0,
        courses: [{ id: 'c1', subject: '算数', weeklyCount: 1, desiredSlots: [{ day: '月', slot: 5 }] }] },
      { id: 's2', name: '山田', nameKana: 'やまだ', level: '小学', grade: 4, tuitionCourse: '', courseStartDate: '2026-04-01', freeLessonCount: 0,
        courses: [{ id: 'c2', subject: '算数', weeklyCount: 1, desiredSlots: [{ day: '月', slot: 5 }] }] },
    ];
  }
  const weekly = (sid, cid, extra) => ({ id: `w-${sid}-${cid}`, studentId: sid, courseId: cid, subject: '算数', day: '月', slot: 5, teacherId: 't1', source: 'manual', ...extra });
  const rev = d => abs.computeDayFinance(d, false).revenue;
  function openEdit(student){
    S.editingStudentId = student.id;
    el('studentNameInput').value = student.name;
    el('studentNameKanaInput').value = student.nameKana;
    radios.studentLevel = student.level;
    radios.studentGrade = String(student.grade);
    radios.studentTuitionCourse = student.tuitionCourse || '';
    radios.studentExamType = '';
    el('studentCourseStartInput').value = student.courseStartDate;
    el('freeLessonToggle').checked = false;
    S.formCourses = JSON.parse(JSON.stringify(student.courses));
  }

  // H1: 確定済みの月より前の日から変えると、確定済みの月まで書き換わる
  reset();
  S.payrollLocks = { '2026-10': { lockedAt: '2026-11-01', rows: [] } };
  S.assignments = [weekly('s1', 'c1')];
  {
    const octBefore = fm.computeMonthFinance(2026, 9).revenue;
    openEdit(S.students[0]);
    radios.studentTuitionCourse = 'advance';
    el('studentChangeFromInput').value = '2026-09-07';
    await m.handleStudentSave();
    const octAfter = fm.computeMonthFinance(2026, 9).revenue;
    log('H1', 'locked-oct-unchanged-when-from-is-sep', octBefore === octAfter, { octBefore, octAfter, course: S.students[0].tuitionCourse, msg: el('studentFormMsg').textContent });
  }
  reset();
  S.payrollLocks = { '2026-10': { lockedAt: '2026-11-01', rows: [] } };
  openEdit(S.students[0]);
  el('studentChangeFromInput').value = '2026-09-07';
  S.formCourses[0].oneToOne = true;
  {
    const block = await m.persistFormCourses();
    log('H1', 'locked-oct-blocks-1on1-from-sep', typeof block === 'string', { block: block || '', saved: S.students[0].courses[0].oneToOne === true });
  }

  // H2: 追加コマの承認待ちが、毎週の行の「取り下げ」に混ざるか
  reset();
  S.pendingAssignments = [{ id: 'x1', studentId: 's1', courseId: 'ex-s1-算数', subject: '算数', day: '月', slot: 5, teacherId: 't1', oneTimeDate: '2026-11-16', extraBookingId: 'b1', extraLineId: 'math', source: 'extra' }];
  {
    const rows = abs.getStudentDateRows(S.students[0], '2026-11-16');
    const exRow = rows.find(r => r.courseId?.startsWith('ex-') || r.course?.id?.startsWith('ex-') || r.existing?.extraBookingId);
    log('H2', 'extra-pending-not-in-weekly-rows', !exRow, { rows: rows.map(r => ({ course: r.course?.id || r.courseId, existing: r.existing?.id || null, isPending: !!r.isPending })) });
  }

  // H3: 月の売上が、日ごとの売上の合計と一致する（切り替え日をまたいでも）
  reset();
  S.assignments = [weekly('s1', 'c1'), weekly('s2', 'c2')];
  S.students[0].tuitionCourse = 'advance';
  S.students[0].tuitionCourseChanges = hist.recordChange([], '', '2026-11-16', 'advance');
  S.students[1].courses[0].oneToOne = false;
  {
    const daySum = MON.reduce((s, d) => s + rev(d), 0);
    const month = fm.computeMonthFinance(2026, 10).revenue;
    const expected = 2900 * 2 + 3500 * 3 + 2900 * 5;
    log('H3', 'month-equals-day-sum-across-change', month === daySum && daySum === expected, { month, daySum, expected });
    const prevMonth = fm.buildMonthFinanceCompare(2026, 10).previous.revenue;
    log('H3', 'previous-month-old-price', prevMonth === 2900 * 8, { prevMonth });
  }

  // H4: 2教科同じコマで、片方を1対1にする日を決めたときの金額
  reset();
  S.students[0].courses = [
    { id: 'c1', subject: '算数', weeklyCount: 1, desiredSlots: [{ day: '月', slot: 5, dualGroupId: 'g1' }] },
    { id: 'c3', subject: '国語', weeklyCount: 1, desiredSlots: [{ day: '月', slot: 5, dualGroupId: 'g1' }] },
  ];
  S.students[0].courses[1].oneToOne = true;
  S.students[0].courses[1].oneToOneChanges = hist.recordChange([], false, '2026-11-16', true);
  S.assignments = [weekly('s1', 'c1', { dualGroupId: 'g1' }), weekly('s1', 'c3', { id: 'w-s1-c3', subject: '国語', dualGroupId: 'g1' })];
  {
    const r = [rev('2026-11-09'), rev('2026-11-16')];
    log('H4', 'dual-pair-1on1-from-date', r[0] === 2900 && r[1] === 6000, { r });
  }

  // H5: 席の数え方が、計算する場所によって食い違わない
  reset();
  S.students[0].courses[0].oneToOne = true;
  S.students[0].courses[0].oneToOneChanges = hist.recordChange([], false, '2026-11-16', true);
  S.assignments = [weekly('s1', 'c1')];
  {
    const probe = d => ({
      seat: sched.teacherSeatTextOnDate('t1', d, 5),
      onDate: sched.teacherSlotHasOneToOneOnDate('t1', d, 5, 's2'),
      load: abs.computeTeacherOpenings(d, 't1').rows.find(r => Number(r.slot?.id ?? r.slot) === 5) || null,
      cand: sched.buildCandidateInfo('s2', 'c2', '小学', '算数', '月', 5, S.teachers[0], d).remaining,
      subs: abs.findSubstituteCandidatesForStudent(d, 5, 'tX', 's2', '算数').map(t => t.id),
    });
    const a = probe('2026-11-09');
    const b = probe('2026-11-16');
    log('H5', 'seat-before-change', a.seat === '1/2' && a.onDate === false && a.cand === 1, a);
    log('H5', 'seat-after-change', b.seat === '1/1' && b.onDate === true && b.cand === 0, b);
  }

  // H6: 講師の給与は、学年・コース・1対1を変えても変わらない
  reset();
  S.assignments = [weekly('s1', 'c1')];
  {
    const p0 = pay.computeLiveMonthPayroll(2026, 10, 0).find(r => r.teacherId === 't1')?.lessonPay;
    S.students[0].grade = 5;
    S.students[0].gradeChanges = hist.recordChange([], '小学:4', '2026-11-16', '小学:5');
    S.students[0].tuitionCourse = 'advance';
    S.students[0].tuitionCourseChanges = hist.recordChange([], '', '2026-11-16', 'advance');
    S.students[0].courses[0].oneToOne = true;
    S.students[0].courses[0].oneToOneChanges = hist.recordChange([], false, '2026-11-16', true);
    const p1 = pay.computeLiveMonthPayroll(2026, 10, 0).find(r => r.teacherId === 't1')?.lessonPay;
    log('H6', 'teacher-pay-unchanged', p0 === p1 && p1 === 7500, { p0, p1 });
  }

  // H7: 無料コマは、切り替え日があっても数がずれない
  reset();
  S.students[0].freeLessonCount = 2;
  S.students[0].courseStartDate = '2026-11-01';
  S.students[0].tuitionCourse = 'advance';
  S.students[0].tuitionCourseChanges = hist.recordChange([], '', '2026-11-16', 'advance');
  S.assignments = [weekly('s1', 'c1')];
  {
    const r = MON.map(rev);
    log('H7', 'free-lessons-then-dated-price', JSON.stringify(r) === JSON.stringify([0, 0, 3500, 3500, 3500]), { r });
  }

  // H8: 振替の授業は、振替先の日の料金
  reset();
  S.students[0].tuitionCourse = 'advance';
  S.students[0].tuitionCourseChanges = hist.recordChange([], '', '2026-11-16', 'advance');
  S.assignments = [weekly('s1', 'c1')];
  S.absences = [{ id: 'ab1', studentId: 's1', courseId: 'c1', subject: '算数', day: '月', slot: 5, date: '2026-11-09',
    makeup: { date: '2026-11-17', slot: 5, teacherId: 't1' } }];
  S.assignments.push({ id: 'mk1', studentId: 's1', courseId: 'c1', subject: '算数', day: '火', slot: 5, teacherId: 't1', oneTimeDate: '2026-11-17', source: 'makeup' });
  {
    const r = { nov9: rev('2026-11-09'), nov17: rev('2026-11-17') };
    log('H8', 'makeup-priced-on-makeup-date', r.nov9 === 0 && r.nov17 === 3500, r);
  }

  // H9: 追加コマの見込み金額と、確定したあとの売上
  reset();
  const extraMod = await server.ssrLoadModule('/src/admin/extra-lessons.js');
  S.students[0].tuitionCourse = 'advance';
  S.students[0].tuitionCourseChanges = hist.recordChange([], '', '2026-11-16', 'advance');
  S.assignments = [{ id: 'x1', studentId: 's1', courseId: 'ex-s1-算数', subject: '算数', day: '月', slot: 5, teacherId: 't1', oneTimeDate: '2026-11-09', extraBookingId: 'b1', extraLineId: 'math', source: 'extra' }];
  {
    const actual = rev('2026-11-09');
    log('H9', 'extra-actual-uses-date-price', actual === 2900, { actual });
  }

  // H11: 1対1が先の日からのとき、毎週の枠で隣に置く
  reset();
  S.students[0].courses[0].oneToOne = true;
  S.students[0].courses[0].oneToOneChanges = hist.recordChange([], false, '2026-11-16', true);
  S.assignments = [weekly('s1', 'c1')];
  {
    const r = await sched.confirmAssignment('s2', 'c2', '算数', '月', 5, 't1', 'manual', {});
    log('H11', 'weekly-next-to-future-1on1-blocked', r.ok === false, { r });
  }

  // H18: 上の送信ボタンの確認件数と、実際に送る件数
  reset();
  S.draftAssignments = [
    { id: 'xn', studentId: 's1', courseId: 'ex-s1-算数', subject: '算数', day: '月', slot: 5, teacherId: 't1', oneTimeDate: '2026-11-16', extraBookingId: 'b1', extraLineId: 'math', source: 'extra' },
    { id: 'xd', studentId: 's1', courseId: 'ex-s1-算数', subject: '算数', day: '月', slot: 5, teacherId: 't1', oneTimeDate: '2026-12-07', extraBookingId: 'b1', extraLineId: 'math', source: 'extra' },
  ];
  {
    const shown = m.collectUpcomingDraftsFlat().length;
    const r = await sched.sendDraftAssignments();
    log('H18', 'top-send-count-matches-confirm', shown === r.sent, { shown, sent: r.sent, left: S.draftAssignments.map(a => a.id) });
  }

  // H19: 毎週の仮決めの「依頼しました」の件数が、確認の件数と同じ数え方
  reset();
  S.teachers.push({ id: 't3', name: '田中', loginUid: 'u3', perLessonRate: 1500, subjects: [{ level: '小学', subject: '算数' }] });
  S.draftAssignments = [weekly('s1', 'c1'), weekly('s2', 'c2', { teacherId: 't3' })];
  {
    const items = m.collectUpcomingDraftsFlat();
    const r = await sched.sendDraftAssignments();
    const sentLessons = items.filter(i => r.sentIds.includes(i.assignment.id)).length;
    log('H19', 'sent-message-counts-lessons-like-confirm', items.length === 10 && sentLessons === 5,
      { shown: items.length, sentLessons, sentIds: r.sentIds, kept: S.draftAssignments.map(a => a.id) });
  }

  console.log(`audit fails=${fails}`);
}finally{
  await server.close();
  rmSync(`${ROOT}src/admin/zz-audit-matching.js`, { force: true });
}
