/**
 * 追加コマの仮決め送信と、コース・1対1を途中で変える日の扱いを、実際の関数で確かめる。
 * 使い方: node scripts/course-change-and-extra-send-check.mjs
 */
import { createServer } from 'vite';
import { copyFileSync, appendFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function dummy(){
  const fn = function(){ return dummy(); };
  return new Proxy(fn, {
    get(_t, prop){
      if(prop === 'then' || typeof prop === 'symbol' && prop !== Symbol.toPrimitive) return undefined;
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

const elements = new Map();
function el(id){
  if(!elements.has(id)){
    const store = { value: '', textContent: '', innerHTML: '', checked: false, hidden: false, disabled: false };
    elements.set(id, new Proxy(store, {
      get(t, prop){
        if(prop in t) return t[prop];
        if(prop === 'then') return undefined;
        if(prop === 'style') return (t.style ||= {});
        if(prop === 'classList') return { add(){}, remove(){}, toggle(){}, contains(){ return false; } };
        if(prop === 'dataset') return {};
        return dummy();
      },
      set(t, prop, v){ t[prop] = v; return true; },
    }));
  }
  return elements.get(id);
}
const radios = {};

if(!globalThis.window) globalThis.window = globalThis;
globalThis.window.scrollTo = () => {};
globalThis.document = {
  getElementById(id){ return el(id); },
  querySelector(sel){
    const m = /^input\[name=(\w+)\]:checked$/.exec(sel);
    if(m) return radios[m[1]] === undefined ? null : { value: radios[m[1]] };
    return null;
  },
  querySelectorAll(){ return []; },
  createElement(){ return dummy(); },
  addEventListener(){},
  removeEventListener(){},
  dispatchEvent(){},
  body: dummy(),
  documentElement: dummy(),
  head: dummy(),
};
globalThis.localStorage = { getItem(){ return null; }, setItem(){}, removeItem(){} };
globalThis.CustomEvent = class { constructor(t, i){ this.type = t; this.detail = i?.detail; } };

const savedPayloads = [];
function fakeDb(path = ''){
  const fn = function(){ return fakeDb(path); };
  return new Proxy(fn, {
    get(_t, prop){
      if(prop === 'then') return undefined;
      if(prop === 'settings') return () => {};
      if(prop === 'onSnapshot') return () => () => {};
      if(prop === 'set') return (data) => { savedPayloads.push({ path, data }); return Promise.resolve(); };
      if(['add', 'update', 'delete', 'commit', 'get'].includes(prop)){
        return () => Promise.resolve({ id: 'case', exists: false, empty: true, docs: [], size: 0, data(){ return null; }, forEach(){} });
      }
      if(prop === 'collection' || prop === 'doc') return (name) => fakeDb(`${path}/${name || ''}`);
      return fakeDb(path);
    },
    apply(){ return fakeDb(path); },
  });
}
globalThis.firebase = {
  apps: [],
  initializeApp(){ const app = { name: '[DEFAULT]' }; this.apps.push(app); return app; },
  auth(){ return { currentUser: { uid: 'case-admin', email: 'boss@example.com' }, onAuthStateChanged(){} }; },
  firestore(){ return fakeDb(); },
};
globalThis.firebase.firestore.FieldValue = { serverTimestamp(){ return null; }, delete(){ return null; } };

const ROOT = fileURLToPath(new URL('..', import.meta.url));
copyFileSync(`${ROOT}src/admin/matching.js`, `${ROOT}src/admin/zz-check-matching.js`);
appendFileSync(`${ROOT}src/admin/zz-check-matching.js`, '\nexport { collectUpcomingDraftsFlat, collectUpcomingPendingFlat, extraLessonDeps, withOneToOneChanges, persistFormCourses };\n');
copyFileSync(`${ROOT}src/admin/extra-lessons.js`, `${ROOT}src/admin/zz-check-extra.js`);
appendFileSync(`${ROOT}src/admin/zz-check-extra.js`, '\nexport { detailHtml, sendBookingDrafts };\n');

const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'error' });
let failed = 0;
try{
  const { S } = await server.ssrLoadModule('/src/admin/state.js');
  const sched = await server.ssrLoadModule('/src/admin/teacher-schedule-tab.js');
  const abs = await server.ssrLoadModule('/src/admin/absences.js');
  const oto = await server.ssrLoadModule('/src/admin/one-to-one.js');
  const hist = await server.ssrLoadModule('/src/admin/course-history.js');
  const pay = await server.ssrLoadModule('/src/admin/payroll.js');
  const m = await server.ssrLoadModule('/src/admin/zz-check-matching.js');
  const ex = await server.ssrLoadModule('/src/admin/zz-check-extra.js');

  const results = [];
  const check = (id, ok, detail) => {
    results.push(ok);
    if(!ok) failed++;
    console.log(`${ok ? 'OK' : 'NG'} ${id} ${JSON.stringify(detail)}`);
  };

  const MON = ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30'];
  function reset(){
    S.referenceYearMonth = '2026-11';
    S.teacherCapacity = 2;
    S.roomCapacity = 12;
    S.regularClosedDays = ['日'];
    S.holidayAutoDetect = false;
    S.closedHolidayDates = [];
    S.customClosures = [];
    S.absences = [];
    S.teacherAbsences = [];
    S.teacherSubstitutions = [];
    S.assignments = [];
    S.pendingAssignments = [];
    S.draftAssignments = [];
    S.extraBookings = [];
    S.extraHolds = [];
    S.payrollLocks = {};
    S.saveBlocked = false;
    S.saveTimer = null;
    S.teachers = [
      { id: 't1', name: '佐藤', loginUid: 'u1', perLessonRate: 1500, dailyTransport: 0, subjects: [{ level: '小学', subject: '算数' }, { level: '小学', subject: '国語' }] },
      { id: 't2', name: '鈴木', perLessonRate: 1500, dailyTransport: 0, subjects: [{ level: '小学', subject: '算数' }] },
    ];
    S.teacherSchedules = ['t1', 't2'].map(tid => ({
      id: `sch-${tid}`, teacherId: tid, yearMonth: '2026-11', status: 'submitted',
      days: Object.fromEntries(MON.map(d => [d, [{ slot: 5, priority: 'hope' }]])),
    }));
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
    savedPayloads.length = 0;
  }
  const weekly = (sid, cid, tid, extra) => ({ id: `w-${sid}-${cid}`, studentId: sid, courseId: cid, subject: '算数', day: '月', slot: 5, teacherId: tid, source: 'manual', ...extra });
  const extraRow = (date, extra) => ({ id: `x-${date}`, studentId: 's1', courseId: 'ex-s1-算数', subject: '算数', day: '月', slot: 5, teacherId: 't1', oneTimeDate: date, extraBookingId: 'b1', extraLineId: 'math', source: 'extra', ...extra });
  const revenueOn = date => abs.computeDayFinance(date, false).revenue;

  // ---------- 追加コマの仮決め・承認待ちの件数 ----------
  reset();
  S.draftAssignments = [extraRow('2026-11-16')];
  {
    const d = m.collectUpcomingDraftsFlat();
    check('追加コマの仮決めが上の「仮決め」に入る', d.length === 1 && d[0].course.subject === '算数', { count: d.length });
  }
  reset();
  S.pendingAssignments = [extraRow('2026-11-16')];
  {
    const p = m.collectUpcomingPendingFlat();
    check('追加コマの承認待ちが上の「承認待ち」に入る', p.length === 1, { count: p.length });
  }
  reset();
  S.draftAssignments = [weekly('s2', 'c2', 't1')];
  {
    const d = m.collectUpcomingDraftsFlat();
    check('毎週の仮決めは今まで通り月の回数だけ入る', d.length === 5, { count: d.length });
  }
  reset();
  S.draftAssignments = [extraRow('2026-11-16'), extraRow('2026-12-07', { id: 'x-dec', day: '月' })];
  {
    const d = m.collectUpcomingDraftsFlat();
    check('別の月の追加コマは、表示中の月の件数に入れない', d.length === 1, { count: d.length });
  }

  // ---------- 送信 ----------
  reset();
  S.draftAssignments = [extraRow('2026-11-16'), weekly('s2', 'c2', 't1')];
  {
    const r = await sched.sendDraftAssignments({ only: row => row.id === 'x-2026-11-16' });
    check('詳細・変更からの送信は、その申込みの仮決めだけ送る',
      r.saved && r.sent === 1 && S.pendingAssignments.length === 1 && S.pendingAssignments[0].id === 'x-2026-11-16' && S.draftAssignments.length === 1 && S.draftAssignments[0].id === 'w-s2-c2',
      { sent: r.sent, pending: S.pendingAssignments.map(a => a.id), drafts: S.draftAssignments.map(a => a.id) });
    const p = m.collectUpcomingPendingFlat();
    check('送ったあと承認待ちに1件出る', p.length === 1, { count: p.length });
  }
  reset();
  S.draftAssignments = [extraRow('2026-11-16'), weekly('s2', 'c2', 't1')];
  {
    const r = await sched.sendDraftAssignments();
    check('上の送信ボタンは、追加コマも毎週の仮決めもまとめて送る', r.saved && r.sent === 2 && S.draftAssignments.length === 0, { sent: r.sent });
  }
  reset();
  S.draftAssignments = [extraRow('2026-11-16', { teacherId: 't2' })];
  {
    const r = await sched.sendDraftAssignments({ only: () => true });
    check('ログインのない講師の仮決めは送らず残す', r.saved && r.sent === 0 && r.skippedNoLogin === 1 && S.draftAssignments.length === 1, { r });
  }
  reset();
  S.pendingAssignments = [extraRow('2026-11-02')];
  {
    const r = await sched.approvePendingLessonAsAdmin('s1', 'ex-s1-算数', '月', 5, '2026-11-02');
    check('授業日を過ぎた追加コマを「代わりに承認」できる', r.ok && S.assignments.length === 1 && S.pendingAssignments.length === 0, { r });
  }
  reset();
  S.pendingAssignments = [weekly('s2', 'c2', 't1')];
  {
    const r = await sched.approvePendingLessonAsAdmin('s2', 'c2', '月', 5, '2026-11-02');
    check('毎週の授業の「代わりに承認」は今まで通り', r.ok, { r });
  }

  // ---------- 詳細・変更の送信ボタン ----------
  reset();
  const booking = { id: 'b1', studentId: 's1', purposeLabel: '冬期講習', lines: [{ id: 'math', subject: '算数', count: 2 }], history: [] };
  S.extraBookings = [booking];
  let refreshed = 0;
  ex.setExtraLessonDeps({ ...m.extraLessonDeps(), refresh(){ refreshed++; }, afterSend(){ refreshed++; } });
  {
    const none = ex.detailHtml(S.students[0], booking);
    check('仮決めがないときは送信ボタンを出さない', !none.includes('data-action="send-drafts"'), {});
    S.draftAssignments = [extraRow('2026-11-16')];
    const has = ex.detailHtml(S.students[0], booking);
    check('仮決めがあるときは詳細・変更に送信ボタンを出す', has.includes('data-action="send-drafts"') && has.includes('講師にスケジュールを送信'), {});
    const r = await ex.sendBookingDrafts(booking);
    check('詳細・変更から送ると承認待ちになり、履歴に残る',
      r.ok && S.pendingAssignments.length === 1 && S.draftAssignments.length === 0 && booking.history[0]?.action === '講師に送信' && refreshed === 2,
      { r, history: booking.history[0], refreshed });
    const after = ex.detailHtml(S.students[0], booking);
    check('送ったあとは送信ボタンが消え、承認待ちと表示される', !after.includes('data-action="send-drafts"') && after.includes('承認待ち'), {});
    S.draftAssignments = [extraRow('2026-11-23', { teacherId: 't2' })];
    const r2 = await ex.sendBookingDrafts(booking);
    check('ログインのない講師だけなら送れないと伝える', r2.ok === false && r2.msg.includes('鈴木'), { r2 });
  }

  // ---------- 切り替え日の記録 ----------
  {
    let c = hist.recordChange([], '', '2026-11-16', 'advance');
    check('切り替え日の前は前のコース、当日からは新しいコース',
      hist.valueOnDate(c, 'advance', '2026-11-09') === '' && hist.valueOnDate(c, 'advance', '2026-11-16') === 'advance' && hist.valueOnDate(c, 'advance', null) === 'advance', { c });
    c = hist.recordChange(c, 'advance', '2026-12-07', '');
    check('2回変えても、それぞれの期間のコースが残る',
      hist.valueOnDate(c, '', '2026-11-09') === '' && hist.valueOnDate(c, '', '2026-11-30') === 'advance' && hist.valueOnDate(c, '', '2026-12-07') === '', { c });
    const back = hist.recordChange(c, '', '2026-11-16', '');
    check('同じ日から元に戻すと、切り替えが消える', back.length === 0, { back });
    const earlier = hist.recordChange(c, '', '2026-11-09', 'advance');
    check('前の日付で変え直すと、それ以降の予定は上書きされる',
      earlier.length === 1 && hist.valueOnDate(earlier, 'advance', '2026-12-07') === 'advance' && hist.valueOnDate(earlier, 'advance', '2026-11-02') === '', { earlier });
    check('変えていない値なら何も残さない', hist.recordChange([], 'advance', '2026-11-16', 'advance').length === 0, {});
  }

  // ---------- 授業料コースの途中変更 ----------
  reset();
  S.assignments = [weekly('s1', 'c1', 't1')];
  {
    const before = MON.map(revenueOn);
    const payBefore = pay.computeLiveMonthPayroll(2026, 10, 0).find(r => r.teacherId === 't1')?.lessonPay;
    S.students[0].tuitionCourse = 'advance';
    S.students[0].tuitionCourseChanges = hist.recordChange([], '', '2026-11-16', 'advance');
    const after = MON.map(revenueOn);
    const payAfter = pay.computeLiveMonthPayroll(2026, 10, 0).find(r => r.teacherId === 't1')?.lessonPay;
    check('コースを11/16から変えると、11/9までは前の授業料のまま',
      JSON.stringify(after) === JSON.stringify([2900, 2900, 3500, 3500, 3500]), { before, after });
    check('コースを変えても講師の給与は変わらない', payBefore === payAfter && payAfter === 7500, { payBefore, payAfter });
    check('10月の授業料も前のまま', revenueOn('2026-10-05') === 2900, { oct: revenueOn('2026-10-05') });
  }
  reset();
  S.assignments = [weekly('s1', 'c1', 't1')];
  S.students[0].tuitionCourse = 'advance';
  check('切り替え日のない古い生徒は、今まで通り今のコース', revenueOn('2026-11-02') === 3500, { rev: revenueOn('2026-11-02') });

  // ---------- 1対1の途中変更 ----------
  reset();
  S.assignments = [weekly('s1', 'c1', 't1')];
  {
    const c1 = S.students[0].courses[0];
    c1.oneToOne = true;
    c1.oneToOneChanges = hist.recordChange([], false, '2026-11-16', true);
    const after = MON.map(revenueOn);
    check('1対1を11/16からにすると、前は2人授業の料金、当日から1対1の料金',
      JSON.stringify(after) === JSON.stringify([2900, 2900, 6000, 6000, 6000]), { after });
    check('席の表示：11/9は1/2、11/16は1/1',
      sched.teacherSeatTextOnDate('t1', '2026-11-09', 5) === '1/2' && sched.teacherSeatTextOnDate('t1', '2026-11-16', 5) === '1/1',
      { nov9: sched.teacherSeatTextOnDate('t1', '2026-11-09', 5), nov16: sched.teacherSeatTextOnDate('t1', '2026-11-16', 5) });
    const ok9 = await sched.confirmAssignment('s2', 'c2', '算数', '月', 5, 't1', 'manual', { dateStr: '2026-11-09' });
    const ng16 = await sched.confirmAssignment('s2', 'c2', '算数', '月', 5, 't1', 'manual', { dateStr: '2026-11-16' });
    check('切り替え前の日は隣に1人置けて、切り替え後の日は置けない', ok9.ok === true && ng16.ok === false, { ok9, ng16: ng16.msg });
    check('毎週の枠そのもの（日付なし）は今の設定で1対1', oto.isOneToOneCourse(c1) === true && oto.isOneToOneCourse(c1, '2026-11-09') === false, {});
    check('振替の席の判定も日付で変わる',
      oto.studentSubjectsAreOneToOne('s1', ['算数'], '2026-11-09') === false && oto.studentSubjectsAreOneToOne('s1', ['算数'], '2026-11-16') === true, {});
  }
  reset();
  S.assignments = [weekly('s1', 'c1', 't1')];
  {
    const c1 = S.students[0].courses[0];
    c1.oneToOneChanges = hist.recordChange([], true, '2026-11-16', false);
    const after = MON.map(revenueOn);
    check('1対1をやめる日を決めると、前は1対1の料金のまま', JSON.stringify(after) === JSON.stringify([6000, 6000, 2900, 2900, 2900]), { after });
  }
  reset();
  {
    const c1 = S.students[0].courses[0];
    c1.oneToOne = true;
    c1.oneToOneChanges = hist.recordChange([], false, '2026-11-16', true);
    S.assignments = [{ ...extraRow('2026-11-09'), oneToOne: false }];
    check('追加コマの1対1は、追加コマ自身の設定のまま', revenueOn('2026-11-09') === 2900, { rev: revenueOn('2026-11-09') });
  }

  // ---------- 保存（教室長の画面操作） ----------
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
    el('studentTargetSchoolInput').value = '';
    el('studentNotesInput').value = '';
    ['studentDiscountInitial', 'studentDiscountAnnual', 'studentDiscountMonthly'].forEach(id => { el(id).value = ''; });
    S.formCourses = JSON.parse(JSON.stringify(student.courses));
  }
  const flushSave = async () => {
    if(S.saveTimer){ clearTimeout(S.saveTimer); S.saveTimer = null; }
    const persist = await server.ssrLoadModule('/src/admin/students-persistence.js');
    return persist.saveAppState();
  };

  reset();
  S.payrollLocks = { '2026-10': { lockedAt: '2026-11-01', rows: [] } };
  S.assignments = [weekly('s1', 'c1', 't1')];
  openEdit(S.students[0]);
  radios.studentTuitionCourse = 'advance';
  el('studentChangeFromInput').value = '2026-10-19';
  await m.handleStudentSave();
  check('給与を確定した月の日を選ぶと、コースを変えずに止める',
    S.students[0].tuitionCourse === '' && !S.students[0].tuitionCourseChanges && el('studentFormMsg').textContent.includes('10月の給与は確定済み'),
    { msg: el('studentFormMsg').textContent, course: S.students[0].tuitionCourse });
  el('studentChangeFromInput').value = '2026-11-16';
  await m.handleStudentSave();
  check('次の月の日なら保存され、切り替え日が残る',
    S.students[0].tuitionCourse === 'advance' && S.students[0].tuitionCourseChanges?.[0]?.from === '2026-11-16' && revenueOn('2026-11-09') === 2900 && revenueOn('2026-11-16') === 3500,
    { changes: S.students[0].tuitionCourseChanges, msg: el('studentFormMsg').textContent });
  el('studentChangeFromInput').value = '';
  el('studentNotesInput').value = 'メモだけ変更';
  await m.handleStudentSave();
  check('コースを変えずに保存しても、切り替え日はそのまま',
    S.students[0].tuitionCourseChanges?.length === 1 && S.students[0].notes === 'メモだけ変更', { changes: S.students[0].tuitionCourseChanges });
  await flushSave();
  const lastState = savedPayloads.filter(p => p.data?.students).pop()?.data;
  const savedStudent = lastState?.students?.find(s => s.id === 's1');
  const undefinedAt = [];
  const walk = (v, path) => {
    if(v === undefined){ undefinedAt.push(path); return; }
    if(v && typeof v === 'object') Object.entries(v).forEach(([k, x]) => walk(x, `${path}.${k}`));
  };
  walk(savedStudent, 'student');
  check('クラウドへ送る生徒の中身に切り替え日が入り、空の値がない',
    !!savedStudent?.tuitionCourseChanges && undefinedAt.length === 0,
    { payloads: savedPayloads.length, saved: savedStudent?.tuitionCourseChanges, undefinedAt });

  reset();
  S.payrollLocks = { '2026-10': { lockedAt: '2026-11-01', rows: [] } };
  openEdit(S.students[0]);
  el('studentChangeFromInput').value = '2026-10-19';
  S.formCourses[0].oneToOne = true;
  const block = await m.persistFormCourses();
  check('1対1の切り替えも、確定済みの月の日なら止めて元に戻す',
    typeof block === 'string' && block.includes('確定済み') && !S.students[0].courses[0].oneToOne && !S.formCourses[0].oneToOne, { block });
  el('studentChangeFromInput').value = '2026-11-16';
  S.formCourses[0].oneToOne = true;
  const okBlock = await m.persistFormCourses();
  const saved1 = S.students[0].courses[0];
  check('1対1の切り替えが保存され、切り替え日が残る',
    !okBlock && saved1.oneToOne === true && saved1.oneToOneChanges?.[0]?.from === '2026-11-16' && S.formCourses[0].oneToOneChanges?.length === 1, { saved1 });
  S.formCourses[0].desiredSlots.push({ day: '火', slot: 5 });
  await m.persistFormCourses();
  check('別のマスを足しても、1対1の切り替え日は消えない', S.students[0].courses[0].oneToOneChanges?.length === 1, { c: S.students[0].courses[0] });
  S.formCourses.push({ id: 'c-new', subject: '国語', weeklyCount: 1, desiredSlots: [{ day: '水', slot: 5 }], oneToOne: true });
  await m.persistFormCourses();
  const newCourse = S.students[0].courses.find(c => c.id === 'c-new');
  check('新しく足した教科の1対1は、最初から1対1（切り替え日なし）', newCourse?.oneToOne === true && !newCourse.oneToOneChanges, { newCourse });

  reset();
  openEdit(S.students[0]);
  el('studentChangeFromInput').value = '2026-10-19';
  el('studentNotesInput').value = '確定月でもメモは保存できる';
  S.payrollLocks = { '2026-10': { lockedAt: '2026-11-01', rows: [] } };
  await m.handleStudentSave();
  check('コースを変えないなら、確定済みの月の日が入っていても保存できる', S.students[0].notes === '確定月でもメモは保存できる', { msg: el('studentFormMsg').textContent });

  // ---------- 学年・区分の途中変更 ----------
  const setGradeRates = () => {
    S.tuitionGradeRates.basic['小学5'] = 3100;
    S.tuitionGradeRates.basic['小学6'] = 3300;
    S.tuitionGradeRates.basic['中学1'] = 3900;
    S.tuitionGradeRates.basic['中学3'] = 4500;
    S.tuitionGradeRates.advance['高校1'] = 5200;
    S.tuitionGradeRatesShort.basic['小学6'] = 1600;
  };
  reset(); setGradeRates();
  S.assignments = [weekly('s1', 'c1', 't1')];
  openEdit(S.students[0]);
  radios.studentGrade = '5';
  el('studentChangeFromInput').value = '2026-11-16';
  await m.handleStudentSave();
  check('学年を11/16から小5にすると、11/9までは小4の授業料のまま',
    JSON.stringify(MON.map(revenueOn)) === JSON.stringify([2900, 2900, 3100, 3100, 3100]) && S.students[0].grade === 5,
    { rev: MON.map(revenueOn), changes: S.students[0].gradeChanges });

  reset(); setGradeRates();
  S.payrollLocks = { '2026-10': { lockedAt: '2026-11-01', rows: [] } };
  openEdit(S.students[0]);
  radios.studentGrade = '5';
  el('studentChangeFromInput').value = '2026-10-19';
  await m.handleStudentSave();
  check('学年の変更も、給与を確定した月の日なら止める', S.students[0].grade === 4 && !S.students[0].gradeChanges, { msg: el('studentFormMsg').textContent });

  reset(); setGradeRates();
  S.students[0].grade = 6;
  S.assignments = [weekly('s1', 'c1', 't1')];
  openEdit(S.students[0]);
  radios.studentLevel = '中学';
  radios.studentGrade = '1';
  el('studentChangeFromInput').value = '2026-11-16';
  await m.handleStudentSave();
  check('小6から中1に直すと、前は小6・当日から中1の授業料',
    revenueOn('2026-11-09') === 3300 && revenueOn('2026-11-16') === 3900, { nov9: revenueOn('2026-11-09'), nov16: revenueOn('2026-11-16') });

  const promo = await server.ssrLoadModule('/src/admin/grade-promotion.js');
  reset(); setGradeRates();
  S.students[0].grade = 6;
  S.students[0].courseStartDate = '2025-04-01';
  S.students[1].level = '中学';
  S.students[1].grade = 3;
  S.students[1].courses[0].subject = '数学';
  S.assignments = [weekly('s1', 'c1', 't1'), weekly('s2', 'c2', 't2', { subject: '数学' })];
  S.students[1].courseStartDate = '2025-04-01';
  S.lastGradePromotionYear = 2025;
  await promo.applyGradePromotionsIfNeeded();
  {
    const s1Mar = abs.getStudentTuitionForDate(S.students[0], '2026-03-30', S.assignments[0]);
    const s1Apr = abs.getStudentTuitionForDate(S.students[0], '2026-04-06', S.assignments[0]);
    const s2Mar = abs.getStudentTuitionForDate(S.students[1], '2026-03-30', S.assignments[1]);
    const s2Apr = abs.getStudentTuitionForDate(S.students[1], '2026-04-06', S.assignments[1]);
    check('4月の自動進級：3月の授業は小6の授業料、4月からは中1',
      S.students[0].level === '中学' && S.students[0].grade === 1 && s1Mar === 3300 && s1Apr === 3900,
      { s1Mar, s1Apr, changes: S.students[0].gradeChanges });
    check('4月の自動進級：中3から高1は、4月から高校（アドバンス）の授業料',
      S.students[1].level === '高校' && s2Mar === 4500 && s2Apr === 5200, { s2Mar, s2Apr });
    const shortRow = { ...S.assignments[0], half: 'early' };
    const shortMar = abs.getStudentTuitionForDate(S.students[0], '2026-03-30', shortRow);
    check('小学だけの40分の授業料も、3月は小6のまま', shortMar === 1600, { shortMar });
  }
  reset(); setGradeRates();
  S.students[0].grade = 6;
  S.lastGradePromotionYear = 2024;
  await promo.applyGradePromotionsIfNeeded();
  check('2年分まとめて進級しても、それぞれ4月1日から',
    S.students[0].gradeChanges?.map(c => c.from).join(',') === '2025-04-01,2026-04-01' && S.students[0].grade === 2 && S.students[0].level === '中学',
    { changes: S.students[0].gradeChanges });

  console.log(`check ${results.length - failed}/${results.length} pass, fail ${failed}`);
}finally{
  await server.close();
  rmSync(`${ROOT}src/admin/zz-check-matching.js`, { force: true });
  rmSync(`${ROOT}src/admin/zz-check-extra.js`, { force: true });
}
process.exit(failed ? 1 : 0);
