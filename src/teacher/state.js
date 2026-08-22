import { initTeacherFirebase } from '../shared/firebase-config.js';

export const { fbAuth, fbDb } = initTeacherFirebase();

export const DAY_ORDER = {'月':0,'火':1,'水':2,'木':3,'金':4,'土':5,'日':6};

/** Mutable app state */
export const S = {
  regularClosedDays: ['日'],
  holidayAutoDetect: false,
  customClosures: [],
  classroomSettingsTimer: null,
  myAdminUid: null,
  myTeacherId: null,
  myTeacherName: '',
  curYear: undefined,
  curMonth: undefined,
  scheduleDoc: {months:{}},
  pendingRequests: [],
  localOverrides: {},
  scheduleTimer: null,
  lastLocalScheduleEditAt: 0,
  newAssignments: [],
  myAssignmentEntries: [],
  myCalYear: undefined,
  myCalMonth: undefined,
  myAssignTimer: null,
};

