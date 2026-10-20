/**
 * 1対1の本実装と、その周りの授業の置き方・金額を、実際の関数で確かめる。
 * 使い方: node scripts/one-to-one-cases.mjs
 */
import { createServer } from 'vite';

function dummy(){
  const fn = function(){ return dummy(); };
  return new Proxy(fn, {
    get(_t, prop){
      if(prop === 'then') return undefined;
      if(prop === Symbol.toPrimitive) return () => '';
      if(prop === 'length') return 0;
      if(prop === 'nodeType') return 1;
      if(prop === 'style') return {};
      if(prop === 'classList') return { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
      if(prop === 'dataset') return {};
      if(prop === 'children' || prop === 'childNodes') return [];
      return dummy();
    },
    apply(){ return dummy(); },
  });
}

if(!globalThis.window) globalThis.window = globalThis;
globalThis.document = {
  getElementById(){ return dummy(); },
  querySelector(){ return null; },
  querySelectorAll(){ return []; },
  createElement(){ return dummy(); },
  addEventListener(){},
  removeEventListener(){},
  body: dummy(),
  documentElement: dummy(),
  head: dummy(),
};
globalThis.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };

globalThis.firebase = {
  apps: [],
  initializeApp(){
    const app = { name: '[DEFAULT]' };
    this.apps.push(app);
    return app;
  },
  auth(){ return { currentUser: { uid: 'case-admin' } }; },
  firestore(){
    return {
      settings(){},
      collection(){
        return { add(){ return Promise.resolve({ id: 'case' }); } };
      },
    };
  },
};
globalThis.firebase.firestore.FieldValue = { serverTimestamp(){ return null; } };

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
});

const stateMod = await server.ssrLoadModule('/src/admin/state.js');
const sched = await server.ssrLoadModule('/src/admin/teacher-schedule-tab.js');
const abs = await server.ssrLoadModule('/src/admin/absences.js');
const oto = await server.ssrLoadModule('/src/admin/one-to-one.js');
const match = await server.ssrLoadModule('/src/admin/match-slot-status.js');
const feePreview = await server.ssrLoadModule('/src/admin/student-fee-preview.js');
const printSheet = await server.ssrLoadModule('/src/admin/print-sheet.js');
const { S } = stateMod;

const DATE = '2026-10-19';

function post(){}

const results = [];
function check(id, hypothesisId, ok, detail){
  results.push({ id, hypothesisId, ok, detail });
  post(hypothesisId, id, { ok, ...detail });
  const mark = ok ? 'OK' : 'NG';
  console.log(`${mark} ${id} ${JSON.stringify(detail)}`);
}

function reset(){
  S.referenceYearMonth = '2026-10';
  S.teacherCapacity = 2;
  S.roomCapacity = 12;
  S.regularClosedDays = ['日'];
  S.holidayAutoDetect = false;
  S.closedHolidayDates = [];
  S.customClosures = [];
  S.programmingMonthlyFee = 8000;
  S.shortLessonPayPercent = 50;
  S.finIncludeTransport = false;
  S.absences = [];
  S.teacherAbsences = [];
  S.teacherSubstitutions = [];
  S.assignments = [];
  S.pendingAssignments = [];
  S.draftAssignments = [];
  S.teachers = [{
    id: 't1',
    name: '講師A',
    perLessonRate: 1500,
    dailyTransport: 0,
    subjects: [
      { level: '中学', subject: '国語' },
      { level: '中学', subject: '数学' },
      { level: '中学', subject: '英語' },
      { level: '中学', subject: 'プログラミング' },
      { level: '小学', subject: '国語' },
    ],
  }];
  S.teacherSchedules = [{
    id: 'tsch-case',
    teacherId: 't1',
    yearMonth: '2026-10',
    status: 'submitted',
    days: Object.fromEntries(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26', '2026-10-20'].map(date=>([
      date,
      [{ slot: 4, priority: 'hope' }, { slot: 5, priority: 'hope' }],
    ]))),
  }];
  S.students = [];
  S.tuitionGradeRates.basic['中学1'] = 3900;
  S.tuitionGradeRates.basic['小学2'] = 2900;
  S.tuitionGradeRatesOne.basic['中学1'] = 6000;
  S.tuitionGradeRatesOne.basic['小学2'] = 5000;
  S.tuitionGradeRatesShort.basic['小学2'] = 1500;
  S.tuitionGradeRatesShortOne.basic['小学2'] = 2200;
}

