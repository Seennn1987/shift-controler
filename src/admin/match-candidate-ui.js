import { S } from './state.js';
import { buildCandidateBadgeLabels } from './matching-config.js';
import { isPreferredPair } from './teacher-schedule-tab.js';

function escapeAttr(v){
  return String(v ?? '').replace(/"/g, '&quot;');
}

export function buildPrefPairActionHtmlForTeacher(studentId, courseId, teacherId){
  if(!teacherId) return '';
  const common = `data-student="${escapeAttr(studentId)}" data-course="${escapeAttr(courseId)}" data-teacher="${escapeAttr(teacherId)}"`;
  if(isPreferredPair(studentId, courseId, teacherId)){
    return `<span class="pref-pair-assigned-badge">担当生徒</span>
      <button type="button" class="ghost pref-pair-unset-btn" ${common}>解除</button>`;
  }
  return `<button type="button" class="ghost pref-pair-set-btn" ${common}>担当生徒にする</button>`;
}

function buildPrefPairActionHtml(cand, studentId, courseId){
  return buildPrefPairActionHtmlForTeacher(studentId, courseId, cand.teacher.id);
}

export function renderMatchCandidateList(candidates, opts){
  const {
    studentId, courseId, subject, day, slot,
    dateStr = '',
    btnClass = 'confirm-btn',
    roomFull = false,
    showConfirm = true,
    showPrefPairAction = true,
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
      .filter(label=> !(showPrefPairAction && cand.prefPair && label === '担当生徒'))
      .map(label=> `<span class="match-reason-badge">${label}</span>`)
      .join('');
    const prefHtml = showPrefPairAction ? buildPrefPairActionHtml(cand, studentId, courseId) : '';
    const confirmHtml = showConfirm ? `<button type="button" class="${btnClass}"
        data-student="${escapeAttr(studentId)}"
        data-course="${escapeAttr(courseId)}"
        data-subject="${escapeAttr(subject)}"
        data-day="${escapeAttr(day)}"
        data-slot="${slot}"
        data-teacher="${escapeAttr(cand.teacher.id)}"
        ${dateStr ? `data-date="${escapeAttr(dateStr)}"` : ''}>講師を決める</button>` : '';
    html += `<div class="match-cand-row">
      <span class="match-cand-rank">${idx + 1}</span>
      <span class="match-cand-name">${cand.teacher.name}</span>
      <span class="match-cand-badges">${badges}</span>
      <div class="match-cand-actions">${prefHtml}${confirmHtml}</div>
    </div>`;
  });
  html += '</div>';
  return html;
}
