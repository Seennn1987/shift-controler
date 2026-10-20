/**
 * 代講候補の自己検証。メモリ上の仮データだけで動き、保存もしない。
 * 画面の実データは実行前後で戻す。
 */
import { S } from './state.js';
import {
  countRoomLoadOnDate,
  countTeacherLoadOnDate,
  findSubstituteCandidatesForStudent,
  getEffectiveDayAssignments,
  getTeacherLessonsOnDate,
} from './absences.js';

const DATE = '2026-10-22';
const SLOT = 6;
const KEYS = [
  'teachers', 'students', 'assignments', 'pendingAssignments', 'draftAssignments',
  'absences', 'teacherAbsences', 'teacherSubstitutions', 'teacherCapacity',
  'regularClosedDays', 'closedHolidayDates', 'customClosures',
];

function subject(level, name){
  return { level, subject: name, preferred: false };
}

function teacher(id, subjects, extra){
  return { id, name: id, perLessonRate: 1000, subjects, ...extra };
}

function student(id, level, courses){
  return { id, name: id, level, courseStartDate: '2020-01-01', courses };
}

function course(id, name, slots, oneToOne){
  return { id, subject: name, oneToOne: !!oneToOne, desiredSlots: slots };
}

function slot(day, slotId, extra){
  return { day, slot: slotId, ...extra };
}

function lesson(fields){
  return {
    day: '木',
    slot: SLOT,
    half: null,
    oneTimeDate: DATE,
    dualGroupId: null,
    ...fields,
  };
}

function blankState(){
  S.teachers = [
    teacher('t-absent', [subject('小学', '国語')]),
    teacher('t-kokugo', [subject('小学', '国語'), subject('小学', '算数')]),
    teacher('t-sansu-only', [subject('小学', '算数')]),
    teacher('t-jh-kokugo', [subject('中学', '国語')]),
    teacher('t-both', [subject('小学', '国語'), subject('小学', '算数')]),
    teacher('t-kokugo-only', [subject('小学', '国語')]),
    teacher('t-left', [subject('小学', '国語')], { left: true, leftDate: '2020-01-01' }),
    teacher('t-cover', [subject('小学', '国語'), subject('小学', '英語')]),
  ];
  S.students = [
    student('s-need', '小学', [
      course('c-need', '国語', [slot('木', SLOT)]),
    ]),
    student('s-other', '小学', [
      course('c-other', '算数', [slot('木', SLOT)]),
    ]),
    student('s-eng', '小学', [
      course('c-eng', '英語', [slot('木', SLOT)]),
    ]),
    student('s-dual', '小学', [
      course('c-dual-k', '国語', [slot('木', SLOT, { dualGroupId: 'dual-1', dualRole: 'first' })]),
      course('c-dual-s', '算数', [slot('木', SLOT, { dualGroupId: 'dual-1' })]),
    ]),
    student('s-one', '小学', [
      course('c-one', '国語', [slot('木', SLOT)], true),
    ]),
    student('s-early', '小学', [
      course('c-early', '国語', [slot('木', SLOT, { half: 'early' })]),
    ]),
    student('s-late', '小学', [
      course('c-late', '国語', [slot('木', SLOT, { half: 'late' })]),
    ]),
  ];
  S.assignments = [];
  S.pendingAssignments = [];
  S.draftAssignments = [];
  S.absences = [];
  S.teacherAbsences = [];
  S.teacherSubstitutions = [];
  S.teacherCapacity = 2;
  S.regularClosedDays = ['日'];
  S.closedHolidayDates = [];
  S.customClosures = [];
}

function ids(list){
  return (list || []).map(t=> t.id);
}

function has(list, id){
  return ids(list).includes(id);
}