function student(id, course, extra){
  return {
    id,
    name: id,
    level: extra?.level || '中学',
    grade: extra?.grade || 1,
    tuitionCourse: 'basic',
    courseStartDate: extra?.courseStartDate || '2026-04-01',
    freeLessonCount: extra?.freeLessonCount || 0,
    courses: [course],
  };
}

function course(id, subject, oneToOne, slots){
  const row = { id, subject, desiredSlots: slots || [{ day: '月', slot: 4 }] };
  if(oneToOne) row.oneToOne = true;
  return row;
}

function put(studentId, courseId, subject, extra){
  S.assignments.push({
    id: `asg-${studentId}-${courseId}`,
    studentId,
    courseId,
    subject,
    day: '月',
    slot: 4,
    teacherId: 't1',
    source: 'manual',
    ...extra,
  });
}

function finance(){
  return abs.computeDayFinance(DATE, false);
}

reset();
const day = abs.getEffectiveDayAssignments ? null : null;
void day;

// H8 印のない教科は、これまでの2人用の金額
reset();
S.students = [student('a', course('ca', '国語', false))];
put('a', 'ca', '国語');
{
  const fin = finance();
  check('印なしは2人用の金額', 'H8', fin.revenue === 3900 && fin.lessonCount === 1, { revenue: fin.revenue, lessonCost: fin.lessonCost });
}

// H8b 1対1は新しい金額
reset();
S.students = [student('a', course('ca', '国語', true))];
put('a', 'ca', '国語');
{
  const fin = finance();
  check('1対1は1対1の金額', 'H8', fin.revenue === 6000, { revenue: fin.revenue, lessonCost: fin.lessonCost });
}

// H10 40分の1対1は40分の表
reset();
S.students = [student('a', course('ca', '国語', true, [{ day: '月', slot: 4, half: 'early' }]), { level: '小学', grade: 2 })];
put('a', 'ca', '国語', { half: 'early' });
{
  const fin = finance();
  check('40分の1対1は40分の金額', 'H10', fin.revenue === 2200 && fin.lessonCost === 750, { revenue: fin.revenue, lessonCost: fin.lessonCost });
}

// H10 対照: 40分の2人用
reset();
S.students = [student('a', course('ca', '国語', false, [{ day: '月', slot: 4, half: 'early' }]), { level: '小学', grade: 2 })];
put('a', 'ca', '国語', { half: 'early' });
{
  const fin = finance();
  check('40分の2人用は40分の今までの金額', 'H10', fin.revenue === 1500 && fin.lessonCost === 750, { revenue: fin.revenue, lessonCost: fin.lessonCost });
}

// H5 講師料は1人でも2人でも同じ
reset();
S.students = [
  student('a', course('ca', '国語', false)),
  student('b', course('cb', '数学', false)),
];
put('a', 'ca', '国語');
put('b', 'cb', '数学');
const pairPay = finance();
reset();
S.students = [student('a', course('ca', '国語', true))];
put('a', 'ca', '国語');
const onePay = finance();
check('講師料は1対1でも2人授業でも同じ', 'H5', pairPay.lessonCost === 1500 && onePay.lessonCost === 1500 && pairPay.lessonCost === onePay.lessonCost, {
  pairPay: pairPay.lessonCost,
  onePay: onePay.lessonCost,
  pairRevenue: pairPay.revenue,
  oneRevenue: onePay.revenue,
});

