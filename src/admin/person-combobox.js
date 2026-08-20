import { SUBJECT_MAP } from '../shared/constants.js';
import { matchesPersonSearch, sortByNameKana } from '../shared/person-sort.js';
import { gradeLabel } from './schedule-core.js';

export function studentComboboxItem(student){
  const kanaMissing = !(student.nameKana && student.nameKana.trim());
  const grade = gradeLabel(student);
  return {
    value: student.id,
    label: `${student.name}（${grade}）`,
    searchText: `${student.name} ${student.nameKana || ''} ${grade}`,
    muted: kanaMissing,
  };
}

export function teacherComboboxItem(teacher){
  const kanaMissing = !(teacher.nameKana && teacher.nameKana.trim());
  return {
    value: teacher.id,
    label: teacher.name,
    searchText: `${teacher.name} ${teacher.nameKana || ''}`,
    muted: kanaMissing,
  };
}

export function studentComboboxGroups(students, { valuePrefix = '' } = {}){
  const sorted = sortByNameKana(students, s=> s.nameKana, s=> s.name);
  const withKana = sorted.filter(s=> s.nameKana && s.nameKana.trim());
  const withoutKana = sorted.filter(s=> !s.nameKana || !s.nameKana.trim());
  const groups = [];
  if(withKana.length){
    groups.push({
      label: '生徒',
      items: withKana.map(s=>({
        ...studentComboboxItem(s),
        value: `${valuePrefix}${s.id}`,
      })),
    });
  }
  if(withoutKana.length){
    groups.push({
      label: '生徒（読み仮名未設定）',
      items: withoutKana.map(s=>({
        ...studentComboboxItem(s),
        value: `${valuePrefix}${s.id}`,
      })),
    });
  }
  return groups;
}

export function teacherComboboxGroups(teachers, { valuePrefix = '' } = {}){
  const sorted = sortByNameKana(teachers, t=> t.nameKana, t=> t.name);
  const withKana = sorted.filter(t=> t.nameKana && t.nameKana.trim());
  const withoutKana = sorted.filter(t=> !t.nameKana || !t.nameKana.trim());
  const groups = [];
  if(withKana.length){
    groups.push({
      label: '講師',
      items: withKana.map(t=>({
        ...teacherComboboxItem(t),
        value: `${valuePrefix}${t.id}`,
      })),
    });
  }
  if(withoutKana.length){
    groups.push({
      label: '講師（読み仮名未設定）',
      items: withoutKana.map(t=>({
        ...teacherComboboxItem(t),
        value: `${valuePrefix}${t.id}`,
      })),
    });
  }
  return groups;
}

export function calFilterGroups(students, teachers){
  return [
    ...studentComboboxGroups(students, { valuePrefix: 's:' }),
    ...teacherComboboxGroups(teachers, { valuePrefix: 't:' }),
  ];
}

export function buildSubjectFilterGroups(){
  const groups = [];
  Object.entries(SUBJECT_MAP).forEach(([level, subs])=>{
    const items = subs.map(sub=>{
      const label = `${level}｜${sub}`;
      return {
        value: `${level}-${sub}`,
        label,
        searchText: `${level} ${sub} ${label}`,
      };
    }).sort((a,b)=> a.label.localeCompare(b.label, 'ja'));
    groups.push({ label: level, items });
  });
  return groups;
}

export function filterPeopleBySearch(items, query, getName, getKana, getExtra){
  const q = query.trim();
  if(!q) return items;
  return items.filter(it=> matchesPersonSearch(q, getName(it), getKana(it), getExtra ? getExtra(it) : ''));
}
