import { SLOTS } from '../shared/constants.js';
import { S } from './state.js';
import { isAvailable } from './schedule-core.js';
import {
  buildCandidateInfo,
  countRoomSlot,
  findAlternativeSlots,
  getActiveYearMonth,
} from './teacher-schedule-tab.js';
import { compareCandidateInfo } from './matching-config.js';
import { renderMatchCandidateList } from './match-candidate-ui.js';

export function buildMatchCandidatesHtml(student, courseId, subject, day, slot, dateStr, opts = {}){
  const {
    btnClass = 'confirm-btn',
    showConfirm = true,
  } = opts;
  const detailYearMonth = dateStr ? dateStr.slice(0, 7) : getActiveYearMonth();
  const candidates = S.teachers
    .filter(t=> isAvailable(t, day, slot))
    .filter(t=> t.subjects.some(ts=> ts.level === student.level && ts.subject === subject))
    .map(t=> buildCandidateInfo(student.id, courseId, student.level, subject, day, slot, t))
    .sort(compareCandidateInfo);

  const roomUsed = countRoomSlot(day, slot, student.id, detailYearMonth);
  const roomFull = roomUsed >= S.roomCapacity;

  if(candidates.length === 0){
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