// H4 2教科のうち片方が1対1なら、90分で1回だけ1対1の金額
reset();
{
  const g = 'dg1';
  S.students = [{
    id: 'a',
    name: 'a',
    level: '中学',
    grade: 1,
    tuitionCourse: 'basic',
    courseStartDate: '2026-04-01',
    courses: [
      { id: 'cMath', subject: '数学', desiredSlots: [{ day: '月', slot: 4, dualGroupId: g }] },
      { id: 'cKokugo', subject: '国語', oneToOne: true, desiredSlots: [{ day: '月', slot: 4, dualGroupId: g, dualRole: 'first' }] },
    ],
  }];
  put('a', 'cMath', '数学', { dualGroupId: g });
  put('a', 'cKokugo', '国語', { dualGroupId: g });
  const fin = finance();
  check('2教科の片方1対1は1回だけ1対1の金額', 'H4', fin.revenue === 6000 && fin.lessonCount === 1 && fin.lessonCost === 1500, {
    revenue: fin.revenue,
    lessonCount: fin.lessonCount,
    lessonCost: fin.lessonCost,
  });
}

// H6 プログラミングは1対1でも月額のまま（その日の授業料は足さない）
reset();
S.students = [student('p', course('cp', 'プログラミング', true))];
put('p', 'cp', 'プログラミング');
{
  const fin = finance();
  const ids = abs.getMonthlyFeeStudentIds(2026, 9);
  const listed = ids.has('p');
  check('プログラミングの1対1はその日の授業料を足さない', 'H6', fin.revenue === 0 && fin.lessonCost === 1500 && listed, {
    revenue: fin.revenue,
    lessonCost: fin.lessonCost,
    monthlyListed: listed,
  });
}

// 体験は0円、講師料は残る
reset();
S.students = [student('a', course('ca', '国語', true), { courseStartDate: DATE, freeLessonCount: 1 })];
put('a', 'ca', '国語');
{
  const fin = finance();
  check('体験の1対1は授業料0円で講師料は残る', 'H-free', fin.revenue === 0 && fin.lessonCost === 1500, { revenue: fin.revenue, lessonCost: fin.lessonCost });
}

// H9 教室の席は1対1でも1人分
reset();
S.students = [student('a', course('ca', '国語', true))];
put('a', 'ca', '国語');
{
  const roomDate = sched.countRoomSlotOnDate(DATE, 4);
  const roomLoad = abs.countRoomLoadOnDate(DATE, 4);
  const seat = sched.teacherSeatTextOnDate('t1', DATE, 4);
  check('1対1の生徒は教室の席を1つだけ使う', 'H9', roomDate === 1 && roomLoad === 1, { roomDate, roomLoad, seat });
  check('1対1の表示は1/1', 'H1', seat === '1/1', { seat });
}
reset();
S.students = [student('a', course('ca', '国語', false))];
put('a', 'ca', '国語');
{
  const seat = sched.teacherSeatTextOnDate('t1', DATE, 4);
  check('2人用で1人の表示は1/2', 'H1', seat === '1/2', { seat });
}

// H1 隣に1対1がいる日は、もう1人置けない
reset();
S.students = [
  student('a', course('ca', '国語', true)),
  student('b', course('cb', '数学', false)),
];
put('a', 'ca', '国語');
{
  const result = sched.confirmAssignment('b', 'cb', '数学', '月', 4, 't1', 'manual', { dateStr: DATE });
  check('1対1の隣にその日は置けない', 'H1', result.ok === false, { ok: result.ok, msg: result.msg || '' });
}

