import { S } from './state.js';
import { buildCandidateBadgeLabels } from './matching-config.js';
import { isPreferredPair } from './teacher-schedule-tab.js';

function escapeAttr(v){
  return String(v ?? '').replace(/"/g, '&quot;');
}

export function buildPrefPairActionHtmlForTeacher(studentId, courseId, teacherId, opts = {}){
  const { allowSet = true } = opts;
  if(!teacherId) return '';
  const common = `data-student="${escapeAttr(studentId)}" data-course="${escapeAttr(courseId)}" data-teacher="${escapeAttr(teacherId)}"`;
  if(isPreferredPair(studentId, courseId, teacherId)){
    return `<span class="pref-pair-assigned-badge">担当生徒</span>
      <button type="button" class="ghost pref-pair-unset-btn" ${common}>解除</button>`;
  }
  if(!allowSet) return '';
  return `<button type="button" class="ghost pref-pair-set-btn" ${common}>担当生徒にする</button>`;
}

function buildPrefPairActionHtml(cand, studentId, courseId, allowSet){
  return buildPrefPairActionHtmlForTeacher(studentId, courseId, cand.teacher.id, { allowSet });
}

export function renderMatchCandidateList(candidates, opts){
  const {
    studentId, courseId, subject, day, slot,
    dateStr = '',
    btnClass = 'confirm-btn',
    roomFull = false,
    showConfirm = true,
    showPrefPairAction = true,
    showPrefPairSetAction = false,
  } = opts;

  if(roomFull){
    return `<div class="match-none">教室全体の定員（${S.roomCapacity}人）に達しています</div>`;
  }

  const available = candidates.filter(c=> !c.full);
  if(available.length === 0){
    return '';
  }

  let html = '<div class="match-slot-rows">';
  available.forEach((cand, idx)=>{
    const badges = buildCandidateBadgeLabels(cand)
      .filter(label=> !(showPrefPairAction && cand.prefPair && label === '担当生徒'))
      .map(label=> `<span class="match-reason-badge">${label}</span>`)
      .join('');
    const prefHtml = showPrefPairAction
      ? buildPrefPairActionHtml(cand, studentId, courseId, showPrefPairSetAction)
      : '';
    const confirmHtml = showConfirm ? `<button type="button" class="${btnClass}"
        data-student="${escapeAttr(studentId)}"
        data-course="${escapeAttr(courseId)}"
        data-subject="${escapeAttr(subject)}"
        data-day="${escapeAttr(day)}"
        data-slot="${slot}"
        data-teacher="${escapeAttr(cand.teacher.id)}"
        ${dateStr ? `data-date="${escapeAttr(dateStr)}"` : ''}>この講師に依頼</button>` : '';
    html += `<div class="match-cand-row">
      <span class="match-cand-rank">${idx + 1}</span>
      <div class="match-cand-main">
        <div class="match-cand-head">
          <span class="match-cand-name">${cand.teacher.name}</span>
          <div class="match-cand-actions">${prefHtml}${confirmHtml}</div>
        </div>
        ${badges ? `<div class="match-cand-badges">${badges}</div>` : ''}
      </div>
    </div>`;
  });
  html += '</div>';
  return html;
}

export function buildDraftSlotCardHtml({
  slotLabel,
  slotTime,
  roomUsed,
  roomCapacity,
  subjectTagHtml,
  teacherName,
  studentId,
  courseId,
  weekday,
  slotId,
  dateStr,
  autoBadge = '',
}){
  const name = teacherName || '不明';
  return `<div class="match-slot mp-slot-card mp-slot-waiting">
    <div class="ms-slot-label">${slotLabel}（${slotTime}）<span class="mp-slot-meta">教室 ${roomUsed}/${roomCapacity}</span></div>
    <div class="mp-slot-subject">${subjectTagHtml}<span class="mp-slot-badge tentative">仮決め</span>${autoBadge}</div>
    <div class="match-slot-rows">
      <div class="match-cand-row">
        <span class="match-cand-rank">—</span>
        <div class="match-cand-main">
          <div class="match-cand-head">
            <span class="match-cand-name">${name}</span>
            <div class="match-cand-actions">
              <button type="button" class="mp-change-teacher-btn cancel-draft-btn"
                data-student="${escapeAttr(studentId)}"
                data-course="${escapeAttr(courseId)}"
                data-day="${escapeAttr(weekday)}"
                data-slot="${slotId}"
                data-date="${escapeAttr(dateStr)}">別の講師を選ぶ</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}

export function buildWaitingSlotCardHtml({
  slotLabel,
  slotTime,
  roomUsed,
  roomCapacity,
  subjectTagHtml,
  teacherName,
  studentId,
  courseId,
  weekday,
  slotId,
  dateStr,
}){
  const name = teacherName || '不明';
  return `<div class="match-slot mp-slot-card mp-slot-waiting">
    <div class="ms-slot-label">${slotLabel}（${slotTime}）<span class="mp-slot-meta">教室 ${roomUsed}/${roomCapacity}</span></div>
    <div class="mp-slot-subject">${subjectTagHtml}<span class="mp-slot-badge waiting">承認待ち</span></div>
    <div class="match-slot-rows">
      <div class="match-cand-row">
        <span class="match-cand-rank">—</span>
        <div class="match-cand-main">
          <div class="match-cand-head">
            <span class="match-cand-name">${name}</span>
            <div class="match-cand-actions">
              <button type="button" class="mp-change-teacher-btn"
                data-student="${escapeAttr(studentId)}"
                data-course="${escapeAttr(courseId)}"
                data-day="${escapeAttr(weekday)}"
                data-slot="${slotId}"
                data-date="${escapeAttr(dateStr)}">別の講師を選ぶ</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>`;
}
