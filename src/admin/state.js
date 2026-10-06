import { firebaseConfig, initPrimaryFirebase } from '../shared/firebase-config.js';
import { emptyGoogleCalendarState } from './google-calendar-events.js';
import { DEFAULT_STUDENT_FEES } from '../shared/constants.js';
import { normalizeTuitionGradeRates } from './tuition-rates.js';

export { firebaseConfig };
export const { fbAuth, fbDb } = initPrimaryFirebase();

export const STORAGE_KEY = 'teacher-schedule-list';

/** Mutable app state (ES modules cannot reassign imported bindings). */
export const S = {
  teacherSchedules: [],
  referenceYearMonth: '',
  teachers: [],
  editingId: null,
  dataReady: false,
  formRaiseSchedule: [],
  students: [],
  hideLeftStudents: true,
  hideLeftTeachers: true,
  studentLeaveFlash: null,
  teacherLeaveFlash: null,
  editingStudentId: null,
  studentDataReady: false,
  assignments: [],
  pendingAssignments: [],
  draftAssignments: [],
  roomCapacity: 12,
  teacherCapacity: 2,
  tuitionGradeRates: normalizeTuitionGradeRates(null),
  programmingMonthlyFee: 0,
  studentFees: { ...DEFAULT_STUDENT_FEES },
  saveTimer: null,
  firestoreReady: false,
  /** 読み込んだ／最後に保存した appState の保存回数。クラウドと食い違えば別の画面が先に保存している */
  stateRev: 0,
  saveInFlight: false,
  /** 別の画面との食い違いを見つけたら、読み直すまで保存しない */
  saveBlocked: false,
  secondaryFbApp: null,
  teacherSchedulePollTimer: null,
  approvalPromotionPollTimer: null,
  teacherSubjectsPollTimer: null,
  approvalSnapshotUnsub: null,
  snapshotProbeResult: null,
  lastLocalSubjectEditAt: 0,
  syncClosureSettingsTimer: null,
  syncTeacherAssignmentsTimer: null,
  absences: [],
  teacherAbsences: [],
  teacherSubstitutions: [],
  retiredTeacherLogins: [],
  finGradientMin: 25,
  finGradientMax: 60,
  preferredPairs: [],
  terms: [],
  editingTermId: null,
  regularClosedDays: ['日'],
  holidayAutoDetect: false,
  closedHolidayDates: [],
  customClosures: [],
  editingClosureId: null,
  calYear: undefined,
  calMonth: undefined,
  calSelectedDate: null,
  calFilterStudentId: '',
  calFilterTeacherId: '',
  tsSelectedTeacherId: null,
  formCourses: [],
  finYear: undefined,
  finMonth: undefined,
  finIncludeTransport: true,
  calWeekAnchor: null,
  weekAxis: 'student',
  calOpeningsShowSubjects: false,
  calMode: 'month',
  appInitialized: false,
  matchingPanelOpen: false,
  matchingPanelStudentId: null,
  matchingPanelSlot: null,
  /** 生徒登録画面から「コマを組む」で来たときの戻り先 */
  matchingReturnToStudentId: null,
  matchingPriority: null,
  lastGradePromotionYear: null,
  pendingGradePromotionNotice: null,
  officeHourlyRate: 1300,
  payrollOfficeHours: {},
  payrollOfficeDays: {},
  payrollLocks: {},
  googleCalendar: emptyGoogleCalendarState(),
  payYear: undefined,
  payMonth: undefined,
  calendarDrawerView: 'day',
  /** 振替先の日をカレンダーで選んでいるとき { absenceId, studentId, fromDate } */
  makeupPlacement: null,
};

export function getSecondaryAuth(){
  if(!S.secondaryFbApp){
    S.secondaryFbApp = firebase.initializeApp(firebaseConfig, 'secondary');
  }
  return S.secondaryFbApp.auth();
}
