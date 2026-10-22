import { isClosedCopyPage } from '../shared/firebase-config.js';
import { legacyPromoteOutcome, promoteOutcome } from '../shared/promote-guard.mjs';
import { fbDb, S } from './state.js';
import { clampShortPayPercent } from '../shared/lesson-span.js';
import { toDateStr } from '../shared/date-utils.js';
import { normalizeOneShortTuitionRates, normalizeOneTuitionRates, normalizeShortTuitionRates, normalizeTuitionGradeRates } from './tuition-rates.js';
import { computeDayFinance, getEffectiveDayAssignments, getMonthlyFeeStudentIds, getStudentTuitionForDate, isMonthlyFeeLesson } from './absences.js';
import { commitLessonDrafts, loadLessonDrafts } from './lesson-drafts.js';
import { listsAfterDraftSave, mergeDraftsForRead, unionDrafts } from '../shared/lesson-draft-diff.mjs';
import { computeLiveMonthPayroll } from './payroll.js';
import { getUnassignedRowsForDate } from './calendar.js';

const DATES = ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-21', '2026-10-22', '2026-10-28'];

function fail(messages, text){
  messages.push('NG ' + text);
}

function applyDoc(d){
  S.teachers = d.teachers || [];
  S.students = d.students || [];
  S.assignments = (d.assignments || []).map(row => ({ ...row }));
  S.pendingAssignments = d.pendingAssignments || [];
  S.draftAssignments = d.draftAssignments || [];
  S.absences = d.absences || [];
  S.teacherAbsences = d.teacherAbsences || [];
  S.teacherSubstitutions = d.teacherSubstitutions || [];
  S.customClosures = d.customClosures || [];
  S.regularClosedDays = d.regularClosedDays || ['日'];
  S.closedHolidayDates = d.closedHolidayDates || [];
  S.tuitionGradeRates = normalizeTuitionGradeRates(d);
  S.tuitionGradeRatesShort = normalizeShortTuitionRates(d);
  S.tuitionGradeRatesOne = normalizeOneTuitionRates(d);
  S.tuitionGradeRatesShortOne = normalizeOneShortTuitionRates(d);
  S.shortLessonPayPercent = clampShortPayPercent(d.shortLessonPayPercent);
  S.programmingMonthlyFee = d.programmingMonthlyFee || 0;
  S.studentFees = d.studentFees || {};
  S.officeHourlyRate = d.officeHourlyRate != null ? d.officeHourlyRate : 1300;
  S.payrollOfficeHours = d.payrollOfficeHours || {};
  S.payrollOfficeDays = d.payrollOfficeDays || {};
  S.payrollLocks = d.payrollLocks || {};
  S.roomCapacity = d.roomCapacity || 12;
}

function studentByName(part){
  return S.students.find(student => (student.name || '').includes(part));
}

function courseOf(student, subject){
  return (student.courses || []).find(course => course.subject === subject);
}

function teacherByName(part){
  return S.teachers.find(teacher => (teacher.name || '').replace(/\s/g, '').includes(part));
}

function unassignedHit(dateStr, namePart, subject){
  return getUnassignedRowsForDate(dateStr).some(row => {
    if(!(row.student.name || '').includes(namePart)) return false;
    const subjects = row.courses ? row.courses.map(course => course.subject) : [row.course.subject];
    return subjects.includes(subject);
  });
}

function tuitionMap(){
  const byStudent = new Map();
  let total = 0;
  for(let day = 1; day <= 31; day++){
    const dateStr = toDateStr(2026, 9, day);
    total += computeDayFinance(dateStr, false).revenue;
    const list = getEffectiveDayAssignments(dateStr).filter(row => !row.pending && !row.draft && !row.teacherAbsent);
    const seen = new Set();
    list.forEach(row => {
      if(row.dualGroupId){
        const key = `${row.studentId}:${row.slot}:${row.dualGroupId}`;
        if(seen.has(key)) return;
        seen.add(key);
      }
      if(isMonthlyFeeLesson(row)) return;
      const student = S.students.find(item => item.id === row.studentId);
      const yen = getStudentTuitionForDate(student, dateStr, row);
      byStudent.set(row.studentId, (byStudent.get(row.studentId) || 0) + yen);
    });
  }
  return { total, byStudent };
}

function payMap(){
  const rows = computeLiveMonthPayroll(2026, 9);
  return new Map(rows.map(row => [row.teacherId, {
    lessonPay: row.lessonPay,
    transportPay: row.transportPay,
    officePay: row.officePay,
    lessonCount: row.lessonCount,
  }]));
}

function programmingCount(){
  return S.assignments.filter(row => row.subject === 'プログラミング').length;
}

