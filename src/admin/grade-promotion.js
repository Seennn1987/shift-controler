import { LEVEL_ABBR } from '../shared/constants.js';
import { getTodayStr } from '../shared/date-utils.js';
import { fbAuth, fbDb, S } from './state.js';

/** 4月始まりの年度。2026-04-01 → 2026、2026-03-31 → 2025 */
function schoolYearOf(dateStr){
  const [y, m] = String(dateStr || '').split('-').map(Number);
  if(!Number.isFinite(y) || !Number.isFinite(m)) return null;
  return m >= 4 ? y : y - 1;
}

function readStoredSchoolYear(value){
  const n = Number(value);
  if(!Number.isFinite(n) || n < 2000 || n > 2100) return null;
  return n;
}

function nextSchoolGrade(level, grade){
  const g = Number(grade);
  const hasGrade = Number.isFinite(g) && g >= 1;
  if(level === '小学'){
    if(!hasGrade) return { level, grade, changed: false };
    if(g >= 6) return { level: '中学', grade: 1, changed: true, renameSansu: true };
    return { level: '小学', grade: g + 1, changed: true };
  }
  if(level === '中学'){
    if(!hasGrade) return { level, grade, changed: false };
    if(g >= 3) return { level: '高校', grade: 1, changed: true };
    return { level: '中学', grade: g + 1, changed: true };
  }
  if(level === '高校'){
    if(!hasGrade) return { level, grade, changed: false };
    if(g >= 3) return { level: '高校', grade: 3, changed: false, stayedHigh3: true };
    return { level: '高校', grade: g + 1, changed: true };
  }
  return { level, grade, changed: false };
}

function gradeText(student){
  if(!student) return '';
  if(student.grade) return `${LEVEL_ABBR[student.level] || ''}${student.grade}`;
  return student.level || '';
}

function renameSansuOnRecord(record){
  if(!record) return;
  if(record.subject === '算数') record.subject = '数学';
  if(Array.isArray(record.subjects) && record.subjects.includes('算数')){
    record.subjects = record.subjects.map(s=> s === '算数' ? '数学' : s);
    if(typeof record.subject === 'string' && record.subject.includes('算数')){
      record.subject = record.subjects.join('・');
    }
  }
}

function renameSansuForStudent(studentId){
  const student = S.students.find(s=> s.id === studentId);
  (student?.courses || []).forEach(course=> renameSansuOnRecord(course));
  [S.assignments, S.pendingAssignments, S.draftAssignments].forEach(list=>{
    (list || []).forEach(entry=>{
      if(entry.studentId === studentId) renameSansuOnRecord(entry);
    });
  });
  (S.absences || []).forEach(absence=>{
    if(absence.studentId === studentId) renameSansuOnRecord(absence);
  });
}

function promoteAllStudentsOneYear(){
  let changedCount = 0;
  let high3Count = 0;
  (S.students || []).forEach(student=>{
    const next = nextSchoolGrade(student.level, student.grade);
    if(next.stayedHigh3) high3Count++;
    if(!next.changed) return;
    student.level = next.level;
    student.grade = next.grade;
    if(next.renameSansu) renameSansuForStudent(student.id);
    changedCount++;
  });
  return { changedCount, high3Count };
}

function buildPromotionNotice({ changedCount, high3Count }){
  if(changedCount === 0 && high3Count === 0) return null;
  const lines = ['今年度の進級を反映しました。'];
  if(changedCount > 0){
    lines.push('小6は中1、中3は高1になりました。希望コマと担当はそのままです。');
    lines.push('学年が変わった生徒の担当講師を、必要なら見直してください。');
  }
  if(high3Count > 0){
    lines.push('高校3年の生徒は学年をそのままにしています。');
  }
  return lines.join('\n');
}

async function syncPromotedTicketGrades(){
  const user = fbAuth.currentUser;
  if(!user) return;
  const byId = new Map((S.students || []).map(s=> [s.id, s]));
  const byName = new Map((S.students || []).map(s=> [s.name, s]));
  if(byId.size === 0) return;
  try{
    const snap = await fbDb.collection('assignmentApprovals')
      .where('adminUid', '==', user.uid).get();
    const updates = [];
    snap.forEach(doc=>{
      const data = doc.data();
      const student = (data.studentId && byId.get(data.studentId)) || byName.get(data.studentName);
      if(!student) return;
      const payload = { studentId: student.id, studentGrade: gradeText(student), studentName: student.name };
      if(student.level !== '小学'){
        if(data.subject === '算数') payload.subject = '数学';
        if(Array.isArray(data.subjects) && data.subjects.includes('算数')){
          payload.subjects = data.subjects.map(s=> s === '算数' ? '数学' : s);
          payload.subject = payload.subjects.join('・');
        }
      }
      updates.push(doc.ref.update(payload));
    });
    await Promise.all(updates);
  }catch(err){
    console.error('進級後の依頼表示の更新エラー:', err);
  }
}

function applyPromotionsUntil(currentYear){
  let changedCount = 0;
  let high3Count = 0;
  while(S.lastGradePromotionYear < currentYear){
    const step = promoteAllStudentsOneYear();
    changedCount += step.changedCount;
    high3Count += step.high3Count;
    S.lastGradePromotionYear += 1;
  }
  return { changedCount, high3Count };
}

async function applyGradePromotionsIfNeeded(){
  const currentYear = schoolYearOf(getTodayStr());
  if(!currentYear) return { didWrite: false };

  const stored = readStoredSchoolYear(S.lastGradePromotionYear);
  if(stored == null){
    S.lastGradePromotionYear = currentYear;
    return { didWrite: true };
  }
  S.lastGradePromotionYear = stored;
  if(stored >= currentYear) return { didWrite: false };

  const { changedCount, high3Count } = applyPromotionsUntil(currentYear);
  if(changedCount > 0) await syncPromotedTicketGrades();
  S.pendingGradePromotionNotice = buildPromotionNotice({ changedCount, high3Count });
  return { didWrite: true };
}

function takeGradePromotionNotice(){
  const notice = S.pendingGradePromotionNotice || null;
  S.pendingGradePromotionNotice = null;
  return notice;
}

export { applyGradePromotionsIfNeeded, takeGradePromotionNotice };
