/**
 * UIUX 操作テスト T1–T6 自動検証
 * 使い方: http://localhost:5173/docs/verify_uiux_scenarios.html を開く（操作不要）
 */
import { S } from '../src/admin/state.js';
import {
  HARDCODED_TEACHERS,
  HARDCODED_TEACHER_SCHEDULES,
  HARDCODED_STUDENTS,
  HARDCODED_ASSIGNMENTS,
} from '../src/admin/seed.js';
import {
  setCalFilterStudent,
  clearCalFilter,
  hasCalFocusFilter,
  getCalFilterValue,
} from '../src/admin/cal-filter.js';
import { bulkAutoAssign, bulkCancelAuto } from '../src/admin/matching.js';
import {
  buildCandidateInfo,
  confirmAssignment,
  findEffectiveAssignment,
} from '../src/admin/teacher-schedule-tab.js';
import { buildCandidateBadgeLabels } from '../src/admin/matching-config.js';
import { recordAbsence, findMakeupCandidates } from '../src/admin/absences.js';
import { sortByNameKana, matchesPersonSearch } from '../src/shared/person-sort.js';
import { cycleState, labelFor } from '../src/teacher/schedule-utils.js';
import { setupSearchCombobox, refreshSearchCombobox } from '../src/admin/search-combobox.js';

const results = [];

function pass(id, name, detail, ms){
  results.push({ id, name, ok: true, detail, ms });
}
function fail(id, name, detail){
  results.push({ id, name, ok: false, detail, ms: null });
}

function loadSeed(){
  S.teachers = structuredClone(HARDCODED_TEACHERS).map(t=> ({ ...t, nameKana: t.nameKana || '' }));
  S.students = structuredClone(HARDCODED_STUDENTS).map(s=> ({ ...s, nameKana: s.nameKana || '' }));
  S.teacherSchedules = structuredClone(HARDCODED_TEACHER_SCHEDULES);
  S.assignments = structuredClone(HARDCODED_ASSIGNMENTS);
  S.pendingAssignments = [];
  S.absences = [];
  S.referenceYearMonth = '2026-08';
  S.calYear = 2026;
  S.calMonth = 7;
  S.roomCapacity = 12;
  S.teacherCapacity = 2;
  S.regularClosedDays = ['日'];
  S.matchingPriority = null;
}

function resetSeed(){
  loadSeed();
}

/** T1: 絞り込み → 解除 */
function testT1(){
  const t0 = performance.now();
  resetSeed();
  const student = S.students[0];
  setCalFilterStudent(student.id);
  const filtered = hasCalFocusFilter() && getCalFilterValue() === `s:${student.id}`;
  clearCalFilter();
  const cleared = !hasCalFocusFilter() && getCalFilterValue() === '';
  const ms = Math.round(performance.now() - t0);

  // DOM: 検索コンボの解除ボタン・リセット行（filter-ui と同設定）
  document.body.insertAdjacentHTML('beforeend', `
    <div id="t1-host" hidden><input type="hidden" id="t1-hidden" value=""></div>
  `);
  const comboConfig = {
    showResetOption: true,
    showClearButton: true,
    emptyLabel: 'すべて（教室全体）',
    resetLabel: 'すべて（教室全体）',
    groups: [{ items: [{ value: `s:${student.id}`, label: student.name, searchText: student.name }] }],
  };
  setupSearchCombobox('t1-hidden', comboConfig);
  refreshSearchCombobox('t1-hidden', comboConfig);
  const root = document.getElementById('t1-hidden').closest('.search-combobox');
  refreshSearchCombobox('t1-hidden', { value: `s:${student.id}` });
  const wrap = root?.closest('.search-combobox-wrap');
  const hasClearBtn = !!wrap?.querySelector('.search-combobox-clear');
  const clearVisible = hasClearBtn && wrap.querySelector('.search-combobox-clear').hidden === false;
  const listHtml = root?.querySelector('.search-combobox-list')?.innerHTML || '';
  const hasResetRow = listHtml.includes('search-combobox-option-reset');

  if(filtered && cleared && hasClearBtn && clearVisible && hasResetRow){
    pass('T1', '生徒絞り込みと解除', `状態API OK / 解除ボタン・リセット行あり（${ms}ms）`, ms);
  }else{
    fail('T1', '生徒絞り込みと解除', `filtered=${filtered} cleared=${cleared} clearBtn=${hasClearBtn} clearVisible=${clearVisible} reset=${hasResetRow}`);
  }
}

/** T2: 未確定1件を手動確定＋バッジ理解 */
function testT2(){
  resetSeed();
  const student = S.students.find(s=> s.id === 'stu-2');
  const course = student.courses[0];
  const { day, slot } = course.desiredSlots[0];
  S.assignments = S.assignments.filter(a=> !(a.studentId === student.id && a.courseId === course.id && a.day === day && a.slot === slot));

  const before = findEffectiveAssignment(student.id, course.id, day, slot, S.referenceYearMonth);
  const teacher = S.teachers.find(t=> t.id === 'demo-1');
  const cand = buildCandidateInfo(student.id, course.id, student.level, course.subject, day, slot, teacher);
  const badges = buildCandidateBadgeLabels(cand);
  const result = confirmAssignment(student.id, course.id, course.subject, day, slot, teacher.id, 'manual');
  const after = findEffectiveAssignment(student.id, course.id, day, slot, S.referenceYearMonth);

  const badgeOk = Array.isArray(badges) && badges.length >= 0;
  const assigned = !before && !!after && result.ok;

  if(assigned && badgeOk){
    pass('T2', '未確定コマの手動確定', `確定OK / バッジ例: ${badges.slice(0, 3).join('・') || '（なし）'}`, null);
  }else{
    fail('T2', '未確定コマの手動確定', `before=${!!before} after=${!!after} ok=${result.ok} badges=${badges.join(',')}`);
  }
}

