import { SLOTS } from '../shared/constants.js';
import { S } from './state.js';
import { isAvailable, isTeacherAvailableOnDate } from './schedule-core.js';
import {
  buildCandidateInfo,
  countRoomSlot,
  countRoomSlotOnDate,
  findAlternativeSlots,
  getActiveYearMonth,
} from './teacher-schedule-tab.js';
import { compareCandidateInfo } from './matching-config.js';
import { renderMatchCandidateList } from './match-candidate-ui.js';
import { teacherTeachesBoth } from './dual-subject.js';
import { getOwnerTeacher } from './owner-teacher.js';
import { isActivePerson } from './active-people.js';

function withOwnerCandidate(candidates, student, courseId, subject, day, slot, dateStr){
  const info = buildCandidateInfo(student.id, courseId, student.level, subject, day, slot, getOwnerTeacher(), dateStr);
  if(info.full) return candidates;
  return [...candidates, info];
}

export function buildMatchCandidatesHtml(student, courseId, subject, day, slot, dateStr, opts = {}){
  const {
    btnClass = 'confirm-btn',
    showConfirm = true,
  } = opts;
  const detailYearMonth = dateStr ? dateStr.slice(0, 7) : getActiveYearMonth();
  const candidates = withOwnerCandidate(
    S.teachers
      .filter(isActivePerson)
      .filter(t=> dateStr ? isTeacherAvailableOnDate(t.id, dateStr, slot) : isAvailable(t, day, slot))
      .filter(t=> t.subjects.some(ts=> ts.level === student.level && ts.subject === subject))
      .map(t=> buildCandidateInfo(student.id, courseId, student.level, subject, day, slot, t, dateStr))
      .sort(compareCandidateInfo),
    student, courseId, subject, day, slot, dateStr,
  );

  const roomUsed = dateStr ? countRoomSlotOnDate(dateStr, slot, student.id) : countRoomSlot(day, slot, student.id, detailYearMonth);
  const roomFull = roomUsed >= S.roomCapacity;
  const teacherCandidates = candidates.filter(c=> !c.teacher?.isOwner);
  const ownerOnly = teacherCandidates.length === 0 && candidates.length > 0;

  if(teacherCandidates.length === 0){
    const course = student.courses?.find(co=> co.id === courseId);
    const alternatives = course ? findAlternativeSlots(student.level, subject, course.desiredSlots) : [];
    let html = `<div class="match-none">候補講師がいません。</div>`;
    if(alternatives.length > 0){
      html += `<div class="matching-panel-alt-title">代替日程の候補</div>`;
      alternatives.forEach(alt=>{
        const altSlot = SLOTS.find(sl=> sl.id === alt.slot);
        html += `<div class="matching-panel-alt-item">${alt.day}曜 ${altSlot?.label || ''}（${altSlot?.time || ''}）</div>`;
      });
    }
    if(ownerOnly && !roomFull){
      html += renderMatchCandidateList(candidates, {
        studentId: student.id,
        courseId,
        subject,
        day,
        slot,
        dateStr,
        btnClass,
        roomFull,
        showConfirm,
      });
    }
    return html;
  }

  let html = renderMatchCandidateList(candidates, {
    studentId: student.id,
    courseId,
    subject,
    day,
    slot,
    dateStr,
    btnClass,
    roomFull,
    showConfirm,
  });
  if(!html && !roomFull){
    html = `<div class="match-none">定員に達しているため、候補講師はありません</div>`;
  }
  return html;
}

export function buildDualMatchCandidatesHtml(student, dualPair, day, slot, dateStr, opts = {}){
  const {
    btnClass = 'confirm-btn',
    showConfirm = true,
  } = opts;
  const [subjectA, subjectB] = dualPair.subjects;
  const courseId = dualPair.entries[0].course.id;
  const detailYearMonth = dateStr ? dateStr.slice(0, 7) : getActiveYearMonth();

  const candidates = withOwnerCandidate(
    S.teachers
      .filter(isActivePerson)
      .filter(t=> dateStr ? isTeacherAvailableOnDate(t.id, dateStr, slot) : isAvailable(t, day, slot))
      .filter(t=> teacherTeachesBoth(t, student.level, subjectA, subjectB))
      .map(t=> buildCandidateInfo(student.id, courseId, student.level, subjectA, day, slot, t, dateStr))
      .sort(compareCandidateInfo),
    student, courseId, subjectA, day, slot, dateStr,
  );

  const roomUsed = dateStr ? countRoomSlotOnDate(dateStr, slot, student.id) : countRoomSlot(day, slot, student.id, detailYearMonth);
  const roomFull = roomUsed >= S.roomCapacity;
  const teacherCandidates = candidates.filter(c=> !c.teacher?.isOwner);
  const ownerOnly = teacherCandidates.length === 0 && candidates.length > 0;

  if(teacherCandidates.length === 0){
    let html = `<div class="match-none">${subjectA}と${subjectB}の両方を教えられる候補講師がいません。</div>`;
    if(ownerOnly && !roomFull){
      html += renderMatchCandidateList(candidates, {
        studentId: student.id,
        courseId,
        subject: `${subjectA}・${subjectB}`,
        subjects: dualPair.subjects,
        day,
        slot,
        dateStr,
        btnClass,
        roomFull,
        showConfirm,
        dual: true,
      });
    }
    return html;
  }

  let html = renderMatchCandidateList(candidates, {
    studentId: student.id,
    courseId,
    subject: `${subjectA}・${subjectB}`,
    subjects: dualPair.subjects,
    day,
    slot,
    dateStr,
    btnClass,
    roomFull,
    showConfirm,
    dual: true,
  });
  if(!html && !roomFull){
    html = `<div class="match-none">定員に達しているため、候補講師はありません</div>`;
  }
  return html;
}
