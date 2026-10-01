import { SLOTS } from '../../src/shared/constants.js';
import { toDateStr, getTodayStr } from '../../src/shared/date-utils.js';
import { getEffectiveDayAssignments, getAbsenceRecordsOnDate } from '../../src/admin/absences.js';
import { getDayStatus } from '../../src/admin/calendar.js';
import { gradeLabel } from '../../src/admin/schedule-core.js';
import { findTeacher, getOwnerTeacher, isOwnerTeacherId } from '../../src/admin/owner-teacher.js';
import { buildPayrollViewModel, sumPayrollRows } from '../../src/admin/payroll.js';
import { computeMonthFinance } from '../../src/admin/finance-metrics.js';
import { countSlotAssignmentUnits } from '../../src/admin/dual-subject.js';
import { isActivePerson } from '../../src/admin/active-people.js';
import { S } from './server-state.js';
import { HttpError } from './http-error.js';
import { serializeValue } from './serialize.js';

const MAX_SHIFT_RANGE_DAYS = 62;
const SHIFT_PRIORITY_LABEL = { preferred: '優先', normal: '可能' };
const SCHEDULE_STATUS_LABEL = { draft: '下書き', submitted: '提出済み' };

const slotById = new Map(SLOTS.map(s=>{
  const [startTime, endTime] = s.time.split('〜');
  return [s.id, { label: s.label, startTime, endTime }];
}));

function slotTimes(slot){
  return slotById.get(Number(slot)) || { label: `${slot}講`, startTime: null, endTime: null };
}

function isRealDate(y, m, d){
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function parseDate(raw, name = 'date'){
  if(raw == null || raw === '') return getTodayStr();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw));
  if(!m || !isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))){
    throw new HttpError(400, `${name} は YYYY-MM-DD の形で指定してください（例: 2026-09-28）`);
  }
  return String(raw);
}

function parseMonth(raw){
  if(raw == null || raw === ''){
    const t = new Date();
    return { year: t.getFullYear(), monthIndex: t.getMonth() };
  }
  const m = /^(\d{4})-(\d{2})$/.exec(String(raw));
  const month = m ? Number(m[2]) : 0;
  if(!m || month < 1 || month > 12) throw new HttpError(400, 'month は YYYY-MM の形で指定してください（例: 2026-09）');
  return { year: Number(m[1]), monthIndex: month - 1 };
}