function addMissingLessons(){
  const nagayama = studentByName('長山');
  const shino = studentByName('篠原');
  const science = courseOf(nagayama, '理科');
  const japanese = courseOf(shino, '国語');
  const ouchi = teacherByName('大内悠生');
  const added = [];
  ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].forEach(dateStr => {
    const social = S.assignments.find(row =>
      row.studentId === nagayama.id && row.subject === '社会' && row.oneTimeDate === dateStr && Number(row.slot) === 5
    );
    added.push({
      id: 'asg-restore-' + dateStr + '-sci',
      studentId: nagayama.id,
      courseId: science.id,
      subject: '理科',
      day: social.day,
      slot: social.slot,
      teacherId: social.teacherId,
      source: 'manual',
      oneTimeDate: dateStr,
      dualGroupId: social.dualGroupId,
    });
  });
  ['2026-10-21', '2026-10-28'].forEach(dateStr => {
    const weekday = ['日', '月', '火', '水', '木', '金', '土'][new Date(dateStr + 'T00:00:00').getDay()];
    added.push({
      id: 'asg-restore-' + dateStr + '-jp',
      studentId: shino.id,
      courseId: japanese.id,
      subject: '国語',
      day: weekday,
      slot: 5,
      teacherId: ouchi.id,
      source: 'manual',
      oneTimeDate: dateStr,
    });
  });
  S.assignments.push(...added);
  return added;
}

function checkPromoteRules(messages){
  const scienceOnly = [{ subject: '社会', studentId: 's', teacherId: 't', day: '木', slot: 5 }];
  const both = [
    { subject: '理科', studentId: 's', teacherId: 't', day: '木', slot: 5 },
    { subject: '社会', studentId: 's', teacherId: 't', day: '木', slot: 5 },
  ];
  const kokugoShakai = [
    { subject: '国語', studentId: 's', teacherId: 't', day: '月', slot: 4 },
    { subject: '社会', studentId: 's', teacherId: 't', day: '月', slot: 4 },
  ];
  const dual = { subjects: ['理科', '社会'], subject: '理科・社会' };
  const otherDual = { subjects: ['国語', '社会'], subject: '国語・社会' };
  const single = { subject: '国語' };
  const programming = { subject: 'プログラミング' };
  const old = legacyPromoteOutcome(scienceOnly);
  const fixedPartial = promoteOutcome(dual, scienceOnly, true);
  const fixedBoth = promoteOutcome(dual, both, true);
  const fixedFail = promoteOutcome(dual, both, false);
  const fixedOther = promoteOutcome(otherDual, kokugoShakai, true);
  const fixedOtherPartial = promoteOutcome(otherDual, [{ subject: '国語' }], true);
  const fixedSingle = promoteOutcome(single, [{ subject: '国語' }], true);
  const fixedSingleFail = promoteOutcome(single, [{ subject: '国語' }], false);
  const fixedProgram = promoteOutcome(programming, [{ subject: 'プログラミング' }], true);
  if(!(old.promoted && old.listed)) fail(messages, '修正前は社会だけでも確定になる');
  if(fixedPartial.promoted || fixedPartial.listed) fail(messages, '理科と社会は片方だけでは確定しない');
  if(!fixedBoth.promoted || !fixedBoth.listed) fail(messages, '理科と社会が両方あれば保存成功で確定する');
  if(fixedFail.promoted || fixedFail.listed) fail(messages, '保存失敗では確定しない');
  if(!fixedOther.promoted) fail(messages, '国語と社会が両方あれば確定する');
  if(fixedOtherPartial.promoted) fail(messages, '国語と社会は片方だけでは確定しない');
  if(!fixedSingle.promoted) fail(messages, '国語1教科は保存成功で確定する');
  if(fixedSingleFail.promoted) fail(messages, '国語1教科は保存失敗では確定しない');
  if(!fixedProgram.promoted) fail(messages, 'プログラミング1教科は保存成功で確定する');
}

function dayFinance(dateStr){
  const finance = computeDayFinance(dateStr, false);
  return {
    revenue: finance.revenue,
    lessonCost: finance.lessonCost,
    transportCost: finance.transportCost,
    lessonCount: finance.lessonCount,
  };
}

function octoberDays(){
  const days = [];
  for(let day = 1; day <= 31; day++) days.push(toDateStr(2026, 9, day));
  return days;
}

function oneKomaTuition(student, dateStr, row){
  return getStudentTuitionForDate(student, dateStr, row);
}

