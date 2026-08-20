import { S } from './state.js';

let uiSyncHandler = null;

export function registerCalFilterUiSync(handler){
  uiSyncHandler = handler;
}

function syncCalFilterUi(){
  if(uiSyncHandler) uiSyncHandler(getCalFilterValue());
}

export function getCalFilterValue(){
  if(S.calFilterStudentId) return `s:${S.calFilterStudentId}`;
  if(S.calFilterTeacherId) return `t:${S.calFilterTeacherId}`;
  return '';
}

export function setCalFilterFromSelect(value){
  S.calFilterStudentId = '';
  S.calFilterTeacherId = '';
  if(value.startsWith('s:')) S.calFilterStudentId = value.slice(2);
  else if(value.startsWith('t:')) S.calFilterTeacherId = value.slice(2);
}

export function setCalFilterStudent(studentId){
  S.calFilterStudentId = studentId || '';
  S.calFilterTeacherId = '';
  syncCalFilterUi();
}

export function clearCalFilter(){
  S.calFilterStudentId = '';
  S.calFilterTeacherId = '';
  syncCalFilterUi();
}

export function hasCalFocusFilter(){
  return !!(S.calFilterStudentId || S.calFilterTeacherId);
}

export function resolveFilterStudent(){
  if(S.calFilterStudentId){
    return S.students.find(s=> s.id === S.calFilterStudentId) || null;
  }
  if(S.matchingPanelOpen && S.matchingPanelStudentId){
    return S.students.find(s=> s.id === S.matchingPanelStudentId) || null;
  }
  return null;
}

export function resolveFilterTeacher(){
  if(S.calFilterTeacherId){
    return S.teachers.find(t=> t.id === S.calFilterTeacherId) || null;
  }
  return null;
}
