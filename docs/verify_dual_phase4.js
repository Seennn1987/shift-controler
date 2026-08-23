/**
 * Phase 4（欠席・振替・収支）自動検証
 * 使い方: node docs/verify_dual_phase4.js
 */
import {
  countSlotAssignmentUnits,
  teacherTeachesBoth,
  findDualPairAtSlot,
  formatDualSubjectLabel,
} from '../src/admin/dual-subject.js';

let passed = 0;
let failed = 0;

function ok(label, cond){
  if(cond){ passed++; console.log(`✅ ${label}`); }
  else{ failed++; console.error(`❌ ${label}`); }
}

// --- countSlotAssignmentUnits ---
ok('双教科2件は1コマ', countSlotAssignmentUnits([
  { studentId: 's1', day: '月', slot: 4, dualGroupId: 'g1' },
  { studentId: 's1', day: '月', slot: 4, dualGroupId: 'g1' },
]) === 1);

ok('単教科2件は2コマ', countSlotAssignmentUnits([
  { studentId: 's1', day: '月', slot: 4, dualGroupId: null },
  { studentId: 's2', day: '月', slot: 4, dualGroupId: null },
]) === 2);

ok('別生徒の双教科は2コマ', countSlotAssignmentUnits([
  { studentId: 's1', day: '月', slot: 4, dualGroupId: 'g1' },
  { studentId: 's1', day: '月', slot: 4, dualGroupId: 'g1' },
  { studentId: 's2', day: '月', slot: 4, dualGroupId: 'g2' },
  { studentId: 's2', day: '月', slot: 4, dualGroupId: 'g2' },
]) === 2);

// --- teacherTeachesBoth ---
const teacherBoth = {
  subjects: [
    { level: '小学', subject: '国語' },
    { level: '小学', subject: '算数' },
  ],
};
const teacherOne = {
  subjects: [{ level: '小学', subject: '国語' }],
};
ok('両教科対応講師を判定', teacherTeachesBoth(teacherBoth, '小学', '国語', '算数'));
ok('片方のみは不可', !teacherTeachesBoth(teacherOne, '小学', '国語', '算数'));

// --- findDualPairAtSlot ---
const formCourses = [
  {
    id: 'c1', subject: '国語', weeklyCount: 1,
    desiredSlots: [{ day: '月', slot: 4, dualGroupId: 'dg1', dualRole: 'first' }],
  },
  {
    id: 'c2', subject: '算数', weeklyCount: 1,
    desiredSlots: [{ day: '月', slot: 4, dualGroupId: 'dg1', dualRole: 'second' }],
  },
];
const pair = findDualPairAtSlot(formCourses, '月', 4);
ok('双教科ペア検出', pair && pair.subjects.join('+') === '国語+算数');
ok('ペアは2 entries', pair?.entries.length === 2);

// --- 収支シミュレーション（売上重複排除ロジック） ---
function simulateRevenue(list, tuitionRate){
  let revenue = 0;
  const seenDual = new Set();
  list.forEach(a=>{
    if(a.dualGroupId){
      const key = `${a.studentId}:${a.slot}:${a.dualGroupId}`;
      if(seenDual.has(key)) return;
      seenDual.add(key);
    }
    revenue += tuitionRate;
  });
  return revenue;
}
const dualList = [
  { studentId: 's1', slot: 4, dualGroupId: 'g1' },
  { studentId: 's1', slot: 4, dualGroupId: 'g1' },
];
ok('売上は1コマ分', simulateRevenue(dualList, 5000) === 5000);
ok('単教科2人は2コマ分', simulateRevenue([
  { studentId: 's1', slot: 4, dualGroupId: null },
  { studentId: 's2', slot: 4, dualGroupId: null },
], 5000) === 10000);

// --- 講師給シミュレーション ---
function simulateTeacherCost(list, rate){
  const teacherSlotSet = new Set();
  list.forEach(a=> teacherSlotSet.add(`${a.teacherId}|${a.slot}`));
  return teacherSlotSet.size * rate;
}
ok('同講師同slot双教科は1コマ給', simulateTeacherCost([
  { teacherId: 't1', slot: 4 },
  { teacherId: 't1', slot: 4 },
], 2200) === 2200);

console.log(`\n=== 検証完了: ${passed}成功 / ${failed}失敗 ===`);
if(failed > 0) process.exit(1);
