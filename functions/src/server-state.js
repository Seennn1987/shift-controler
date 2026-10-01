// src/admin/state.js の代わりにバンドルされる。アプリの計算関数は、ここの S を参照する。
import { emptyGoogleCalendarState, normalizeGoogleCalendarState } from '../../src/admin/google-calendar-events.js';
import { normalizeClosedHolidayDates, areAllHolidaysClosed } from '../../src/shared/holidays.js';
import { normalizeMatchingPriority } from '../../src/admin/matching-config.js';
import { DEFAULT_STUDENT_FEES } from '../../src/shared/constants.js';
import { normalizeTuitionGradeRates } from '../../src/admin/tuition-rates.js';

export const firebaseConfig = {};
export const fbAuth = { currentUser: null };
export const fbDb = null;
export const STORAGE_KEY = 'teacher-schedule-list';
export function getSecondaryAuth(){
  throw new Error('readApi では使えません');
}

function initialState(){
  return {
    teacherSchedules: [],
    teachers: [],
    students: [],
    assignments: [],
    pendingAssignments: [],
    draftAssignments: [],
    absences: [],
    teacherAbsences: [],
    teacherSubstitutions: [],
    retiredTeacherLogins: [],
    terms: [],
    customClosures: [],
    preferredPairs: [],
    tuitionGradeRates: normalizeTuitionGradeRates(null),
    programmingMonthlyFee: 0,
    studentFees: { ...DEFAULT_STUDENT_FEES },
    regularClosedDays: ['日'],
    holidayAutoDetect: false,
    closedHolidayDates: [],
    roomCapacity: 12,
    teacherCapacity: 2,
    finGradientMin: 25,
    finGradientMax: 60,
    finIncludeTransport: true,
    matchingPriority: null,
    lastGradePromotionYear: null,
    officeHourlyRate: 1300,
    payrollOfficeHours: {},
    payrollLocks: {},
    googleCalendar: emptyGoogleCalendarState(),
  };
}

export const S = initialState();

function flattenTeacherSchedules(scheduleDocs){
  const result = [];
  scheduleDocs.forEach(d=>{
    Object.keys(d.months || {}).forEach(ym=>{
      const m = d.months[ym];
      result.push({ id: m.id, teacherId: d.teacherId, yearMonth: ym, status: m.status, days: m.days || {}, submittedBy: m.submittedBy || null });
    });
  });
  return result;
}

/** loadAppStateFromFirestore（src/admin/students-persistence.js）と同じ既定値で S を詰め直す */
export function fillState(appState, scheduleDocs){
  const d = appState || {};
  const fresh = initialState();
  Object.keys(S).forEach(k=> delete S[k]);
  Object.assign(S, fresh, {
    teachers: d.teachers || [],
    students: d.students || [],
    assignments: d.assignments || [],
    pendingAssignments: d.pendingAssignments || [],
    draftAssignments: d.draftAssignments || [],
    absences: d.absences || [],
    teacherAbsences: d.teacherAbsences || [],
    teacherSubstitutions: d.teacherSubstitutions || [],
    retiredTeacherLogins: d.retiredTeacherLogins || [],
    terms: d.terms || [],
    customClosures: d.customClosures || [],
    preferredPairs: d.preferredPairs || [],
    tuitionGradeRates: normalizeTuitionGradeRates(d),
    programmingMonthlyFee: d.programmingMonthlyFee != null ? d.programmingMonthlyFee : 0,
    studentFees: { ...DEFAULT_STUDENT_FEES, ...(d.studentFees || {}) },
    regularClosedDays: d.regularClosedDays || ['日'],
    roomCapacity: d.roomCapacity || 12,
    teacherCapacity: d.teacherCapacity || 2,
    finGradientMin: d.finGradientMin != null ? d.finGradientMin : 25,
    finGradientMax: d.finGradientMax != null ? d.finGradientMax : 60,
    matchingPriority: normalizeMatchingPriority(d.matchingPriority || null),
    lastGradePromotionYear: d.lastGradePromotionYear != null ? d.lastGradePromotionYear : null,
    officeHourlyRate: d.officeHourlyRate != null ? d.officeHourlyRate : 1300,
    payrollOfficeHours: d.payrollOfficeHours && typeof d.payrollOfficeHours === 'object' ? d.payrollOfficeHours : {},
    payrollLocks: d.payrollLocks && typeof d.payrollLocks === 'object' ? d.payrollLocks : {},
    googleCalendar: normalizeGoogleCalendarState(d.googleCalendar),
    teacherSchedules: flattenTeacherSchedules(scheduleDocs || []),
  });
  S.closedHolidayDates = normalizeClosedHolidayDates(d);
  S.holidayAutoDetect = areAllHolidaysClosed(S.closedHolidayDates);
}