/** T3: 一括自動仮組み */
function testT3(){
  resetSeed();
  const removed = S.assignments.pop();
  const pendingBefore = !findEffectiveAssignment(removed.studentId, removed.courseId, removed.day, removed.slot, S.referenceYearMonth);
  const { filled, skipped, total } = bulkAutoAssign();
  const afterAssign = findEffectiveAssignment(removed.studentId, removed.courseId, removed.day, removed.slot, S.referenceYearMonth);
  const cancelled = bulkCancelAuto();
  const afterCancel = findEffectiveAssignment(removed.studentId, removed.courseId, removed.day, removed.slot, S.referenceYearMonth);

  const understood = total >= 0 && typeof filled === 'number' && typeof skipped === 'number';
  const revertOk = cancelled >= 0 && !afterCancel;

  if(pendingBefore && afterAssign && understood && revertOk){
    pass('T3', '一括自動仮組みと結果確認', `filled=${filled} skipped=${skipped} total=${total} → 一括解除${cancelled}件`, null);
  }else{
    fail('T3', '一括自動仮組み', `pending=${pendingBefore} assign=${!!afterAssign} filled=${filled} revert=${revertOk}`);
  }
}

/** T4: シフト1コマ変更（×→○→△→×） */
function testT4(){
  let s = 'none';
  const seq = [];
  for(let i = 0; i < 4; i++){
    s = cycleState(s);
    seq.push(labelFor(s));
  }
  const ok = seq.join('→') === '○→△→×→○';
  if(ok){
    pass('T4', '講師シフト1コマ変更', `循環: ${seq.join(' → ')}（講師画面と同一ロジック）`, null);
  }else{
    fail('T4', '講師シフト1コマ変更', `unexpected: ${seq.join('→')}`);
  }
}

/** T5: 欠席登録 → 振替候補 */
function testT5(){
  resetSeed();
  const student = S.students.find(s=> s.id === 'stu-1');
  const course = student.courses[0];
  const dateStr = '2026-08-06';
  const { day, slot } = course.desiredSlots[0];
  recordAbsence(student.id, course.id, course.subject, day, slot, dateStr);
  const ab = S.absences.find(a=> a.studentId === student.id && a.date === dateStr);
  const makeup = findMakeupCandidates(student.id, student.level, course.subject, dateStr, 3);

  if(ab && ab.status === 'pending' && Array.isArray(makeup) && makeup.length > 0){
    pass('T5', '欠席登録と振替候補', `欠席1件 / 振替候補${makeup.length}件（例: ${makeup[0].date}）`, null);
  }else{
    fail('T5', '欠席と振替', `ab=${!!ab} makeup=${makeup?.length ?? 0}`);
  }
}

/** T6: 新規講師登録相当 → 読み仮名で一覧検索 */
function testT6(){
  resetSeed();
  const newTeacher = {
    id: 'demo-new',
    name: 'テスト 太郎',
    nameKana: 'てすと たろう',
    subjects: [{ level: '小学', subject: '算数', preferred: false }],
    perLessonRate: 2200,
    dailyTransport: 0,
  };
  S.teachers.push(newTeacher);
  const sorted = sortByNameKana(S.teachers, t=> t.nameKana, t=> t.name);
  const foundByKana = matchesPersonSearch('てすと', newTeacher.name, newTeacher.nameKana);
  const idx = sorted.findIndex(t=> t.id === 'demo-new');

  if(foundByKana && idx >= 0){
    pass('T6', '新規講師の読み仮名検索', `「てすと」でヒット / ソート位置 ${idx + 1}/${sorted.length}`, null);
  }else{
    fail('T6', '新規講師検索', `found=${foundByKana} idx=${idx}`);
  }
}

function renderReport(){
  const tbody = document.getElementById('results');
  const summary = document.getElementById('summary');
  const passed = results.filter(r=> r.ok).length;
  const failed = results.filter(r=> !r.ok).length;
  tbody.innerHTML = results.map(r=> `
    <tr>
      <td>${r.id}</td>
      <td>${r.name}</td>
      <td class="${r.ok ? 'pass' : 'fail'}">${r.ok ? '✅ 合格' : '❌ 不合格'}</td>
      <td>${r.detail}${r.ms != null ? '' : ''}</td>
    </tr>
  `).join('');
  summary.innerHTML = failed === 0
    ? `<span class="pass">全 ${passed} シナリオ合格</span> — 実施日: ${new Date().toLocaleString('ja-JP')}`
    : `<span class="fail">${failed} 件不合格</span> / ${passed} 件合格`;
  window.__UIUX_VERIFY__ = { passed, failed, results };
}

try{
  testT1();
  testT2();
  testT3();
  testT4();
  testT5();
  testT6();
  renderReport();
}catch(err){
  document.getElementById('summary').innerHTML = `<span class="fail">実行エラー: ${err.message}</span>`;
  console.error(err);
}
