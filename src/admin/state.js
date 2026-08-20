import { firebaseConfig, initPrimaryFirebase } from '../shared/firebase-config.js';

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
  editingStudentId: null,
  studentDataReady: false,
  assignments: [],
  pendingAssignments: [],
  roomCapacity: 12,
  teacherCapacity: 2,
  tuitionRates: {'小学':2900, '中学':3900, '高校':5200},
  saveTimer: null,
  firestoreReady: false,
  secondaryFbApp: null,
  teacherScheduleUnsub: null,
  approvalPromotionUnsub: null,
  syncClosureSettingsTimer: null,
  syncTeacherAssignmentsTimer: null,
  absences: [],
  teacherAbsences: [],
  teacherSubstitutions: [],
  finGradientMin: 25,
  finGradientMax: 60,
  preferredPairs: [],
  terms: [],
  editingTermId: null,
  regularClosedDays: ['日'],
  holidayAutoDetect: false,
  customClosures: [],
  editingClosureId: null,
  calYear: undefined,
  calMonth: undefined,
  calSelectedDate: null,
  calFilterStudentId: '',
  tsSelectedTeacherId: null,
  formCourses: [],
  finYear: undefined,
  finMonth: undefined,
  finIncludeTransport: true,
  calWeekAnchor: null,
  weekAxis: 'student',
  calMode: 'month',
  appInitialized: false,
  matchingPanelOpen: false,
  matchingPanelStudentId: null,
  matchingPanelSlot: null,
  matchingPriority: null,
  calendarDrawerView: 'day',
};

export function getSecondaryAuth(){
  if(!S.secondaryFbApp){
    S.secondaryFbApp = firebase.initializeApp(firebaseConfig, 'secondary');
  }
  return S.secondaryFbApp.auth();
}
