import { DAYS, SLOTS } from '../shared/constants.js';
import { halfLabel, isShortHalf, slotTimeForHalf } from '../shared/lesson-span.js';
import { getTodayStr } from '../shared/date-utils.js';
import { S } from './state.js';
import { isMonthlyFeeLesson } from './absences.js';
import { countSlotAssignmentUnits } from './dual-subject.js';
import { gradeLabel } from './schedule-core.js';
import { buildPrintSheetHtml } from './print-sheet-html.js';
import { effectiveTuitionCourse, studentShortTuitionRate, studentTuitionRate } from './tuition-rates.js';

/** 毎週のコマ（承認待ち・仮決め・1回だけの授業・振替を除く確定コマ） */
function weeklyAssignmentsForStudent(studentId){
  return (S.assignments || []).filter(a=>
    a.studentId === studentId && !a.pending && !a.draft && !a.oneTimeDate && a.kind !== 'makeup'
  );
}

/** 生徒1人分の紙に載せるデータ */
function collectPrintSheetData(student){
  const weekly = weeklyAssignmentsForStudent(student.id);
  const cells = {};
  weekly.forEach(a=>{
    const key = `${a.day}-${a.slot}`;
    (cells[key] ||= []);
    const slot = SLOTS.find(s=> Number(s.id) === Number(a.slot));
    const label = isShortHalf(a.half)
      ? `${a.subject}（${halfLabel(a.half)} ${slotTimeForHalf(slot, a.half)}）`
      : a.subject;
    if(!cells[key].includes(label)) cells[key].push(label);
  });
  const tuitionLessons = weekly.filter(a=> !isMonthlyFeeLesson(a));
  const fullRate = studentTuitionRate(S.tuitionGradeRates, student);
  const shortRate = studentShortTuitionRate(S.tuitionGradeRatesShort, student);
  const seenDual = new Set();
  let fullCount = 0;
  let shortCount = 0;
  let tuitionMonthly = 0;
  tuitionLessons.forEach(a=>{
    if(a.dualGroupId){
      const key = `${a.studentId}:${a.slot}:${a.dualGroupId}`;
      if(seenDual.has(key)) return;
      seenDual.add(key);
    }
    if(isShortHalf(a.half)){
      shortCount++;
      tuitionMonthly += shortRate * 4;
    }else{
      fullCount++;
      tuitionMonthly += fullRate * 4;
    }
  });
  const durationNote = shortCount && fullCount
    ? `90分が週${fullCount}コマ、40分が週${shortCount}コマです。`
    : (shortCount
      ? `1コマ40分です。週${shortCount}コマ`
      : `1コマ90分です。週${fullCount}コマ`);
  const hasProgramming = weekly.some(isMonthlyFeeLesson);
  const start = typeof student.courseStartDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(student.courseStartDate)
    ? student.courseStartDate : '';
  return {
    studentName: student.name || '',
    gradeLabel: gradeLabel(student),
    startDate: start,
    startMonth1: start ? Number(start.slice(5, 7)) : null,
    issuedDate: getTodayStr(),
    courseLabel: effectiveTuitionCourse(student.level, student.tuitionCourse) === 'advance' ? 'アドバンス' : 'ベーシック',
    days: DAYS,
    slots: SLOTS,
    cells,
    weeklyUnits: countSlotAssignmentUnits(tuitionLessons),
    rate: fullRate,
    tuitionMonthly,
    durationNote,
    programmingFee: hasProgramming ? Number(S.programmingMonthlyFee) || 0 : 0,
    freeLessonCount: Number(student.freeLessonCount) || 0,
    fees: S.studentFees || {},
    discounts: student.discounts || {},
  };
}

/** 印刷用の箱に紙の中身を入れて、ブラウザの印刷画面を開く */
function printStudentSheet(studentId){
  const student = (S.students || []).find(s=> s.id === studentId);
  const root = document.getElementById('printSheetRoot');
  if(!student || !root) return;
  root.innerHTML = buildPrintSheetHtml(collectPrintSheetData(student));
  const img = root.querySelector('img');
  const open = ()=> window.print();
  if(img && !img.complete){
    img.addEventListener('load', open, { once:true });
    img.addEventListener('error', open, { once:true });
  }else{
    open();
  }
}

export { collectPrintSheetData, printStudentSheet };
