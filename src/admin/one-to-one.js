import { occupiesHalf } from '../shared/lesson-span.js';
import { countSlotAssignmentUnits } from './dual-subject.js';
import { valueOnDate } from './course-history.js';
import { S } from './state.js';

export function isOneToOneCourse(course, dateStr){
  if(!course) return false;
  return valueOnDate(course.oneToOneChanges, course.oneToOne === true, dateStr) === true;
}

export function findStudentCourse(studentId, courseId){
  const student = S.students.find(s=> s.id === studentId);
  return student?.courses?.find(c=> c.id === courseId) || null;
}

export function assignmentIsOneToOne(assignment, dateStr){
  if(!assignment) return false;
  if(assignment.extraBookingId) return assignment.oneToOne === true;
  return isOneToOneCourse(findStudentCourse(assignment.studentId, assignment.courseId), dateStr || assignment.oneTimeDate);
}

export function studentSubjectsAreOneToOne(studentId, subjects, dateStr){
  const student = S.students.find(s=> s.id === studentId);
  const names = subjects || [];
  return (student?.courses || []).some(c=> names.includes(c.subject) && isOneToOneCourse(c, dateStr));
}

/** 同じ90分の2教科は、どちらかが1対1なら1対1の金額 */
export function assignmentUsesOneToOnePrice(student, assignment, dateStr){
  if(!student || !assignment) return false;
  if(assignment.extraBookingId) return assignment.oneToOne === true;
  const when = dateStr || assignment.oneTimeDate;
  if(assignment.dualGroupId){
    const pair = (student.courses || []).filter(c=>
      (c.desiredSlots || []).some(ds=>
        ds.dualGroupId === assignment.dualGroupId && Number(ds.slot) === Number(assignment.slot)
      )
    );
    if(pair.some(c=> isOneToOneCourse(c, when))) return true;
  }
  const course = (student.courses || []).find(c=> c.id === assignment.courseId);
  return isOneToOneCourse(course, when);
}

export function listHasOneToOne(list, half, dateStr){
  const rows = half === 'early' || half === 'late'
    ? (list || []).filter(a=> occupiesHalf(a.half, half))
    : (list || []);
  return rows.some(a=> assignmentIsOneToOne(a, dateStr));
}

/** 1対1の科目がいる、またはこれから置く科目が1対1なら、その時間は1人まで */
export function teacherSeatCap(occupiedOneToOne, incomingOneToOne){
  return (occupiedOneToOne || incomingOneToOne) ? 1 : (Number(S.teacherCapacity) || 2);
}

function halvesOverlap(aHalf, bHalf){
  const early = occupiesHalf(aHalf, 'early') && occupiesHalf(bHalf, 'early');
  const late = occupiesHalf(aHalf, 'late') && occupiesHalf(bHalf, 'late');
  return early || late;
}

/** すでに隣の生徒がいる教科は、1対1にしない */
export function oneToOneShareBlockMessage(studentId, course){
  if(!studentId || !course) return '';
  const all = []
    .concat(S.assignments || [], S.pendingAssignments || [], S.draftAssignments || []);
  for(const ds of course.desiredSlots || []){
    const mine = all.filter(a=>
      a.studentId === studentId &&
      a.courseId === course.id &&
      a.day === ds.day &&
      Number(a.slot) === Number(ds.slot) &&
      a.teacherId &&
      halvesOverlap(a.half, ds.half)
    );
    for(const mineA of mine){
      const other = all.find(a=>
        a.teacherId === mineA.teacherId &&
        a.studentId !== studentId &&
        a.day === ds.day &&
        Number(a.slot) === Number(ds.slot) &&
        halvesOverlap(a.half, mineA.half)
      );
      if(!other) continue;
      const name = S.students.find(s=> s.id === other.studentId)?.name;
      const who = name ? `${name}さん` : '別の生徒';
      return `${course.subject}は${ds.day}曜のコマで${who}と一緒に組まれています。先に隣の生徒を外してください。`;
    }
  }
  return '';
}

/** 前半と後半のうち、より埋まっている側の「人数/定員」 */
export function busiestSeatText(entries, dateStr){
  const rows = entries || [];
  const baseCap = Number(S.teacherCapacity) || 2;
  let best = null;
  ['early', 'late'].forEach(half=>{
    const list = rows.filter(a=> occupiesHalf(a.half, half));
    const count = countSlotAssignmentUnits(list.map(e=>({
      studentId: e.studentId,
      day: e.day,
      slot: e.slot,
      half: e.half,
      dualGroupId: e.dualGroupId || null,
    })));
    const cap = list.some(a=> assignmentIsOneToOne(a, dateStr)) ? 1 : baseCap;
    const score = cap ? count / cap : 0;
    if(!best || score > best.score || (score === best.score && count > best.count)){
      best = { count, cap, score };
    }
  });
  if(!best) return `0/${baseCap}`;
  return `${best.count}/${best.cap}`;
}