function addDays(dateStr, n){
  const d = new Date(`${dateStr}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayInfo(dateStr){
  const status = getDayStatus(dateStr);
  return {
    date: dateStr,
    weekday: status.weekday,
    open: status.type === 'open',
    closedReason: status.type === 'open' ? null : status.label,
  };
}

function lessonStatus(a){
  if(a.teacherAbsent) return '講師欠勤';
  if(a.pending) return '承認待ち';
  if(a.draft) return '仮組み';
  if(a.substituted) return '代講';
  if(a.kind === 'makeup') return '振替';
  return '確定';
}

function teacherName(id){
  const t = findTeacher(id);
  return t ? t.name : '(削除された講師)';
}

function toLessonRow(a, dateStr, weekday){
  const student = S.students.find(s=> s.id === a.studentId);
  const times = slotTimes(a.slot);
  return {
    date: dateStr,
    weekday,
    period: Number(a.slot),
    startTime: times.startTime,
    endTime: times.endTime,
    studentName: student ? student.name : '(削除された生徒)',
    grade: student ? gradeLabel(student) : '',
    subject: a.subject,
    teacherName: teacherName(a.teacherId),
    isPrincipal: isOwnerTeacherId(a.teacherId),
    status: lessonStatus(a),
    originalTeacherName: a.substituted && a.originalTeacherId ? teacherName(a.originalTeacherId) : null,
    studentId: a.studentId || null,
    teacherId: a.teacherId || null,
  };
}

function compareLessons(x, y){
  if(x.period !== y.period) return x.period - y.period;
  const t = x.teacherName.localeCompare(y.teacherName, 'ja');
  if(t !== 0) return t;
  return x.studentName.localeCompare(y.studentName, 'ja');
}

function lessonsOnDate(dateStr){
  const info = dayInfo(dateStr);
  const raw = getEffectiveDayAssignments(dateStr);
  const rows = raw.map(a=> toLessonRow(a, dateStr, info.weekday)).sort(compareLessons);
  return { info, raw, rows };
}

/** /lessons */
export function viewLessons(query){
  const date = parseDate(query.date);
  const teacher = query.teacher;
  if(teacher != null && teacher !== '' && teacher !== 'principal'){
    throw new HttpError(400, 'teacher に指定できるのは principal だけです');
  }
  const { info, rows } = lessonsOnDate(date);
  const items = teacher === 'principal' ? rows.filter(r=> r.isPrincipal) : rows;
  return { items, extra: { ...info } };
}

/** /summary */
export function viewSummary(query){
  const date = parseDate(query.date);
  const { info, raw, rows } = lessonsOnDate(date);
  const held = raw.filter(a=> !a.teacherAbsent);

  const teacherIds = [...new Set(held.map(a=> a.teacherId).filter(Boolean))];
  const teachersWorking = teacherIds
    .map(id=>{
      const periods = [...new Set(held.filter(a=> a.teacherId === id).map(a=> Number(a.slot)))].sort((p, q)=> p - q);
      return { teacherName: teacherName(id), isPrincipal: isOwnerTeacherId(id), periods, lessonCount: countSlotAssignmentUnits(held.filter(a=> a.teacherId === id)) };
    })
    .sort((p, q)=> p.teacherName.localeCompare(q.teacherName, 'ja'));

  const principalLessons = rows
    .filter(r=> r.isPrincipal)
    .map(r=> ({ period: r.period, startTime: r.startTime, studentName: r.studentName, subject: r.subject, status: r.status }));

  const lessonsByPeriod = SLOTS.map(s=>{
    const inSlot = held.filter(a=> Number(a.slot) === s.id);
    return { period: s.id, startTime: slotTimes(s.id).startTime, count: countSlotAssignmentUnits(inSlot) };
  });

  const attention = rows
    .filter(r=> r.status !== '確定')
    .map(r=> ({ period: r.period, startTime: r.startTime, studentName: r.studentName, subject: r.subject, teacherName: r.teacherName, status: r.status }));
  getAbsenceRecordsOnDate(date).forEach(rec=>{
    attention.push({
      period: rec.slot,
      startTime: slotTimes(rec.slot).startTime,
      studentName: rec.student ? rec.student.name : '(削除された生徒)',
      subject: rec.subjects && rec.subjects.length ? rec.subjects.join('・') : rec.subject,
      teacherName: null,
      status: '生徒欠席（振替未定）',
    });
  });
  attention.sort((a, b)=> a.period - b.period);

  return {
    items: rows,
    extra: {
      ...info,
      totalLessons: countSlotAssignmentUnits(held),
      teachersWorking,
      principalLessons,
      lessonsByPeriod,
      attention,
    },
  };
}

/** /shifts */
export function viewShifts(query){
  const from = parseDate(query.from, 'from');
  const to = query.to ? parseDate(query.to, 'to') : addDays(from, 6);
  if(to < from) throw new HttpError(400, 'to は from 以降の日付にしてください');
  const dates = [];
  for(let d = from; d <= to; d = addDays(d, 1)){
    dates.push(d);
    if(dates.length > MAX_SHIFT_RANGE_DAYS) throw new HttpError(400, `期間は${MAX_SHIFT_RANGE_DAYS}日以内にしてください`);
  }

  const items = [];
  dates.forEach(date=>{
    const info = dayInfo(date);
    const ym = date.slice(0, 7);
    S.teacherSchedules.filter(sch=> sch.yearMonth === ym).forEach(sch=>{
      (sch.days[date] || []).forEach(e=>{
        const times = slotTimes(e.slot);
        items.push({
          date,
          weekday: info.weekday,
          classroomOpen: info.open,
          period: Number(e.slot),
          startTime: times.startTime,
          endTime: times.endTime,
          teacherName: teacherName(sch.teacherId),
          availability: SHIFT_PRIORITY_LABEL[e.priority] || e.priority,
          scheduleStatus: SCHEDULE_STATUS_LABEL[sch.status] || sch.status || null,
          teacherId: sch.teacherId,
        });
      });
    });
  });
  items.sort((a, b)=> a.date.localeCompare(b.date) || a.period - b.period || a.teacherName.localeCompare(b.teacherName, 'ja'));
  return { items, extra: { from, to } };
}

/** /students */
export function viewStudents(){
  const items = S.students.map(s=> ({
    ...serializeValue(s),
    gradeLabel: gradeLabel(s),
    isActive: isActivePerson(s),
  }));
  return { items };
}

/** /teachers */
export function viewTeachers(){
  const items = S.teachers.map(t=> ({
    ...serializeValue(t),
    isPrincipal: false,
    isActive: isActivePerson(t),
  }));
  items.push({ ...serializeValue(getOwnerTeacher()), isPrincipal: true, isActive: true });
  return { items };
}

/** /payroll */
export function viewPayroll(query){
  const { year, monthIndex } = parseMonth(query.month);
  const vm = buildPayrollViewModel(year, monthIndex);
  return {
    items: vm.rows,
    extra: {
      yearMonth: vm.yearMonth,
      locked: vm.locked,
      officeHourlyRate: vm.officeHourlyRate,
      totals: sumPayrollRows(vm.rows),
    },
  };
}

function roundRatio(v){
  return v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;
}

/** /cost */
export function viewCost(query){
  const { year, monthIndex } = parseMonth(query.month);
  const f = computeMonthFinance(year, monthIndex, true);
  const item = {
    yearMonth: `${year}-${String(monthIndex + 1).padStart(2, '0')}`,
    studentCount: f.studentCount,
    lessonCount: f.lessonCount,
    revenue: f.revenue,
    lessonCost: f.lessonCost,
    transportCost: f.transportCost,
    cost: f.cost,
    costRatio: roundRatio(f.ratio),
    costRatioWithoutTransport: roundRatio(f.revenue > 0 ? f.lessonCost / f.revenue * 100 : null),
    gross: f.gross,
  };
  return { items: [item] };
}