// H2 すでに誰かいる日へ、1対1は置けない
reset();
S.students = [
  student('a', course('ca', '国語', false)),
  student('b', course('cb', '数学', true)),
];
put('a', 'ca', '国語');
{
  const result = sched.confirmAssignment('b', 'cb', '数学', '月', 4, 't1', 'manual', { dateStr: DATE });
  check('人がいるコマに1対1は置けない', 'H2', result.ok === false, { ok: result.ok, msg: result.msg || '' });
}

// H3 前半の1対1は、後半の別の生徒を邪魔しない
reset();
S.students = [
  student('a', course('ca', '国語', true, [{ day: '月', slot: 4, half: 'early' }])),
  student('b', course('cb', '数学', false, [{ day: '月', slot: 4, half: 'late' }])),
];
put('a', 'ca', '国語', { half: 'early' });
{
  const late = sched.confirmAssignment('b', 'cb', '数学', '月', 4, 't1', 'manual', { dateStr: DATE, half: 'late' });
  check('前半1対1の後半には別の生徒を置ける', 'H3', late.ok === true, { ok: late.ok, msg: late.msg || '' });
}
reset();
S.students = [
  student('a', course('ca', '国語', true, [{ day: '月', slot: 4, half: 'early' }])),
  student('b', course('cb', '数学', false)),
];
put('a', 'ca', '国語', { half: 'early' });
{
  const full = sched.confirmAssignment('b', 'cb', '数学', '月', 4, 't1', 'manual', { dateStr: DATE });
  check('前半1対1がある90分は置けない', 'H3', full.ok === false, { ok: full.ok, msg: full.msg || '' });
}
reset();
S.students = [
  student('a', course('ca', '国語', true, [{ day: '月', slot: 4, half: 'early' }])),
  student('b', course('cb', '数学', false, [{ day: '月', slot: 4, half: 'early' }])),
];
put('a', 'ca', '国語', { half: 'early' });
{
  const early = sched.confirmAssignment('b', 'cb', '数学', '月', 4, 't1', 'manual', { dateStr: DATE, half: 'early' });
  check('前半1対1の前半には置けない', 'H3', early.ok === false, { ok: early.ok, msg: early.msg || '' });
}

// 2人用は今までどおり2人まで。3人目は不可
reset();
S.students = [
  student('a', course('ca', '国語', false)),
  student('b', course('cb', '数学', false)),
  student('c', course('cc', '英語', false)),
];
put('a', 'ca', '国語');
{
  const second = sched.confirmAssignment('b', 'cb', '数学', '月', 4, 't1', 'manual', { dateStr: DATE });
  const third = sched.confirmAssignment('c', 'cc', '英語', '月', 4, 't1', 'manual', { dateStr: DATE });
  const seat = sched.teacherSeatTextOnDate('t1', DATE, 4);
  check('2人用は2人までで3人目は不可', 'H1', second.ok === true && third.ok === false && seat === '2/2', {
    second: second.ok,
    third: third.ok,
    seat,
    thirdMsg: third.msg || '',
  });
}

// 毎週の担当も、提出済みなら1対1の隣は不可
reset();
S.students = [
  student('a', course('ca', '国語', true)),
  student('b', course('cb', '数学', false)),
];
put('a', 'ca', '国語');
{
  const result = sched.confirmAssignment('b', 'cb', '数学', '月', 4, 't1', 'manual', { dateStr: DATE, recurring: true });
  check('毎週の担当でも1対1の隣は不可', 'H1', result.ok === false, { ok: result.ok, msg: result.msg || '' });
}