export function runSubstituteCandidateSelfTest(){
  const snap = {};
  KEYS.forEach(key=>{ snap[key] = S[key]; });
  const results = [];
  function check(name, cond){
    results.push({ name, ok: !!cond });
  }
  try{
    blankState();
    S.assignments = [
      lesson({ id: 'a-need', studentId: 's-need', teacherId: 't-absent', courseId: 'c-need', subject: '国語' }),
    ];
    check('小学校の国語を教えられる先生は候補に出る', has(
      findSubstituteCandidatesForStudent(DATE, SLOT, 't-absent', 's-need', '国語'),
      't-kokugo',
    ));

    check('中学の国語だけの先生は、小学生の候補に出ない', !has(
      findSubstituteCandidatesForStudent(DATE, SLOT, 't-absent', 's-need', '国語'),
      't-jh-kokugo',
    ));

    check('算数だけの先生は、国語の候補に出ない', !has(
      findSubstituteCandidatesForStudent(DATE, SLOT, 't-absent', 's-need', '国語'),
      't-sansu-only',
    ));

    check('休職・退社した先生は候補に出ない', !has(
      findSubstituteCandidatesForStudent(DATE, SLOT, 't-absent', 's-need', '国語'),
      't-left',
    ));

    check('休む本人は候補に出ない', !has(
      findSubstituteCandidatesForStudent(DATE, SLOT, 't-absent', 's-need', '国語'),
      't-absent',
    ));

    check('席が空いていれば教室長も候補に出る', has(
      findSubstituteCandidatesForStudent(DATE, SLOT, 't-absent', 's-need', '国語'),
      '__owner__',
    ));

    blankState();
    S.students.find(s=> s.id === 's-need').courses = [
      course('c-dual-k', '国語', [slot('木', SLOT, { dualGroupId: 'dual-1', dualRole: 'first' })]),
      course('c-dual-s', '算数', [slot('木', SLOT, { dualGroupId: 'dual-1' })]),
    ];
    S.assignments = [
      lesson({ id: 'a-dk', studentId: 's-need', teacherId: 't-absent', courseId: 'c-dual-k', subject: '国語', dualGroupId: 'dual-1' }),
      lesson({ id: 'a-ds', studentId: 's-need', teacherId: 't-absent', courseId: 'c-dual-s', subject: '算数', dualGroupId: 'dual-1' }),
    ];
    const dualList = findSubstituteCandidatesForStudent(DATE, SLOT, 't-absent', 's-need', '国語');
    check('2教科なら、両方教えられる先生は候補に出る', has(dualList, 't-both'));
    check('2教科なら、国語だけの先生は候補に出ない', !has(dualList, 't-kokugo-only'));

    blankState();
    S.assignments = [
      lesson({ id: 'a-need', studentId: 's-need', teacherId: 't-absent', courseId: 'c-need', subject: '国語' }),
      lesson({ id: 'a-other', studentId: 's-other', teacherId: 't-kokugo', courseId: 'c-other', subject: '算数' }),
    ];
    S.teacherSubstitutions = [
      { id: 'sub-1', teacherId: 't-kokugo', date: DATE, slot: SLOT, studentId: 's-other', substituteTeacherId: 't-cover' },
    ];
    check('代講で外れた先生は、そのコマの候補に出る', has(
      findSubstituteCandidatesForStudent(DATE, SLOT, 't-absent', 's-need', '国語'),
      't-kokugo',
    ));
    check('代わりに入った先生は、席を1つ使う', countTeacherLoadOnDate('t-cover', DATE, SLOT, 's-need') === 1);
    check('代わりに入った先生も、席が2人未満なら候補に出る', has(
      findSubstituteCandidatesForStudent(DATE, SLOT, 't-absent', 's-need', '国語'),
      't-cover',
    ));

    S.assignments.push(lesson({
      id: 'a-eng', studentId: 's-eng', teacherId: 't-cover', courseId: 'c-eng', subject: '英語',
    }));
    check('代わりに入った先生が2人になると、候補から外れる', !has(
      findSubstituteCandidatesForStudent(DATE, SLOT, 't-absent', 's-need', '国語'),
      't-cover',
    ));

    blankState();
    S.assignments = [
      lesson({ id: 'a-need', studentId: 's-need', teacherId: 't-absent', courseId: 'c-need', subject: '国語' }),
      lesson({ id: 'a-old1', studentId: 's-other', teacherId: 't-kokugo', courseId: 'c-other', subject: '算数', oneTimeDate: '2026-10-15' }),
      lesson({ id: 'a-old2', studentId: 's-eng', teacherId: 't-kokugo', courseId: 'c-eng', subject: '英語', oneTimeDate: '2026-10-08' }),
    ];
    check('別の日の授業は、この日の席を埋めない', has(
      findSubstituteCandidatesForStudent(DATE, SLOT, 't-absent', 's-need', '国語'),
      't-kokugo',
    ));
    check('別の日の2件は、この日の人数に入らない', countTeacherLoadOnDate('t-kokugo', DATE, SLOT, 's-need') === 0);

    blankState();
    S.assignments = [
      lesson({ id: 'a-need', studentId: 's-need', teacherId: 't-absent', courseId: 'c-need', subject: '国語' }),
      lesson({ id: 'a-dup1', studentId: 's-other', teacherId: 't-kokugo', courseId: 'c-other', subject: '算数' }),
      lesson({ id: 'a-dup2', studentId: 's-other', teacherId: 't-kokugo', courseId: 'c-other', subject: '算数' }),
    ];
    check('同じ生徒の記録が2件でも、席は1人分', countTeacherLoadOnDate('t-kokugo', DATE, SLOT, 's-need') === 1);
    check('同じ生徒の二重記録だけでは、候補から外れない', has(
      findSubstituteCandidatesForStudent(DATE, SLOT, 't-absent', 's-need', '国語'),
      't-kokugo',
    ));
    check('教室の席も、同じ生徒の二重記録は1人分', countRoomLoadOnDate(DATE, SLOT, 's-need') === 1);

    blankState();
    S.assignments = [
      lesson({ id: 'a-need', studentId: 's-need', teacherId: 't-absent', courseId: 'c-need', subject: '国語' }),
      lesson({ id: 'a1', studentId: 's-other', teacherId: 't-kokugo', courseId: 'c-other', subject: '算数' }),
      lesson({ id: 'a2', studentId: 's-eng', teacherId: 't-kokugo', courseId: 'c-eng', subject: '英語' }),
    ];
    S.absences = [
      { id: 'ab1', studentId: 's-eng', courseId: 'c-eng', subject: '英語', day: '木', slot: SLOT, date: DATE, half: null, status: 'pending' },
    ];
    check('生徒が欠席した席は空く', countTeacherLoadOnDate('t-kokugo', DATE, SLOT, 's-need') === 1);
    check('1人欠席して席が空けば、候補に出る', has(
      findSubstituteCandidatesForStudent(DATE, SLOT, 't-absent', 's-need', '国語'),
      't-kokugo',
    ));

    blankState();
    S.assignments = [
      lesson({ id: 'a-need', studentId: 's-need', teacherId: 't-absent', courseId: 'c-need', subject: '国語' }),
      lesson({ id: 'a-other', studentId: 's-other', teacherId: 't-kokugo', courseId: 'c-other', subject: '算数' }),
    ];
    S.teacherAbsences = [
      { id: 'ta1', teacherId: 't-kokugo', date: DATE, slots: [SLOT], studentIdsBySlot: { [String(SLOT)]: ['s-other'] } },
    ];
    check('代講が付いていない欠勤の先生は、その席を使っていない', countTeacherLoadOnDate('t-kokugo', DATE, SLOT, 's-need') === 0);

    blankState();
    S.assignments = [
      lesson({ id: 'a-need', studentId: 's-need', teacherId: 't-absent', courseId: 'c-need', subject: '国語' }),
      lesson({ id: 'a-early', studentId: 's-early', teacherId: 't-kokugo', courseId: 'c-early', subject: '国語', half: 'early' }),
      lesson({ id: 'a-early2', studentId: 's-other', teacherId: 't-kokugo', courseId: 'c-other', subject: '算数', half: 'early' }),
    ];
    S.students.find(s=> s.id === 's-need').courses = [
      course('c-late', '国語', [slot('木', SLOT, { half: 'late' })]),
    ];
    S.assignments[0] = lesson({ id: 'a-need', studentId: 's-need', teacherId: 't-absent', courseId: 'c-late', subject: '国語', half: 'late' });
    check('前半が2人でも、後半の候補には出る', has(
      findSubstituteCandidatesForStudent(DATE, SLOT, 't-absent', 's-need', '国語'),
      't-kokugo',
    ));
    S.students.find(s=> s.id === 's-need').courses = [
      course('c-early-need', '国語', [slot('木', SLOT, { half: 'early' })]),
    ];
    S.assignments[0] = lesson({ id: 'a-need', studentId: 's-need', teacherId: 't-absent', courseId: 'c-early-need', subject: '国語', half: 'early' });
    check('前半が2人なら、前半の候補には出ない', !has(
      findSubstituteCandidatesForStudent(DATE, SLOT, 't-absent', 's-need', '国語'),
      't-kokugo',
    ));

    blankState();
    S.students.find(s=> s.id === 's-need').courses = [
      course('c-one', '国語', [slot('木', SLOT)], true),
    ];
    S.assignments = [
      lesson({ id: 'a-need', studentId: 's-need', teacherId: 't-absent', courseId: 'c-one', subject: '国語' }),
      lesson({ id: 'a-other', studentId: 's-other', teacherId: 't-kokugo', courseId: 'c-other', subject: '算数' }),
    ];
    check('これから置く授業が1対1で、相手が1人いると候補に出ない', !has(
      findSubstituteCandidatesForStudent(DATE, SLOT, 't-absent', 's-need', '国語'),
      't-kokugo',
    ));

    blankState();
    S.students.find(s=> s.id === 's-other').courses = [
      course('c-one-other', '算数', [slot('木', SLOT)], true),
    ];
    S.assignments = [
      lesson({ id: 'a-need', studentId: 's-need', teacherId: 't-absent', courseId: 'c-need', subject: '国語' }),
      lesson({ id: 'a-other', studentId: 's-other', teacherId: 't-kokugo', courseId: 'c-one-other', subject: '算数' }),
    ];
    check('すでに1対1の生徒がいる先生は、もう1人入れない', !has(
      findSubstituteCandidatesForStudent(DATE, SLOT, 't-absent', 's-need', '国語'),
      't-kokugo',
    ));

    blankState();
    S.assignments = [
      lesson({ id: 'a-uta', studentId: 's-need', teacherId: 't-absent', courseId: 'c-need', subject: '国語' }),
      lesson({ id: 'a-kin', studentId: 's-eng', teacherId: 't-cover', courseId: 'c-eng', subject: '英語' }),
    ];
    S.teacherSubstitutions = [
      { id: 'sub-uta', teacherId: 't-absent', date: DATE, slot: SLOT, studentId: 's-need', substituteTeacherId: 't-cover' },
    ];
    const originalLessons = getTeacherLessonsOnDate('t-absent', DATE)[SLOT] || [];
    const coverLessons = getTeacherLessonsOnDate('t-cover', DATE)[SLOT] || [];
    const effective = getEffectiveDayAssignments(DATE).filter(a=> Number(a.slot) === SLOT && a.studentId === 's-need');
    check('代講が決まっていても、元の先生の一覧には生徒が残る', originalLessons.some(e=> e.studentId === 's-need'));
    check('代わりに入った先生の欠勤一覧には、その生徒は出ない', !coverLessons.some(e=> e.studentId === 's-need'));
    check('日付の一覧では、代わりに入った先生が担当になる', effective.some(a=> a.teacherId === 't-cover'));
    S.teacherSubstitutions = [];
    check('代講を取り消したあとは、国語を教えられる先生が候補に出る', has(
      findSubstituteCandidatesForStudent(DATE, SLOT, 't-absent', 's-need', '国語'),
      't-kokugo',
    ));

    blankState();
    S.assignments = [
      lesson({ id: 'a-other', studentId: 's-other', teacherId: 't-kokugo', courseId: 'c-other', subject: '算数' }),
      lesson({ id: 'a-eng', studentId: 's-eng', teacherId: 't-kokugo', courseId: 'c-eng', subject: '英語' }),
      lesson({ id: 'a-need', studentId: 's-need', teacherId: 't-absent', courseId: 'c-need', subject: '国語' }),
    ];
    S.teacherSubstitutions = [
      { id: 'sub-wide', teacherId: 't-kokugo', date: DATE, slot: SLOT, substituteTeacherId: 't-cover' },
    ];
    check('生徒を指定しない代講は、そのコマの生徒をまとめて移す', countTeacherLoadOnDate('t-kokugo', DATE, SLOT, 's-need') === 0);
    check('まとめて移した先は、移った人数だけ席を使う', countTeacherLoadOnDate('t-cover', DATE, SLOT, 's-need') === 2);

    const failed = results.filter(r=> !r.ok);
    return { ok: failed.length === 0, total: results.length, failed: failed.map(r=> r.name), results };
  }finally{
    KEYS.forEach(key=>{ S[key] = snap[key]; });
  }
}
