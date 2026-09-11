import { pad2, toDateStr } from '../shared/date-utils.js';
import { sortByNameKana } from '../shared/person-sort.js';
import { getDayStatus } from './calendar.js';
import { getEffectiveDayAssignments, getTeacherRateForDate } from './absences.js';
import { S } from './state.js';
import { scheduleSave } from './students-persistence.js';

/** マネーフォワード クラウド給与の支給／控除／勤怠CSV。Version 3。事務手当は給与側新設後に列名を合わせる仮名。 */
export const MF_OFFICE_PAY_COLUMN = '事務手当';

export const MF_CSV_HEADERS = [
  'Version',
  '従業員識別子',
  '従業員番号',
  '姓',
  '名',
  '事業所名',
  '部門名',
  '職種名',
  '契約種別',
  '1日の所定労働時間',
  '所定労働日数(当月)',
  '所定労働日数(月平均)',
  '所定労働時間(当月)',
  '所定労働時間(月平均)',
  '出勤日数（平日）',
  '出勤日数（所定休日）',
  '出勤日数（法定休日）',
  '欠勤日数（平日）',
  '遅刻時間（平日）',
  '早退時間（平日）',
  '所定時間（平日）',
  '所定時間（所定休日）',
  '所定時間（法定休日）',
  '所定外時間（平日）',
  '法定外時間（平日）',
  '深夜法定外時間（平日）',
  '役員報酬(月給)',
  '基本給(月給)',
  '役職手当(月給)',
  '家族手当(月給)',
  '住宅手当(月給)',
  '営業手当(月給)',
  '残業手当(月給)',
  '深夜残業手当(月給)',
  '法定休日手当(月給)',
  '所定休日手当(月給)',
  '通勤手当/課税(月給)',
  '通勤手当/非課(月給)',
  MF_OFFICE_PAY_COLUMN,
  '固定残業手当（みなし）(月給)',
  '固定残業超過分手当(月給)',
  '基本給(時給)',
  '残業手当(時給)',
  '深夜残業手当(時給)',
  '法定休日手当(時給)',
  '所定休日手当(時給)',
  '通勤手当/課税(時給)',
  '通勤手当/非課(時給)',
  '基本給(日給)',
  '残業手当(日給)',
  '深夜残業手当(日給)',
  '法定休日手当(日給)',
  '所定休日手当(日給)',
  '通勤手当/課税(日給)',
  '通勤手当/非課(日給)',
  '健康保険料',
  '介護保険料',
  '子ども・子育て支援金',
  '厚生年金保険料',
  '雇用保険料',
  '所得税',
  '住民税',
  '備考欄',
];

export const DEFAULT_OFFICE_HOURLY_RATE = 1300;

export function payrollYearMonthKey(year, monthIndex){
  return `${year}-${pad2(monthIndex + 1)}`;
}

export function ensurePayrollMonth(){
  if(S.payYear === undefined){
    const t = new Date();
    S.payYear = t.getFullYear();
    S.payMonth = t.getMonth();
  }
}

