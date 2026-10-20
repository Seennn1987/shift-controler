import { LEVELS_ORDER } from '../shared/constants.js';
import { isShortHalf } from '../shared/lesson-span.js';
import { S } from './state.js';
import { isMonthlyFeeLesson } from './absences.js';
import { countSlotAssignmentUnits } from './dual-subject.js';
import { buildFeeTablesHtml } from './print-sheet-html.js';
import { studentShortTuitionRate, tuitionDurationNote, tuitionRateFor } from './tuition-rates.js';

function numberInput(id){
  const v = parseInt(String(document.getElementById(id)?.value || '').replace(/[^\d]/g, ''), 10);
  return Number.isFinite(v) && v > 0 ? v : 0;
}

/** 入力中の受講科目（希望コマ）を、毎週の授業として並べる */
function formWeeklyLessons(){
  const list = [];
  (S.formCourses || []).forEach(c=>{
    (c.desiredSlots || []).forEach(ds=>{
      list.push({ studentId:'form', day: ds.day, slot: ds.slot, subject: c.subject, half: ds.half, dualGroupId: ds.dualGroupId || null, oneToOne: !!c.oneToOne });
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
  const studentLike = { level, grade, tuitionCourse: course };
  const fullRate = tuitionRateFor(S.tuitionGradeRates, level, grade, course);
  const tuitionLessons = lessons.filter(a=> !isMonthlyFeeLesson(a));
  const seenDual = new Set();
  let fullCount = 0;
  let shortCount = 0;
  let oneCount = 0;
  let tuitionMonthly = 0;
  tuitionLessons.forEach(a=>{
    if(a.dualGroupId){
      const key = `${a.slot}:${a.dualGroupId}`;
      if(seenDual.has(key)) return;
      seenDual.add(key);
    }
    const pair = a.dualGroupId
      ? tuitionLessons.filter(x=> x.dualGroupId === a.dualGroupId && x.slot === a.slot)
      : [a];
    const one = pair.some(x=> x.oneToOne);
    const rate = isShortHalf(a.half)
      ? studentShortTuitionRate(one ? S.tuitionGradeRatesShortOne : S.tuitionGradeRatesShort, studentLike)
      : tuitionRateFor(one ? S.tuitionGradeRatesOne : S.tuitionGradeRates, level, grade, course);
    if(one) oneCount++;
    if(isShortHalf(a.half)){
      shortCount++;
      tuitionMonthly += rate * 4;
    }else{
      fullCount++;
      tuitionMonthly += rate * 4;
    }
  });
  const durationNote = tuitionDurationNote({ fullCount, shortCount, oneCount });
  return {
    fees: S.studentFees || {},
    rate: fullRate,
    tuitionMonthly,
    durationNote,
    weeklyUnits: countSlotAssignmentUnits(tuitionLessons),
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
