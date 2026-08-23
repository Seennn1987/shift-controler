/** 小学生・90分2教科（45分×2）のデータ操作 */

export const ELEMENTARY_DUAL_LEVEL = '小学';

export function supportsDualSubjectSlot(level){
  return level === ELEMENTARY_DUAL_LEVEL;
}

export function genDualGroupId(){
  return `dual-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function isDualSlotEntry(ds){
  return !!ds?.dualGroupId;
}

export function findSlotEntries(formCourses, day, slot){
  const entries = [];
  formCourses.forEach(course=>{
    course.desiredSlots.forEach(ds=>{
      if(ds.day === day && ds.slot === slot){
        entries.push({ course, ds });
      }
    });
  });
  return entries;
}

export function findDualPairAtSlot(formCourses, day, slot){
  const entries = findSlotEntries(formCourses, day, slot);
  if(entries.length !== 2) return null;
  const dualGroupId = entries[0].ds.dualGroupId;
  if(!dualGroupId || dualGroupId !== entries[1].ds.dualGroupId) return null;
  const sorted = [...entries].sort((a, b)=>{
    if(a.ds.dualRole === 'first') return -1;
    if(b.ds.dualRole === 'first') return 1;
    return a.course.subject.localeCompare(b.course.subject, 'ja');
  });
  return {
    dualGroupId,
    entries: sorted,
    subjects: sorted.map(e=> e.course.subject),
  };
}

export function findSingleOccupant(formCourses, day, slot){
  const entries = findSlotEntries(formCourses, day, slot);
  if(entries.length === 1 && !entries[0].ds.dualGroupId) return entries[0].course;
  return null;
}

export function clearSlotAllSubjects(formCourses, day, slot){
  formCourses.forEach(c=>{
    c.desiredSlots = c.desiredSlots.filter(ds=> !(ds.day === day && ds.slot === slot));
  });
}

export function assignDualSlotSubjects(formCourses, genCourseId, day, slot, subjectA, subjectB){
  if(!subjectA || !subjectB || subjectA === subjectB) return false;
  clearSlotAllSubjects(formCourses, day, slot);
  const dualGroupId = genDualGroupId();
  [[subjectA, 'first'], [subjectB, 'second']].forEach(([subject, dualRole])=>{
    let course = formCourses.find(c=> c.subject === subject);
    if(!course){
      course = { id: genCourseId(), subject, weeklyCount: 0, desiredSlots: [] };
      formCourses.push(course);
    }
    course.desiredSlots.push({ day, slot, dualGroupId, dualRole });
  });
  return true;
}

export function formatDualSubjectLabel(subjects, separator = '+'){
  return subjects.filter(Boolean).join(separator);
}

export function findDualPairForStudent(student, day, slot){
  return findDualPairAtSlot(student?.courses || [], day, slot);
}

export function teacherTeachesBoth(teacher, level, subjectA, subjectB){
  if(!teacher || !subjectA || !subjectB || subjectA === subjectB) return false;
  return teacher.subjects.some(ts=> ts.level === level && ts.subject === subjectA) &&
    teacher.subjects.some(ts=> ts.level === level && ts.subject === subjectB);
}

/** 双教科ペアは slot 定員上1コマとして数える */
export function countSlotAssignmentUnits(assignments){
  const seenDual = new Set();
  let count = 0;
  assignments.forEach(a=>{
    if(a.dualGroupId){
      const key = `${a.studentId}:${a.day}:${a.slot}:${a.dualGroupId}`;
      if(seenDual.has(key)) return;
      seenDual.add(key);
    }
    count++;
  });
  return count;
}

export function buildDualSubjectTagsHtml(level, subjects, subjectColorFn){
  return subjects.map(sub=>{
    const c = subjectColorFn(level, sub);
    return `<span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${sub}</span>`;
  }).join('<span class="scc-dual-plus">+</span>');
}

export function resolveDualRowAssignmentState(student, dualPair, day, slot, yearMonth, dateStr, findEffectiveAssignment){
  const effs = dualPair.entries.map(({ course })=>
    findEffectiveAssignment(student.id, course.id, day, slot, yearMonth, dateStr));
  const assigned = effs.filter(e=> e?.entry);
  if(assigned.length === 0){
    return { existing: null, isPending: false, isDraft: false };
  }
  const teacherIds = new Set(assigned.map(e=> e.entry.teacherId));
  if(assigned.length !== dualPair.entries.length || teacherIds.size !== 1){
    return { existing: null, isPending: effs.some(e=> e?.isPending), isDraft: effs.some(e=> e?.isDraft) };
  }
  const first = assigned[0];
  return {
    existing: first.entry,
    isPending: effs.some(e=> e?.isPending),
    isDraft: effs.some(e=> e?.isDraft) && !effs.some(e=> e?.isPending),
  };
}
