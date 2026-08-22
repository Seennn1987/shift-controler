import { S } from './state.js';
import { buildCandidateBadgeLabels } from './matching-config.js';

function escapeAttr(v){
  return String(v ?? '').replace(/"/g, '&quot;');
}

export function renderMatchCandidateList(candidates, opts){
  const {
    studentId, courseId, subject, day, slot,
    dateStr = '',
    btnClass = 'confirm-btn',
    roomFull = false,
    showConfirm = true,
  } = opts;

  if(roomFull){
    return `<div class="match-none">教室全体の定員（${S.roomCapacity}人）に達しています</div>`;
  }

  const available = candidates.filter(c=> !c.full);
  if(available.length === 0){
    return '';
  }

  let html = '<div class="match-cand-list">';
  available.forEach((cand, idx)=>{
    const badges = buildCandidateBadgeLabels(cand)
      .map(label=> `<span class="match-reason-badge">${label}</span>`)
      .join('');
    html += `<div class="match-cand-row">
      <span class="match-cand-rank">${idx + 1}</span>
      <span class="match-cand-name">${cand.teacher.name}</span>
      <span class="match-cand-badges">${badges}</span>
      ${showConfirm ? `<button type="button" class="${btnClass}"
        data-student="${escapeAttr(studentId)}"
        data-course="${escapeAttr(courseId)}"
        data-subject="${escapeAttr(subject)}"
        data-day="${escapeAttr(day)}"
        data-slot="${slot}"
        data-teacher="${escapeAttr(cand.teacher.id)}"
        ${dateStr ? `data-date="${escapeAttr(dateStr)}"` : ''}>担当を決める</button>` : ''}
    </div>`;
  });
  html += '</div>';
  return html;
}