async function checkDraftStore(messages){
  const uid = 'closed-draft-test';
  const dualA = {
    id: 'safety-draft-dual-a', studentId: 's-safety', subject: '国語', day: '木', slot: 5,
    teacherId: 't-safety', source: 'manual', dualGroupId: 'dual-safety',
  };
  const dualB = {
    id: 'safety-draft-dual-b', studentId: 's-safety', subject: '社会', day: '木', slot: 5,
    teacherId: 't-safety', source: 'manual', dualGroupId: 'dual-safety',
  };
  const single = {
    id: 'safety-draft-single', studentId: 's-safety', subject: '算数', day: '月', slot: 4,
    teacherId: 't-safety', source: 'manual',
  };
  const failed = await commitLessonDrafts({ upserts: [dualA, dualB], forceFail: true, adminUid: uid, quiet: true });
  if(failed) fail(messages, '失敗させた保存が成功しました');
  const absent = await loadLessonDrafts(uid);
  if(absent.some(entry => entry.id === dualA.id || entry.id === dualB.id)){
    fail(messages, '保存に失敗した2教科が画面に残る置き場へ書かれました');
  }
  const saved = await commitLessonDrafts({ upserts: [dualA, dualB, single], adminUid: uid, quiet: true });
  if(!saved) fail(messages, '仮決めを試し用のコピーへ保存できませんでした');
  const loaded = await loadLessonDrafts(uid);
  if(!loaded.some(entry => entry.id === dualA.id) || !loaded.some(entry => entry.id === dualB.id)){
    fail(messages, '2教科の仮決めが片方だけです');
  }
  if(!loaded.some(entry => entry.day === '木') || loaded.some(entry => String(entry.day).includes('\uFFFD'))){
    fail(messages, '木曜日の文字を読み戻せません');
  }
  const hidden = listsAfterDraftSave([], [{ id: 'not-saved', day: '火' }], false);
  if(hidden.length !== 0) fail(messages, '保存失敗なのに画面へ出ます');
  const removed = await commitLessonDrafts({ deleteIds: [single.id], adminUid: uid, quiet: true });
  if(!removed) fail(messages, '1件の解除を保存できませんでした');
  const afterDelete = await loadLessonDrafts(uid);
  if(afterDelete.some(entry => entry.id === single.id)) fail(messages, '解除した仮決めが残っています');
  if(!afterDelete.some(entry => entry.id === dualA.id) || !afterDelete.some(entry => entry.id === dualB.id)){
    fail(messages, '1件の解除でほかの仮決めが消えました');
  }
  const union = unionDrafts(afterDelete, [{ id: 'safety-draft-old', day: '火', subject: '理科' }]);
  if(!union.list.some(entry => entry.id === dualA.id) || !union.missing.some(entry => entry.id === 'safety-draft-old')){
    fail(messages, 'もともとある仮決めを残したまま移せていません');
  }
  const pendingKept = mergeDraftsForRead(afterDelete, [], [], [{ id: dualA.id }]);
  if(pendingKept.some(entry => entry.id === dualA.id)) fail(messages, '承認待ちと同じ仮決めがもう一度出ます');
  if(!pendingKept.some(entry => entry.id === dualB.id)) fail(messages, '承認待ちでない仮決めまで隠れました');
  await commitLessonDrafts({ deleteIds: afterDelete.map(entry => entry.id), adminUid: uid, quiet: true });
}