// H7 隣がいる教科は1対1にできない
reset();
S.students = [
  student('a', course('ca', '国語', false)),
  student('b', course('cb', '数学', false)),
];
put('a', 'ca', '国語');
put('b', 'cb', '数学');
{
  const msg = oto.oneToOneShareBlockMessage('a', S.students[0].courses[0]);
  check('隣がいる教科は1対1にできない', 'H7', msg.includes('先に隣の生徒を外してください'), { blocked: !!msg });
}
reset();
S.students = [student('a', course('ca', '国語', false))];
put('a', 'ca', '国語');
{
  const msg = oto.oneToOneShareBlockMessage('a', S.students[0].courses[0]);
  check('隣がいない教科は1対1にできる', 'H7', msg === '', { blocked: !!msg });
}
reset();
S.students = [
  student('a', course('ca', '国語', false, [{ day: '月', slot: 4, half: 'early' }])),
  student('b', course('cb', '数学', false, [{ day: '月', slot: 4, half: 'late' }])),
];
put('a', 'ca', '国語', { half: 'early' });
put('b', 'cb', '数学', { half: 'late' });
{
  const msg = oto.oneToOneShareBlockMessage('a', S.students[0].courses[0]);
  check('前半と後半が違うなら1対1にできる', 'H7', msg === '', { blocked: !!msg });
}
reset();
S.students = [
  student('a', course('ca', '国語', false)),
  student('b', course('cb', '数学', false)),
];
put('a', 'ca', '国語');
S.draftAssignments.push({
  id: 'draft-b',
  studentId: 'b',
  courseId: 'cb',
  subject: '数学',
  day: '月',
  slot: 4,
  teacherId: 't1',
  source: 'manual',
});
{
  const msg = oto.oneToOneShareBlockMessage('a', S.students[0].courses[0]);
  check('仮決めの隣がいる教科も1対1にできない', 'H7', msg.includes('先に隣の生徒を外してください'), { blocked: !!msg });
}

// 振替: 1対1のコマへは入れない。1対1の生徒を、すでに人がいるコマへも入れない
reset();
S.students = [
  student('a', course('ca', '国語', true)),
  student('b', course('cb', '数学', false)),
];
put('a', 'ca', '国語');
S.absences = [{ id: 'ab1', studentId: 'b', courseId: 'cb', subject: '数学', day: '火', slot: 5, date: '2026-10-13', status: 'pending', makeup: null }];
{
  const result = await abs.confirmMakeup('ab1', DATE, 4, 't1');
  check('振替先が1対1で埋まっていたら入れない', 'H1', result.ok === false, { ok: result.ok, msg: result.msg || '' });
}
reset();
S.students = [
  student('a', course('ca', '国語', false)),
  student('b', course('cb', '数学', true)),
];
put('a', 'ca', '国語');
S.absences = [{ id: 'ab2', studentId: 'b', courseId: 'cb', subject: '数学', day: '火', slot: 5, date: '2026-10-13', status: 'pending', makeup: null }];
{
  const result = await abs.confirmMakeup('ab2', DATE, 4, 't1');
  check('1対1の振替は人がいるコマへ入れない', 'H2', result.ok === false, { ok: result.ok, msg: result.msg || '' });
}

// 2教科の担当決定も、隣がいたら1対1では置けない
reset();
{
  const g = 'dg2';
  const kokugo = { id: 'cKokugo', subject: '国語', oneToOne: true, desiredSlots: [{ day: '月', slot: 4, dualGroupId: g, dualRole: 'first' }] };
  const math = { id: 'cMath', subject: '数学', desiredSlots: [{ day: '月', slot: 4, dualGroupId: g }] };
  S.students = [
    student('a', course('ca', '英語', false)),
    { id: 'b', name: 'b', level: '中学', grade: 1, tuitionCourse: 'basic', courseStartDate: '2026-04-01', courses: [kokugo, math] },
  ];
  put('a', 'ca', '英語');
  const result = sched.confirmDualAssignment('b', {
    dualGroupId: g,
    entries: [{ course: kokugo }, { course: math }],
  }, '月', 4, 't1', 'manual', { dateStr: DATE });
  check('1対1の2教科は隣がいる日に置けない', 'H2', result.ok === false, { ok: result.ok, msg: result.msg || '' });
}

