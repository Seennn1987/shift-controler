import { SLOTS } from '../shared/constants.js';
import { S } from './state.js';
import { shortName } from './calendar.js';
import { isAvailable, isTeacherAvailableOnDate } from './schedule-core.js';
import {
  countRoomSlot,
  countRoomSlotOnDate,
  countTeacherSlot,
  countTeacherSlotOnDate,
  findEffectiveAssignment,
  getActiveYearMonth,
  teacherHasSubmittedMonth,
} from './teacher-schedule-tab.js';

function escapeHtml(str){
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}

export function getCapableTeachers(level, subject){
  return S.teachers.filter(t=> t.subjects.some(ts=> ts.level === level && ts.subject === subject));
}

/** 生徒登録時：教科・コマだけ決まった状態での可否（プレビュー用） */
export function analyzeSubjectAtSlot(level, subject, day, slotId, yearMonth){
  return analyzePendingMatchSlot(
    { id: '__slot_preview__', level },
    { id: '__slot_preview__', subject },
    day,
    slotId,
    yearMonth,
  );
}

/** 教科選択リスト用の短いバッジ文言（案1） */
export function subjectPickerBadgeLabel(analysis){
  if(analysis.status === 'priority'){
    return analysis.availableCount > 0
      ? `1人コマあり（${analysis.availableCount}名）`
      : '1人コマあり';
  }
  if(analysis.status === 'ready'){
    return analysis.availableCount > 0
      ? `担当可能（${analysis.availableCount}名）`
      : '担当可能';
  }
  if(analysis.status === 'no-capable' || analysis.status === 'no-shift') return '担当不可';
  if(analysis.status === 'room-full') return '教室満員';
  if(analysis.status === 'closed') return '定休日';
  return '担当不可';
}

/** 未確定コマの状態（dateStr があるときはその日のシフトで判定） */
export function analyzePendingMatchSlot(student, course, day, slotId, yearMonth, dateStr){
  const ym = getActiveYearMonth(yearMonth);
  const studentId = student.id;

  if(S.regularClosedDays.includes(day)){
    return { status:'closed', label:'定休日', capableCount:0, availableCount:0, detailLines:['この曜日は定休日です。'] };
  }

  const capable = getCapableTeachers(student.level, course.subject);
  if(capable.length === 0){
    return {
      status:'no-capable',
      label:'担当不可',
      capableCount:0,
      availableCount:0,
      detailLines:['この学年・教科を教えられる講師が登録されていません。'],
    };
  }

  const roomUsed = dateStr
    ? countRoomSlotOnDate(dateStr, slotId, studentId)
    : countRoomSlot(day, slotId, studentId, ym);
  if(roomUsed >= S.roomCapacity){
    return {
      status:'room-full',
      label:'教室満室',
      capableCount:capable.length,
      availableCount:0,
      detailLines:[`教室定員（${S.roomCapacity}人）に達しています。`],
    };
  }

  const teacherHasSlot = (teacher)=>{
    if(dateStr) return isTeacherAvailableOnDate(teacher.id, dateStr, slotId);
    return isAvailable(teacher, day, slotId);
  };
  const teacherUsedCount = (teacherId, excludeId)=>{
    if(dateStr) return countTeacherSlotOnDate(teacherId, dateStr, slotId, excludeId);
    return countTeacherSlot(teacherId, day, slotId, excludeId, ym);
  };

  const available = capable.filter(t=>{
    if(!teacherHasSlot(t)) return false;
    return teacherUsedCount(t.id, studentId) < S.teacherCapacity;
  });

  const priorityTeachers = available.filter(t=> teacherUsedCount(t.id, null) === 1);
  const slotLabel = SLOTS.find(s=> s.id === slotId)?.label || '';

  if(available.length > 0){
    const detailLines = [];
    if(priorityTeachers.length > 0){
      const names = priorityTeachers.map(t=> `${shortName(t.name)}先生`).join('、');
      detailLines.push(`同コマで1名のみ担当中の講師がいます（${names}）。優先的に埋めると効率が良くなります。`);
    }
    return {
      status: priorityTeachers.length > 0 ? 'priority' : 'ready',
      label: priorityTeachers.length > 0 ? '1人コマあり' : '担当可能',
      capableCount: capable.length,
      availableCount: available.length,
      priorityTeachers,
      detailLines,
    };
  }

  const notSubmitted = capable.filter(t=> !teacherHasSubmittedMonth(t.id, ym));
  const submittedNoSlot = capable.filter(t=>
    teacherHasSubmittedMonth(t.id, ym) && !teacherHasSlot(t)
  );
  const atCapacity = capable.filter(t=>
    teacherHasSubmittedMonth(t.id, ym) &&
    teacherHasSlot(t) &&
    teacherUsedCount(t.id, studentId) >= S.teacherCapacity
  );

  const detailLines = [];
  notSubmitted.forEach(t=> detailLines.push(`${t.name}：${Number(ym.slice(5))}月のシフト未提出`));
  if(dateStr){
    submittedNoSlot.forEach(t=> detailLines.push(`${t.name}：${dateStr}はシフト未登録`));
  }else{
    submittedNoSlot.forEach(t=> detailLines.push(`${t.name}：${day}曜${slotLabel}はシフト未登録`));
  }
  atCapacity.forEach(t=> detailLines.push(`${t.name}：講師定員に達しています`));

  return {
    status:'no-shift',
    label:'担当不可',
    capableCount: capable.length,
    availableCount: 0,
    notSubmitted,
    submittedNoSlot,
    detailLines: detailLines.length ? detailLines : ['対応講師はいますが、このコマでは組めません。'],
  };
}

