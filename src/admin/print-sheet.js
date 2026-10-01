import { DAYS, SLOTS } from '../shared/constants.js';
import { getTodayStr } from '../shared/date-utils.js';
import { S } from './state.js';
import { isMonthlyFeeLesson } from './absences.js';
import { countSlotAssignmentUnits } from './dual-subject.js';
import { gradeLabel } from './schedule-core.js';
import { buildPrintSheetHtml } from './print-sheet-html.js';
import { effectiveTuitionCourse, studentTuitionRate } from './tuition-rates.js';

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
    if(!cells[key].includes(a.subject)) cells[key].push(a.subject);
  });
  const tuitionLessons = weekly.filter(a=> !isMonthlyFeeLesson(a));
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
    rate: studentTuitionRate(S.tuitionGradeRates, student),
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