export function parseOfficeHours(raw){
  const text = String(raw ?? '').trim();
  if(text === '') return 0;
  const n = Number(text);
  if(!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function computeOfficePay(hours, hourlyRate){
  const h = Number(hours) || 0;
  const rate = Number(hourlyRate) || 0;
  return Math.round(h * rate);
}

export function splitTeacherName(fullName){
  const text = String(fullName || '').trim();
  if(!text) return { lastName: '', firstName: '' };
  const parts = text.split(/\s+/);
  if(parts.length === 1) return { lastName: parts[0], firstName: '' };
  return { lastName: parts[0], firstName: parts.slice(1).join(' ') };
}

function emptyTeacherPay(teacher){
  return {
    teacherId: teacher.id,
    teacherName: teacher.name,
    nameKana: teacher.nameKana || '',
    employeeNumber: String(teacher.employeeNumber || '').trim(),
    lessonCount: 0,
    workDays: 0,
    lessonPay: 0,
    transportPay: 0,
    officeHours: 0,
    officePay: 0,
    total: 0,
  };
}

export function getOfficeHours(yearMonth, teacherId){
  const monthMap = S.payrollOfficeHours?.[yearMonth];
  const n = monthMap ? Number(monthMap[teacherId]) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function setOfficeHours(yearMonth, teacherId, hours){
  if(!S.payrollOfficeHours || typeof S.payrollOfficeHours !== 'object') S.payrollOfficeHours = {};
  if(!S.payrollOfficeHours[yearMonth] || typeof S.payrollOfficeHours[yearMonth] !== 'object'){
    S.payrollOfficeHours[yearMonth] = {};
  }
  if(!hours){
    delete S.payrollOfficeHours[yearMonth][teacherId];
    if(Object.keys(S.payrollOfficeHours[yearMonth]).length === 0){
      delete S.payrollOfficeHours[yearMonth];
    }
  }else{
    S.payrollOfficeHours[yearMonth][teacherId] = hours;
  }
  scheduleSave();
}

export function getPayrollLock(yearMonth){
  return S.payrollLocks?.[yearMonth] || null;
}

export function isPayrollLocked(yearMonth){
  return !!getPayrollLock(yearMonth);
}

function paidAssignmentsOnDate(dateStr){
  return getEffectiveDayAssignments(dateStr).filter(a=> !a.pending && !a.draft && !a.teacherAbsent);
}

export function computeLiveMonthPayroll(year, monthIndex, officeHourlyRate){
  const ym = payrollYearMonthKey(year, monthIndex);
  const days = new Date(year, monthIndex + 1, 0).getDate();
  const byId = new Map();
  (S.teachers || []).forEach(t=> byId.set(t.id, emptyTeacherPay(t)));

  for(let day = 1; day <= days; day++){
    const dateStr = toDateStr(year, monthIndex, day);
    if(getDayStatus(dateStr).type !== 'open') continue;
    const list = paidAssignmentsOnDate(dateStr);
    const teacherSlotSet = new Set();
    const teacherIdsToday = new Set();
    list.forEach(a=>{
      if(!a.teacherId || !byId.has(a.teacherId)) return;
      teacherSlotSet.add(`${a.teacherId}|${a.slot}`);
      teacherIdsToday.add(a.teacherId);
    });
    teacherSlotSet.forEach(key=>{
      const tid = key.split('|')[0];
      const teacher = S.teachers.find(t=> t.id === tid);
      const row = byId.get(tid);
      if(!teacher || !row) return;
      row.lessonCount += 1;
      row.lessonPay += getTeacherRateForDate(teacher, dateStr) || 0;
    });
    teacherIdsToday.forEach(tid=>{
      const teacher = S.teachers.find(t=> t.id === tid);
      const row = byId.get(tid);
      if(!teacher || !row) return;
      row.workDays += 1;
      row.transportPay += teacher.dailyTransport || 0;
    });
  }

  const rate = officeHourlyRate != null ? officeHourlyRate : (S.officeHourlyRate ?? DEFAULT_OFFICE_HOURLY_RATE);
  byId.forEach(row=>{
    row.officeHours = getOfficeHours(ym, row.teacherId);
    row.officePay = computeOfficePay(row.officeHours, rate);
    row.total = row.lessonPay + row.transportPay + row.officePay;
  });

  return sortByNameKana([...byId.values()], r=> r.nameKana, r=> r.teacherName);
}

export function buildPayrollViewModel(year, monthIndex){
  const ym = payrollYearMonthKey(year, monthIndex);
  const lock = getPayrollLock(ym);
  if(lock){
    return {
      yearMonth: ym,
      locked: true,
      officeHourlyRate: lock.officeHourlyRate,
      rows: lock.rows || [],
    };
  }
  const rate = S.officeHourlyRate ?? DEFAULT_OFFICE_HOURLY_RATE;
  return {
    yearMonth: ym,
    locked: false,
    officeHourlyRate: rate,
    rows: computeLiveMonthPayroll(year, monthIndex, rate),
  };
}

export function rowHasPayrollAmount(row){
  return (row.lessonPay || 0) > 0 || (row.transportPay || 0) > 0 || (row.officePay || 0) > 0;
}

export function teachersMissingEmployeeNumber(rows){
  return rows.filter(row=> rowHasPayrollAmount(row) && !row.employeeNumber);
}

function csvCell(value){
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

export function buildPayrollCsv(rows){
  const lines = [MF_CSV_HEADERS.map(csvCell).join(',')];
  rows.filter(rowHasPayrollAmount).forEach(row=>{
    const { lastName, firstName } = splitTeacherName(row.teacherName);
    const cells = {};
    MF_CSV_HEADERS.forEach(h=> { cells[h] = ''; });
    cells.Version = '3';
    cells['従業員番号'] = row.employeeNumber;
    cells['姓'] = lastName;
    cells['名'] = firstName;
    cells['基本給(月給)'] = String(row.lessonPay || 0);
    cells['通勤手当/非課(月給)'] = String(row.transportPay || 0);
    cells[MF_OFFICE_PAY_COLUMN] = String(row.officePay || 0);
    lines.push(MF_CSV_HEADERS.map(h=> csvCell(cells[h])).join(','));
  });
  return `${lines.join('\r\n')}\r\n`;
}

export function payrollCsvFilename(year, monthIndex){
  return `支給_控除_勤怠_${year}年${pad2(monthIndex + 1)}月.csv`;
}

export function downloadPayrollCsv(year, monthIndex, rows){
  const csv = buildPayrollCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = payrollCsvFilename(year, monthIndex);
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function lockPayrollMonth(year, monthIndex){
  const ym = payrollYearMonthKey(year, monthIndex);
  const rate = S.officeHourlyRate ?? DEFAULT_OFFICE_HOURLY_RATE;
  const rows = computeLiveMonthPayroll(year, monthIndex, rate);
  const missing = teachersMissingEmployeeNumber(rows);
  if(missing.length > 0){
    return { ok: false, msg: '従業員番号が未登録の講師がいます。講師登録から番号を入れてください。', missing };
  }
  if(!S.payrollLocks || typeof S.payrollLocks !== 'object') S.payrollLocks = {};
  S.payrollLocks[ym] = {
    lockedAt: new Date().toISOString(),
    officeHourlyRate: rate,
    rows,
  };
  scheduleSave();
  return { ok: true, rows };
}

export function unlockPayrollMonth(yearMonth){
  if(S.payrollLocks && S.payrollLocks[yearMonth]){
    delete S.payrollLocks[yearMonth];
    scheduleSave();
  }
}

export function sumPayrollRows(rows){
  return rows.reduce((acc, row)=>{
    acc.lessonCount += row.lessonCount || 0;
    acc.workDays += row.workDays || 0;
    acc.lessonPay += row.lessonPay || 0;
    acc.transportPay += row.transportPay || 0;
    acc.officePay += row.officePay || 0;
    acc.total += row.total || 0;
    return acc;
  }, { lessonCount: 0, workDays: 0, lessonPay: 0, transportPay: 0, officePay: 0, total: 0 });
}
