import { getCalFilterValue } from './cal-filter.js';
import {
  buildSubjectFilterGroups,
  calFilterGroups,
  studentComboboxGroups,
  teacherComboboxGroups,
} from './person-combobox.js';
import {
  migrateSelectToSearchCombobox,
  refreshSearchCombobox,
  setupSearchCombobox,
} from './search-combobox.js';
import { S } from './state.js';

let initialized = false;

const FILTER_COMBO_OPTS = {
  showResetOption: true,
  showClearButton: true,
};

const COMBOBOX_DEFAULTS = {
  calFilter: {
    ...FILTER_COMBO_OPTS,
    emptyLabel: 'すべて（教室全体）',
    resetLabel: 'すべて（教室全体）',
    searchPlaceholder: '名前・読み仮名で検索…',
  },
  subjectFilter: {
    ...FILTER_COMBO_OPTS,
    emptyLabel: '教科で絞り込み（すべて表示）',
    resetLabel: '教科で絞り込み（すべて表示）',
    searchPlaceholder: '教科名で検索…',
  },
  absenceQuickStudent: {
    showResetOption: true,
    emptyLabel: '生徒を選択…',
    resetLabel: '生徒を選択…',
    searchPlaceholder: '名前・読み仮名で検索…',
  },
  teacherAbsenceQuickTeacher: {
    showResetOption: true,
    emptyLabel: '講師を選択…',
    resetLabel: '講師を選択…',
    searchPlaceholder: '名前・読み仮名で検索…',
  },
  teacherListFilter: {
    ...FILTER_COMBO_OPTS,
    emptyLabel: 'すべて表示',
    resetLabel: 'すべて表示',
    searchPlaceholder: '名前・読み仮名で検索…',
  },
  studentListFilter: {
    ...FILTER_COMBO_OPTS,
    emptyLabel: 'すべて表示',
    resetLabel: 'すべて表示',
    searchPlaceholder: '名前・読み仮名で検索…',
  },
};

export function initSearchComboboxes(){
  if(initialized) return;
  initialized = true;
  Object.entries(COMBOBOX_DEFAULTS).forEach(([id, config])=>{
    migrateSelectToSearchCombobox(id, config);
  });
}

export function refreshCalFilterCombobox(){
  initSearchComboboxes();
  let cur = getCalFilterValue();
  if(!cur && S.matchingPanelOpen && S.matchingPanelStudentId){
    cur = `s:${S.matchingPanelStudentId}`;
  }
  const groups = calFilterGroups(S.students, S.teachers);
  const hasOption = !cur || groups.some(g=> g.items.some(it=> it.value === cur));
  if(!hasOption && cur){
    S.calFilterStudentId = '';
    S.calFilterTeacherId = '';
    cur = '';
  }
  refreshSearchCombobox('calFilter', {
    ...COMBOBOX_DEFAULTS.calFilter,
    groups,
    value: hasOption ? cur : '',
  });
  if(!hasOption && cur){
    // invalid selection cleared in hidden input via refresh
  }
}

export function refreshSubjectFilterCombobox(){
  initSearchComboboxes();
  const cur = document.getElementById('subjectFilter')?.value || '';
  refreshSearchCombobox('subjectFilter', {
    ...COMBOBOX_DEFAULTS.subjectFilter,
    groups: buildSubjectFilterGroups(),
    value: cur,
  });
}

export function refreshAbsenceStudentCombobox(){
  initSearchComboboxes();
  const cur = document.getElementById('absenceQuickStudent')?.value || '';
  refreshSearchCombobox('absenceQuickStudent', {
    ...COMBOBOX_DEFAULTS.absenceQuickStudent,
    groups: studentComboboxGroups(S.students),
    value: cur,
  });
}

export function refreshAbsenceTeacherCombobox(){
  initSearchComboboxes();
  const cur = document.getElementById('teacherAbsenceQuickTeacher')?.value || '';
  refreshSearchCombobox('teacherAbsenceQuickTeacher', {
    ...COMBOBOX_DEFAULTS.teacherAbsenceQuickTeacher,
    groups: teacherComboboxGroups(S.teachers),
    value: cur,
  });
}

export function refreshTeacherListFilterCombobox(){
  initSearchComboboxes();
  const cur = document.getElementById('teacherListFilter')?.value || '';
  const groups = teacherComboboxGroups(S.teachers);
  const hasOption = !cur || groups.some(g=> g.items.some(it=> it.value === cur));
  refreshSearchCombobox('teacherListFilter', {
    ...COMBOBOX_DEFAULTS.teacherListFilter,
    groups,
    value: hasOption ? cur : '',
  });
}

export function refreshStudentListFilterCombobox(){
  initSearchComboboxes();
  const cur = document.getElementById('studentListFilter')?.value || '';
  const groups = studentComboboxGroups(S.students);
  const hasOption = !cur || groups.some(g=> g.items.some(it=> it.value === cur));
  refreshSearchCombobox('studentListFilter', {
    ...COMBOBOX_DEFAULTS.studentListFilter,
    groups,
    value: hasOption ? cur : '',
  });
}

export function refreshAllPersonComboboxes(){
  refreshCalFilterCombobox();
  refreshSubjectFilterCombobox();
  refreshAbsenceStudentCombobox();
  refreshAbsenceTeacherCombobox();
  refreshTeacherListFilterCombobox();
  refreshStudentListFilterCombobox();
}

// 後方互換
export const refreshCalFilterOptions = refreshCalFilterCombobox;

export { setCalFilterStudent, clearCalFilter, setCalFilterFromSelect } from './cal-filter.js';