export function renderMatchSlotStatusBadge(analysis){
  const map = {
    priority: 'match-status-badge is-priority',
    ready: 'match-status-badge is-ready',
    'no-shift': 'match-status-badge is-no-capable',
    'no-capable': 'match-status-badge is-no-capable',
    closed: 'match-status-badge is-closed',
    'room-full': 'match-status-badge is-no-shift',
  };
  const cls = map[analysis.status] || 'match-status-badge is-no-capable';
  return `<span class="${cls}">${subjectPickerBadgeLabel(analysis)}</span>`;
}

export function renderSubjectPickerBadge(analysis){
  const map = {
    priority: 'match-status-badge is-priority',
    ready: 'match-status-badge is-ready',
    'no-shift': 'match-status-badge is-no-capable',
    'no-capable': 'match-status-badge is-no-capable',
    closed: 'match-status-badge is-closed',
    'room-full': 'match-status-badge is-no-shift',
  };
  const cls = map[analysis.status] || 'match-status-badge';
  return `<span class="${cls} scp-status-badge">${subjectPickerBadgeLabel(analysis)}</span>`;
}

export function renderMatchSlotStatusDetail(analysis){
  if(!analysis.detailLines?.length) return '';
  return `<div class="match-status-detail">${analysis.detailLines.map(line=>
    `<div class="match-status-detail-line">${escapeHtml(line)}</div>`
  ).join('')}</div>`;
}

export function renderMatchSlotStatusBlock(analysis){
  return renderMatchSlotStatusBadge(analysis) + renderMatchSlotStatusDetail(analysis);
}

/** 全生徒の未確定コマを状態別に集計 */
export function collectPendingSlotSummary(yearMonth){
  const ym = getActiveYearMonth(yearMonth);
  const summary = { priority:0, ready:0, noShift:0, total:0 };
  S.students.forEach(s=>{
    s.courses.forEach(course=>{
      course.desiredSlots.forEach(ds=>{
        if(findEffectiveAssignment(s.id, course.id, ds.day, ds.slot, ym)) return;
        const analysis = analyzePendingMatchSlot(s, course, ds.day, ds.slot, ym);
        summary.total++;
        if(analysis.status === 'priority') summary.priority++;
        else if(analysis.status === 'ready') summary.ready++;
        else summary.noShift++;
      });
    });
  });
  return summary;
}

export function renderMatchSlotSummaryBar(summary){
  if(summary.total === 0){
    return '<div class="match-slot-summary-bar is-all-done">講師が決まっていない希望コマはありません。</div>';
  }
  return `<div class="match-slot-summary-bar">
    <span class="match-slot-summary-item"><span class="match-status-badge is-priority">1人コマあり</span> ${summary.priority}件</span>
    <span class="match-slot-summary-item"><span class="match-status-badge is-ready">担当可能</span> ${summary.ready}件</span>
    <span class="match-slot-summary-item"><span class="match-status-badge is-no-capable">担当不可</span> ${summary.noShift}件</span>
  </div>`;
}