export async function runClosedCopyCheck(){
  const banner = document.getElementById('closedCopyBanner');
  if(banner && isClosedCopyPage()) banner.hidden = false;
  const report = document.getElementById('closedReport');
  const messages = [];
  if(!isClosedCopyPage()){
    report.textContent = '閉じたコピーの画面ではありません。';
    return;
  }
  const snap = await fbDb.collection('appState').get();
  const doc = snap.docs.map(item => item.data()).find(data => Array.isArray(data.assignments) && data.assignments.length > 0);
  if(!doc){
    report.textContent = '閉じたコピーに授業一覧がありません。';
    return;
  }
  applyDoc(doc);
  checkPromoteRules(messages);
  const weekdaysOk = new Set(['月', '火', '水', '木', '金', '土', '日']);
  [doc.assignments, doc.pendingAssignments, doc.draftAssignments].forEach(list => {
    (list || []).forEach(entry => {
      if(!entry || !entry.day) return;
      if(!weekdaysOk.has(entry.day) || String(entry.day).includes('\uFFFD')){
        fail(messages, '読み込んだ授業の曜日が壊れています');
      }
    });
  });
  const tuitionBeforeProbe = tuitionMap().total;
  const programmingBeforeProbe = programmingCount();
  const monthlyBeforeProbe = getMonthlyFeeStudentIds(2026, 9).size;
  S.draftAssignments.push({
    id: 'draft-money-probe',
    studentId: (S.students[0] && S.students[0].id) || 's',
    subject: '国語',
    day: '木',
    slot: 5,
    teacherId: (S.teachers[0] && S.teachers[0].id) || 't',
    source: 'manual',
  });
  if(tuitionMap().total !== tuitionBeforeProbe) fail(messages, '仮決めを足すと授業料が変わります');
  if(programmingCount() !== programmingBeforeProbe) fail(messages, '仮決めを足すとプログラミングの件数が変わります');
  if(getMonthlyFeeStudentIds(2026, 9).size !== monthlyBeforeProbe) fail(messages, '仮決めを足すとプログラミング月額が変わります');
  S.draftAssignments.pop();
  const beforeState = snap.docs.map(item => ({
    id: item.id,
    pending: JSON.stringify(item.data().pendingAssignments || []),
    drafts: JSON.stringify(item.data().draftAssignments || []),
  }));
  await checkDraftStore(messages);
  const afterSnap = await fbDb.collection('appState').get();
  const afterState = afterSnap.docs.map(item => ({
    id: item.id,
    pending: JSON.stringify(item.data().pendingAssignments || []),
    drafts: JSON.stringify(item.data().draftAssignments || []),
  }));
  if(JSON.stringify(beforeState) !== JSON.stringify(afterState)){
    fail(messages, '試しの保存で、もとからある仮決めか承認待ちが変わりました');
  }
  const beforeHits = DATES.map(dateStr => {
    const name = dateStr === '2026-10-21' || dateStr === '2026-10-28' ? '篠原' : '長山';
    const subject = name === '篠原' ? '国語' : '理科';
    return unassignedHit(dateStr, name, subject);
  });
  if(!beforeHits.every(Boolean)) fail(messages, '足す前の6日が講師なしではありません');
  const beforeTuition = tuitionMap();
  const beforePay = payMap();
  const beforeDays = new Map(octoberDays().map(dateStr => [dateStr, dayFinance(dateStr)]));
  const beforeProgramming = programmingCount();
  const beforeMonthly = getMonthlyFeeStudentIds(2026, 9).size;
  const beforeLocks = JSON.stringify(S.payrollLocks);
  const beforeCount = S.assignments.length;
  const socialIds = S.assignments.filter(row => row.subject === '社会' && row.oneTimeDate).map(row => row.id).join(',');
  const nagayama = studentByName('長山');
  const shino = studentByName('篠原');
  const expected = {};
  ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22'].forEach(dateStr => {
    const social = S.assignments.find(row => row.studentId === nagayama.id && row.subject === '社会' && row.oneTimeDate === dateStr);
    expected[dateStr] = oneKomaTuition(nagayama, dateStr, social);
  });
  expected['2026-10-21'] = oneKomaTuition(shino, '2026-10-21', { subject: '国語', slot: 5, studentId: shino.id });
  expected['2026-10-28'] = oneKomaTuition(shino, '2026-10-28', { subject: '国語', slot: 5, studentId: shino.id });
  addMissingLessons();
  if(S.assignments.length !== beforeCount + 6) fail(messages, '増えた授業が6件ではありません');
  if(programmingCount() !== beforeProgramming) fail(messages, 'プログラミングの件数が変わりました');
  if(getMonthlyFeeStudentIds(2026, 9).size !== beforeMonthly) fail(messages, 'プログラミング月額の対象が変わりました');
  const afterHits = DATES.map(dateStr => {
    const name = dateStr === '2026-10-21' || dateStr === '2026-10-28' ? '篠原' : '長山';
    const subject = name === '篠原' ? '国語' : '理科';
    return unassignedHit(dateStr, name, subject);
  });
  if(afterHits.some(Boolean)) fail(messages, '足したあとも講師なしが残っています');
  const socialIdsAfter = S.assignments.filter(row => row.subject === '社会' && row.oneTimeDate).map(row => row.id).join(',');
  if(socialIds !== socialIdsAfter) fail(messages, '社会の記録が作り直されています');
  const afterTuition = tuitionMap();
  const afterPay = payMap();
  octoberDays().forEach(dateStr => {
    const beforeDay = beforeDays.get(dateStr);
    const afterDay = dayFinance(dateStr);
    if(!DATES.includes(dateStr)){
      if(beforeDay.revenue !== afterDay.revenue || beforeDay.lessonCost !== afterDay.lessonCost || beforeDay.transportCost !== afterDay.transportCost){
        fail(messages, dateStr + ' は対象外なのに金額が変わりました');
      }
      return;
    }
    const revenueDelta = afterDay.revenue - beforeDay.revenue;
    if(revenueDelta !== expected[dateStr]) fail(messages, dateStr + ' の授業料の増え方が1コマではありません');
    if(afterDay.lessonCount - beforeDay.lessonCount !== 1) fail(messages, dateStr + ' のコマ数が1つだけ増えていません');
    const costDelta = afterDay.lessonCost - beforeDay.lessonCost;
    if(costDelta !== 0 && costDelta !== 2700) fail(messages, dateStr + ' の講師料が1講分を超えて増えました');
  });
  const allowedStudents = new Set([nagayama.id, shino.id]);
  new Set([...beforeTuition.byStudent.keys(), ...afterTuition.byStudent.keys()]).forEach(id => {
    if(allowedStudents.has(id)) return;
    if((beforeTuition.byStudent.get(id) || 0) !== (afterTuition.byStudent.get(id) || 0)){
      fail(messages, 'ほかの生徒の授業料が変わりました');
    }
  });
  const nagayamaDelta = (afterTuition.byStudent.get(nagayama.id) || 0) - (beforeTuition.byStudent.get(nagayama.id) || 0);
  const shinoDelta = (afterTuition.byStudent.get(shino.id) || 0) - (beforeTuition.byStudent.get(shino.id) || 0);
  if(nagayamaDelta !== expected['2026-10-01'] * 4) fail(messages, '長山さんの授業料が4日分の1コマずつではありません');
  if(shinoDelta !== expected['2026-10-21'] + expected['2026-10-28']) fail(messages, '篠原さんの授業料が2コマ分ではありません');
  const ouchi = teacherByName('大内悠生');
  const koizumi = teacherByName('小泉嵐');
  const murata = teacherByName('村田歴桜');
  beforePay.forEach((row, id) => {
    const next = afterPay.get(id);
    if(!next){
      fail(messages, '講師の給与行が消えました');
      return;
    }
    if(next.officePay !== row.officePay) fail(messages, '事務給与が変わりました');
    if(id === ouchi.id || id === koizumi.id) return;
    if(next.lessonPay !== row.lessonPay || next.transportPay !== row.transportPay){
      fail(messages, '小泉さんと大内さん以外の講師料が変わりました');
    }
  });
  const ouchiPay = afterPay.get(ouchi.id);
  const koizumiPay = afterPay.get(koizumi.id);
  const murataPay = afterPay.get(murata.id);
  if((ouchiPay.lessonPay - beforePay.get(ouchi.id).lessonPay) !== 5400) fail(messages, '大内さんのコマ給が2講分ではありません');
  if((ouchiPay.transportPay - beforePay.get(ouchi.id).transportPay) !== 1144) fail(messages, '大内さんの交通費が2日分ではありません');
  if((koizumiPay.lessonPay - beforePay.get(koizumi.id).lessonPay) !== 2700) fail(messages, '小泉さんのコマ給が10月1日の1講分ではありません');
  if((koizumiPay.transportPay - beforePay.get(koizumi.id).transportPay) !== 572) fail(messages, '小泉さんの交通費が10月1日の1日分ではありません');
  if(murataPay.lessonPay !== beforePay.get(murata.id).lessonPay) fail(messages, '村田さんのコマ給が変わりました');
  if(JSON.stringify(S.payrollLocks) !== beforeLocks) fail(messages, '講師料の確定ロックが変わりました');
  const text = (messages.length ? messages.join('\n') : 'OK') +
    '\n長山授業料 ' + (beforeTuition.byStudent.get(nagayama.id) || 0) +
    ' → ' + (afterTuition.byStudent.get(nagayama.id) || 0) +
    '\n篠原授業料 ' + (beforeTuition.byStudent.get(shino.id) || 0) +
    ' → ' + (afterTuition.byStudent.get(shino.id) || 0) +
    '\n大内コマ給 ' + beforePay.get(ouchi.id).lessonPay + ' → ' + ouchiPay.lessonPay +
    '\n大内交通費 ' + beforePay.get(ouchi.id).transportPay + ' → ' + ouchiPay.transportPay +
    '\n小泉コマ給 ' + beforePay.get(koizumi.id).lessonPay + ' → ' + koizumiPay.lessonPay +
    '\n村田コマ給 ' + beforePay.get(murata.id).lessonPay + ' → ' + murataPay.lessonPay;
  window.__closedReport = { ok: messages.length === 0, text };
  if(report) report.textContent = text;
}

runClosedCopyCheck().catch(err => {
  const report = document.getElementById('closedReport');
  if(report) report.textContent = '確認に失敗しました ' + (err && err.message ? err.message : err);
});
