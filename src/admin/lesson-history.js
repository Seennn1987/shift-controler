import { SLOTS } from '../shared/constants.js';
import { toDateStr, getTodayStr } from '../shared/date-utils.js';
import { buildCalAlertWhenPill, buildCalAlertTeacherHead, buildCalAlertPersonHead, buildCalAlertSubjectTag, buildCalAlertRowBody, calAlertDateParts, escapeCalAlertText } from '../shared/cal-alert-row.js';
import { S } from './state.js';
import { getDayStatus } from './calendar.js';
import { getEffectiveDayAssignments, getAbsenceRecordsOnDate } from './absences.js';
import { assignmentAppliesOnDate } from './teacher-schedule-tab.js';
import { findTeacher } from './owner-teacher.js';
import { gradeLabel, subjectColor } from './schedule-core.js';
import { buildDualSubjectTagsHtml } from './dual-subject.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function daysBack(n){
  const d = new Date(`${getTodayStr()}T00:00:00`);
  d.setDate(d.getDate() - n);
  return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

function earliestStudentStart(){
  const starts = (S.students || []).map(s=> s.courseStartDate).filter(v=> typeof v === 'string' && DATE_RE.test(v)).sort();
  return starts[0] || null;
}

function historyRange({ student, teacher }){
  let start = null;
  let end = getTodayStr();
  if(student){
    start = DATE_RE.test(student.courseStartDate || '') ? student.courseStartDate : null;
    if(student.left && typeof student.leftDate === 'string' && student.leftDate <= end){
      end = daysBackFrom(student.leftDate, 1);
    }
  }else if(teacher){
    start = /^\d{4}-\d{2}$/.test(teacher.workStartYearMonth || '') ? `${teacher.workStartYearMonth}-01` : earliestStudentStart();
  }
  return { start: start || daysBack(365), end };
}

function daysBackFrom(dateStr, n){
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() - n);
  return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

function findMakeupSourceDate(studentId, dateStr, slot){
  const ab = (S.absences || []).find(x=>
    x.studentId === studentId && x.makeup?.date === dateStr && Number(x.makeup.slot) === Number(slot)
  );
  return ab?.date || null;
}

function findAbsentTeacherId(ab, dateStr){
  const a = (S.assignments || []).find(x=>
    x.studentId === ab.studentId && x.courseId === ab.courseId && x.day === ab.day &&
    Number(x.slot) === Number(ab.slot) && assignmentAppliesOnDate(x, dateStr)
  );
  return a?.teacherId || null;
}

function collectDayLessons(dateStr){
  const rows = [];
  const byKey = new Map();
  getEffectiveDayAssignments(dateStr).forEach(e=>{
    if(e.pending || e.draft) return;
    const key = e.dualGroupId ? `${e.studentId}|${e.slot}|${e.dualGroupId}` : `${e.studentId}|${e.slot}|${e.courseId}`;
    const existing = byKey.get(key);
    if(existing){
      if(!existing.subjects.includes(e.subject)) existing.subjects.push(e.subject);
      return;
    }
    let status = 'done';
    if(e.teacherAbsent) status = 'teacherAbsent';
    else if(e.substituted) status = 'sub';
    else if(e.kind === 'makeup') status = 'makeup';
    const row = {
      dateStr,
      slot: Number(e.slot),
      studentId: e.studentId,
      teacherId: e.teacherId,
      originalTeacherId: e.originalTeacherId || null,
      subjects: [e.subject],
      status,
      makeupFrom: e.kind === 'makeup' ? findMakeupSourceDate(e.studentId, dateStr, e.slot) : null,
    };
    byKey.set(key, row);
    rows.push(row);
  });
  getAbsenceRecordsOnDate(dateStr, { includeResolved: true }).forEach(r=>{
    const ab = r.absence;
    rows.push({
      dateStr,
      slot: Number(ab.slot),
      studentId: ab.studentId,
      teacherId: findAbsentTeacherId(ab, dateStr),
      originalTeacherId: null,
      subjects: r.subjects?.length ? [...r.subjects] : [ab.subject],
      status: 'absent',
      makeupTo: ab.makeup?.date || null,
    });
  });
  return rows;
}

