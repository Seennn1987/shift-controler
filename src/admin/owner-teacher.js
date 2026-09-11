import { S } from './state.js';

export const OWNER_TEACHER_ID = '__owner__';

export function isOwnerTeacherId(id){
  return id === OWNER_TEACHER_ID;
}

export function isOwnerTeacher(teacherOrId){
  if(teacherOrId == null) return false;
  if(typeof teacherOrId === 'string') return teacherOrId === OWNER_TEACHER_ID;
  return teacherOrId.id === OWNER_TEACHER_ID || teacherOrId.isOwner === true;
}

export function getOwnerTeacher(){
  return {
    id: OWNER_TEACHER_ID,
    name: '教室長',
    nameKana: 'きょうしつちょう',
    perLessonRate: 0,
    dailyTransport: 0,
    subjects: [],
    isOwner: true,
  };
}

export function findTeacher(id){
  if(isOwnerTeacherId(id)) return getOwnerTeacher();
  return (S.teachers || []).find(t=> t.id === id) || null;
}

export function teachersForCalendarFilter(){
  return [...(S.teachers || []), getOwnerTeacher()];
}
