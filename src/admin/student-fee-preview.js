import { LEVELS_ORDER } from '../shared/constants.js';
import { S } from './state.js';
import { isMonthlyFeeLesson } from './absences.js';
import { countSlotAssignmentUnits } from './dual-subject.js';
import { buildFeeTablesHtml } from './print-sheet-html.js';
import { tuitionRateFor } from './tuition-rates.js';

function numberInput(id){
  const v = parseInt(String(document.getElementById(id)?.value || '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** 入力中の受講科目（希望コマ）を、毎週の授業として並べる */
function formWeeklyLessons(){
  const list = [];
  (S.formCourses || []).forEach(c=>{
    (c.desiredSlots || []).forEach(ds=>{
      list.push({ studentId:'form', day: ds.day, slot: ds.slot, subject: c.subject, dualGroupId: ds.dualGroupId || null });
    });
  });
  return list;
}

function collectFormFeeData(){
  const level = document.querySelector('input[name=studentLevel]:checked')?.value || LEVELS_ORDER[0];
  const grade = parseInt(document.querySelector('input[name=studentGrade]:checked')?.value || '', 10);
  const course = document.querySelector('input[name=studentTuitionCourse]:checked')?.value || '';
  const start = document.getElementById('studentCourseStartInput')?.value || '';
  const lessons = formWeeklyLessons();
  const freeOn = document.getElementById('freeLessonToggle')?.checked;
  return {
    fees: S.studentFees || {},
    rate: tuitionRateFor(S.tuitionGradeRates, level, grade, course),
    weeklyUnits: countSlotAssignmentUnits(lessons.filter(a=> !isMonthlyFeeLesson(a))),
    noCourses: lessons.length === 0,
    programmingFee: lessons.some(isMonthlyFeeLesson) ? Number(S.programmingMonthlyFee) || 0 : 0,
    startMonth1: /^\d{4}-\d{2}-\d{2}$/.test(start) ? Number(start.slice(5, 7)) : null,
    discounts: {
      initial: numberInput('studentDiscountInitial'),
      annual: numberInput('studentDiscountAnnual'),
      monthly: numberInput('studentDiscountMonthly'),
    },
    freeLessonCount: freeOn ? numberInput('freeLessonCount') : 0,
  };
}

/** 生徒登録画面の右の金額欄を、いまの入力内容で描き直す */
function renderStudentFeePreview(){
  const box = document.getElementById('studentFeeTables');
  if(!box) return;
  box.innerHTML = buildFeeTablesHtml(collectFormFeeData());
}

function bindStudentFeePreview(){
  const form = document.getElementById('studentFormSplit');
  if(!form) return;
  form.addEventListener('input', renderStudentFeePreview);
  form.addEventListener('change', renderStudentFeePreview);
}

export { renderStudentFeePreview, bindStudentFeePreview };