// 同じ講の前半が1対1、後半が2人用。金額は別々、講師料は90分分の1回
reset();
S.students = [
  student('a', course('ca', '国語', true, [{ day: '月', slot: 4, half: 'early' }]), { level: '小学', grade: 2 }),
  student('b', course('cb', '数学', false, [{ day: '月', slot: 4, half: 'late' }]), { level: '小学', grade: 2 }),
];
put('a', 'ca', '国語', { half: 'early' });
put('b', 'cb', '数学', { half: 'late' });
{
  const fin = finance();
  check('前半1対1と後半2人用は金額を混ぜない', 'H4', fin.revenue === 3700 && fin.lessonCost === 1500 && fin.lessonCount === 2, {
    revenue: fin.revenue,
    lessonCost: fin.lessonCost,
    lessonCount: fin.lessonCount,
  });
}

// 候補の「組める」も、1対1の隣は空きにしない
reset();
S.students = [student('a', course('ca', '国語', true))];
put('a', 'ca', '国語');
{
  const blocked = match.analyzePendingMatchSlot(
    { id: 'new', level: '中学' },
    { id: 'cnew', subject: '数学' },
    '月', 4, '2026-10', DATE,
  );
  const incoming = match.analyzePendingMatchSlot(
    { id: 'new', level: '中学' },
    { id: 'cnew', subject: '数学', oneToOne: true },
    '月', 4, '2026-10', DATE,
  );
  check('1対1がいる日は組める人数が0', 'H1', blocked.availableCount === 0 && incoming.availableCount === 0, {
    regular: blocked.availableCount,
    one: incoming.availableCount,
    regularStatus: blocked.status,
  });
}
reset();
{
  const open = match.analyzePendingMatchSlot(
    { id: 'new', level: '中学' },
    { id: 'cnew', subject: '国語', oneToOne: true },
    '月', 4, '2026-10', DATE,
  );
  check('空いている日の1対1は組める', 'H1', open.availableCount === 1 && open.status === 'ready', {
    available: open.availableCount,
    status: open.status,
  });
}
reset();
S.students = [student('a', course('ca', '国語', true, [{ day: '月', slot: 4, half: 'early' }]))];
put('a', 'ca', '国語', { half: 'early' });
{
  const late = match.analyzePendingMatchSlot(
    { id: 'new', level: '中学' },
    { id: 'cnew', subject: '数学' },
    '月', 4, '2026-10', DATE, 'late',
  );
  const early = match.analyzePendingMatchSlot(
    { id: 'new', level: '中学' },
    { id: 'cnew', subject: '数学' },
    '月', 4, '2026-10', DATE, 'early',
  );
  check('前半1対1でも後半は組める', 'H3', late.availableCount === 1 && early.availableCount === 0, {
    late: late.availableCount,
    early: early.availableCount,
  });
}
reset();
S.students = [student('a', course('ca', '国語', true))];
put('a', 'ca', '国語');
{
  const openTeachers = match.countOpenTeachersForLevel('中学', '月', 4, '2026-10');
  check('1対1で埋まっている講師は空き人数に入らない', 'H1', openTeachers === 0, { openTeachers });
}

// 振替候補に、1対1で埋まっている講師を出さない
reset();
S.students = [
  student('a', course('ca', '国語', true)),
  student('b', course('cb', '数学', false)),
];
put('a', 'ca', '国語');
{
  const rows = abs.findMakeupCandidatesOnDate('b', '中学', '数学', DATE);
  const slot4 = rows.filter(r=> r.slot.id === 4 && (r.half === 'full' || !r.half));
  const teacherIds = slot4.flatMap(r=> r.candidates.map(c=> c.teacher.id));
  check('振替候補に1対1の講師を出さない', 'H1', !teacherIds.includes('t1'), { teacherIds });
}