/** 生徒または講師の、今日までの確定した授業（欠席・代講・振替・講師休みを含む）を新しい順に返す */
function collectLessonHistory({ studentId, teacherId }){
  const student = studentId ? S.students.find(s=> s.id === studentId) : null;
  const teacher = teacherId ? findTeacher(teacherId) : null;
  if(!student && !teacher) return [];
  const { start, end } = historyRange({ student, teacher });
  const result = [];
  const d = new Date(`${start}T00:00:00`);
  let guard = 0;
  while(guard++ < 3700){
    const dateStr = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
    if(dateStr > end) break;
    d.setDate(d.getDate() + 1);
    if(getDayStatus(dateStr).type !== 'open') continue;
    collectDayLessons(dateStr).forEach(row=>{
      if(student){
        if(row.studentId === student.id) result.push(row);
        return;
      }
      if(row.teacherId === teacher.id){
        result.push(row);
      }else if(row.status === 'sub' && row.originalTeacherId === teacher.id){
        result.push({ ...row, status: 'subbedOut' });
      }
    });
  }
  return result.sort((a, b)=> a.dateStr === b.dateStr ? b.slot - a.slot : (a.dateStr < b.dateStr ? 1 : -1));
}

function shortMd(dateStr){
  const [, m, d] = dateStr.split('-').map(Number);
  return `${m}/${d}`;
}

function badgeFor(row, view){
  const badge = (kind, text)=> `<span class="approval-badge ${kind}">${text}</span>`;
  switch(row.status){
    case 'makeup':
      return badge('pending', row.makeupFrom ? `振替（${shortMd(row.makeupFrom)}分）` : '振替');
    case 'sub':
      if(view === 'teacher'){
        const orig = findTeacher(row.originalTeacherId);
        return badge('pending', orig ? `代講（${escapeCalAlertText(orig.name)}の代わり）` : '代講');
      }
      return badge('pending', '代講');
    case 'subbedOut': {
      const sub = findTeacher(row.teacherId);
      return badge('pending', sub ? `代講：${escapeCalAlertText(sub.name)}` : '代講');
    }
    case 'absent':
      return badge('tentative', row.makeupTo ? `生徒欠席・振替 ${shortMd(row.makeupTo)}` : '生徒欠席');
    case 'teacherAbsent':
      return badge('tentative', '講師休み');
    default:
      return '';
  }
}

function summaryText(rows, view){
  const count = st=> rows.filter(r=> r.status === st).length;
  const done = rows.filter(r=> ['done', 'makeup', 'sub'].includes(r.status)).length;
  const parts = [`実施 ${done}コマ`];
  if(view === 'teacher' && count('subbedOut')) parts.push(`代講に交代 ${count('subbedOut')}回`);
  if(count('absent')) parts.push(`${view === 'teacher' ? '生徒欠席' : '欠席'} ${count('absent')}回`);
  if(count('teacherAbsent')) parts.push(`講師休み ${count('teacherAbsent')}回`);
  return parts.join('・');
}

function rowHtml(row, view){
  const student = S.students.find(s=> s.id === row.studentId);
  const level = student?.level || '中学';
  const { md, weekday } = calAlertDateParts(row.dateStr, getDayStatus);
  const slotLabel = SLOTS.find(s=> s.id === row.slot)?.label || `${row.slot}講`;
  const head = view === 'teacher'
    ? buildCalAlertPersonHead(student?.name || '不明', student ? gradeLabel(student) : '')
    : buildCalAlertTeacherHead(findTeacher(row.teacherId)?.name || '講師なし');
  const tags = row.subjects.length === 2
    ? buildDualSubjectTagsHtml(level, row.subjects, subjectColor)
    : buildCalAlertSubjectTag(subjectColor, level, row.subjects[0]);
  const tail = `<span class="cal-alert-row-tail">${tags}${badgeFor(row, view)}</span>`;
  return `<div class="approval-item cal-alert-row-c4">${buildCalAlertRowBody([buildCalAlertWhenPill(md, weekday, slotLabel), head, tail], 'person')}</div>`;
}

/** 行の下に開く「過去の授業」の箱 */
function renderLessonHistoryHtml({ studentId, teacherId }){
  const view = teacherId ? 'teacher' : 'student';
  const rows = collectLessonHistory({ studentId, teacherId });
  if(rows.length === 0){
    return '<div class="lesson-history"><div class="empty-note">今日までの確定した授業はありません。</div></div>';
  }
  return `<div class="lesson-history">
    <div class="lesson-history-summary">${summaryText(rows, view)}</div>
    <div class="approval-scroll">${rows.map(r=> rowHtml(r, view)).join('')}</div>
  </div>`;
}

export { collectLessonHistory, renderLessonHistoryHtml };
