// Firestore Emulator 専用の見本データ投入。本番に書き込まないよう、Emulator の接続先が無ければ止まる。
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

if(!process.env.FIRESTORE_EMULATOR_HOST){
  console.error('FIRESTORE_EMULATOR_HOST が未設定です。Emulator 以外には書き込みません。');
  process.exit(1);
}

initializeApp({ projectId: 'shift-controller-4ecaf' });
const db = getFirestore();
const ADMIN = 'admin-emulator';

const appState = {
  teachers: [
    { id: 't1', name: '佐藤 花子', nameKana: 'さとう はなこ', perLessonRate: 1500, dailyTransport: 500, subjects: [{ level: '中学', subject: '数学', preferred: true }] },
    { id: 't2', name: '鈴木 一郎', nameKana: 'すずき いちろう', perLessonRate: 1600, dailyTransport: 400, subjects: [{ level: '小学', subject: '算数', preferred: false }] },
  ],
  students: [
    { id: 's1', name: '山田 太郎', nameKana: 'やまだ たろう', level: '中学', grade: 3, courses: [{ id: 'c1', subject: '数学', desiredSlots: [{ day: '月', slot: 5 }] }] },
    { id: 's2', name: '田中 花', nameKana: 'たなか はな', level: '小学', grade: 5, freeLessonCount: 2, courseStartDate: '2026-09-01', courses: [{ id: 'c2', subject: '算数', desiredSlots: [{ day: '月', slot: 6 }] }] },
    { id: 's3', name: '高橋 健', nameKana: 'たかはし けん', level: '高校', grade: 1, courses: [{ id: 'c3', subject: '英語', desiredSlots: [{ day: '月', slot: 4 }] }] },
    { id: 's4', name: '伊藤 さくら', nameKana: 'いとう さくら', level: '中学', grade: 2, courses: [{ id: 'c4', subject: '英語', desiredSlots: [{ day: '月', slot: 5 }] }] },
  ],
  assignments: [
    { studentId: 's1', courseId: 'c1', teacherId: 't1', day: '月', slot: 5, subject: '数学' },
    { studentId: 's2', courseId: 'c2', teacherId: 't2', day: '月', slot: 6, subject: '算数' },
    { studentId: 's3', courseId: 'c3', teacherId: '__owner__', day: '月', slot: 4, subject: '英語' },
  ],
  pendingAssignments: [
    { studentId: 's4', courseId: 'c4', teacherId: 't2', day: '月', slot: 5, subject: '英語' },
  ],
  draftAssignments: [],
  absences: [
    { id: 'ab1', studentId: 's1', courseId: 'c1', subject: '数学', day: '月', slot: 5, date: '2026-10-05', status: 'resolved', makeup: { date: '2026-10-06', slot: 6, teacherId: 't1' } },
    { id: 'ab2', studentId: 's3', courseId: 'c3', subject: '英語', day: '月', slot: 4, date: '2026-10-05', status: 'pending', makeup: null },
  ],
  teacherAbsences: [
    { id: 'tabs1', teacherId: 't1', date: '2026-10-12', slots: [5], studentIdsBySlot: {} },
  ],
  teacherSubstitutions: [
    { teacherId: 't2', substituteTeacherId: 't1', date: '2026-10-05', slot: 6, studentId: 's2' },
  ],
  tuitionRates: { '小学': 2900, '中学': 3900, '高校': 5200 },
  regularClosedDays: ['日'],
  closedHolidayDates: [],
  officeHourlyRate: 1300,
  payrollOfficeHours: { '2026-09': { t1: 2 } },
  payrollLocks: {},
  updatedAt: Timestamp.fromDate(new Date('2026-09-28T08:30:00Z')),
};

await db.collection('appState').doc(ADMIN).set(appState);
await db.collection('teacherSchedules').doc(`${ADMIN}_t1`).set({
  adminUid: ADMIN, teacherId: 't1', teacherLoginUid: 'login-t1',
  months: { '2026-09': { id: 'tsch-t1-2026-09', status: 'submitted', days: { '2026-09-28': [{ slot: 5, priority: 'preferred' }, { slot: 6, priority: 'normal' }] } } },
});
await db.collection('assignmentApprovals').doc('ap1').set({
  adminUid: ADMIN, teacherId: 't2', teacherLoginUid: 'login-t2', studentId: 's4', studentName: '伊藤 さくら',
  subject: '英語', day: '月', slot: 5, status: 'pending', createdAt: Timestamp.fromDate(new Date('2026-09-27T01:00:00Z')),
  ref: db.doc(`appState/${ADMIN}`),
});
await db.collection('appState').doc(ADMIN).collection('emulatorOnly').doc('x').set({ note: 'サブコレクション表示の確認用' });
console.log('見本データを投入しました');