// 代講: 1対1で埋まっている講師は候補にしない。2人用で1人だけなら候補に残す
reset();
S.teachers.push({
  id: 't2',
  name: '講師B',
  perLessonRate: 1600,
  dailyTransport: 0,
  subjects: [{ level: '中学', subject: '数学' }],
});
S.teachers.push({
  id: 'tAbsent',
  name: '講師C',
  perLessonRate: 1400,
  dailyTransport: 0,
  subjects: [{ level: '中学', subject: '数学' }],
});
S.students = [
  student('a', course('ca', '国語', true)),
  student('b', course('cb', '数学', false)),
  student('c', course('cc', '数学', false)),
];
put('a', 'ca', '国語');
S.assignments[0].teacherId = 't2';
put('b', 'cb', '数学');
S.assignments[1].teacherId = 'tAbsent';
put('c', 'cc', '数学');
S.assignments[2].teacherId = 't1';
{
  const cands = abs.findSubstituteCandidatesForStudent(DATE, 4, 'tAbsent', 'b', '数学');
  const ids = cands.map(c=> c.id);
  check('代講は1対1の講師を外し、2人用の空きは残す', 'H2', ids.includes('t1') && !ids.includes('t2'), { ids });
}
S.students[1].courses[0].oneToOne = true;
{
  const cands = abs.findSubstituteCandidatesForStudent(DATE, 4, 'tAbsent', 'b', '数学');
  const ids = cands.map(c=> c.id);
  check('1対1の生徒の代講は、すでに人がいる講師へ出さない', 'H2', !ids.includes('t1') && !ids.includes('t2'), { ids });
}

function box(){
  return { value: '', checked: false, innerHTML: '' };
}
const boxes = {};
document.getElementById = (id)=>{
  if(!boxes[id]) boxes[id] = box();
  return boxes[id];
};
document.querySelector = (sel)=>{
  if(String(sel).includes('studentLevel')) return { value: '中学' };
  if(String(sel).includes('studentGrade')) return { value: '1' };
  if(String(sel).includes('studentTuitionCourse')) return { value: 'basic' };
  return null;
};

// 登録画面の月額と、印刷の金額
reset();
S.formCourses = [{ id: 'ca', subject: '国語', oneToOne: true, desiredSlots: [{ day: '月', slot: 4 }] }];
feePreview.renderStudentFeePreview();
{
  const html = boxes.studentFeeTables?.innerHTML || '';
  check('登録画面の月額は1対1の金額×4', 'H8', html.includes('授業料</th><td>24,000円') && !html.includes('15,600円'), {
    has24000: html.includes('授業料</th><td>24,000円'),
    has15600: html.includes('15,600円'),
  });
}
reset();
S.formCourses = [{ id: 'cp', subject: 'プログラミング', oneToOne: true, desiredSlots: [{ day: '月', slot: 4 }] }];
boxes.studentFeeTables = box();
feePreview.renderStudentFeePreview();
{
  const html = boxes.studentFeeTables?.innerHTML || '';
  check('登録画面のプログラミングは月額のまま', 'H6', html.includes('授業料</th><td>0円') && html.includes('プログラミング</th><td>8,000円'), {
    hasTuition0: html.includes('授業料</th><td>0円'),
    has8000: html.includes('8,000円'),
    has24000: html.includes('24,000円'),
  });
}
reset();
S.students = [student('a', course('ca', '国語', true))];
put('a', 'ca', '国語');
{
  const data = printSheet.collectPrintSheetData(S.students[0]);
  const label = (data.cells['月-4'] || []).join(' ');
  check('印刷の授業料と表記は1対1', 'H8', label.includes('国語 1対1') && data.tuitionMonthly === 24000, {
    label,
    tuitionMonthly: data.tuitionMonthly,
    note: data.durationNote,
  });
}

const failed = results.filter(r=> !r.ok);
await server.close();
console.log(`\n${results.length - failed.length}/${results.length} 通り`);
if(failed.length){
  console.log('失敗: ' + failed.map(r=> r.id).join(' / '));
  process.exitCode = 1;
}
