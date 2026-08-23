import { SUBJECT_MAP, DAYS, SLOTS, WEEKDAY_JP, WEEK_FULL } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr, getTodayStr } from '../shared/date-utils.js';
import { firebaseConfig, fbAuth, fbDb, STORAGE_KEY, getSecondaryAuth, S } from './state.js';
import { findCustomClosure, getDayStatus, renderCalendar } from './calendar.js';
import { renderMatrix } from './finance-ui.js';
import { renderMatching, renderShortageDashboard, renderStudentList } from './matching.js';
import { cycleTeacherState, findTeacherSchedule, getOrCreateDraftSchedule, getDateSlotState, getWeekdayAvailabilityInMonth, gradeLabel, isAvailable, isPreferredDay, isTeacherAvailableOnDate, setDateSlotState, subjectColor } from './schedule-core.js';
import { saveStudents, saveTeacherScheduleDoc, scheduleSave, scheduleSyncTeacherAssignments, approveCancellationRequest, rejectCancellationRequest } from './students-persistence.js';
import { mountInlineConfirm, showInlineNotice } from '../shared/inline-confirm.js';
import {
  buildApprovalAlertRowHtml, buildCalAlertPersonInline,
  buildCalAlertSubjectTag, buildCalAlertTeacherHead, buildCalAlertWhenPill, calAlertDateParts,
} from '../shared/cal-alert-row.js';

// 講師スケジュール（月次提出）タブ
// =====================================================================

// ---- 講師からの変更リクエスト（確定後にスケジュールを変更したい場合、直接上書きせずここに届く） ----
async function loadPendingChangeRequests(){
  const user = fbAuth.currentUser;
  if(!user) return [];
  try{
    const snap = await fbDb.collection('scheduleChangeRequests')
      .where('adminUid','==',user.uid).where('status','==','pending').get();
    const list = [];
    snap.forEach(doc=> list.push({id:doc.id, ...doc.data()}));
    return list;
  }catch(err){
    console.error('変更リクエスト読み込みエラー:', err);
    return [];
  }
}
// ---- 授業の承認状況（カレンダー上部・閲覧のみ。承認操作は講師専用ページ） ----
const APPROVAL_RECENT_LIMIT = 10;
const APPROVAL_DISMISSED_KEY_PREFIX = 'pitakoma-approval-dismissed-';

async function loadAssignmentApprovals(){
  const user = fbAuth.currentUser;
  if(!user) return [];
  try{
    // where句1つだけにして、Firestoreの複合索引作成を不要にする（並び替えはクライアント側で行う）
    const snap = await fbDb.collection('assignmentApprovals')
      .where('adminUid','==',user.uid).get();
    const list = [];
    snap.forEach(doc=> list.push({id:doc.id, ...doc.data()}));
    list.sort((a,b)=>{
      const ta = (a.createdAt && a.createdAt.toMillis) ? a.createdAt.toMillis() : 0;
      const tb = (b.createdAt && b.createdAt.toMillis) ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });
    return list;
  }catch(err){
    console.error('承認状況読み込みエラー:', err);
    return [];
  }
}

function loadDismissedApprovalIds(){
  const uid = fbAuth.currentUser ? fbAuth.currentUser.uid : null;
  if(!uid) return new Set();
  try{
    const raw = localStorage.getItem(`${APPROVAL_DISMISSED_KEY_PREFIX}${uid}`);
    return new Set(raw ? JSON.parse(raw) : []);
  }catch(err){
    console.error('承認履歴の読み込みエラー:', err);
    return new Set();
  }
}

function saveDismissedApprovalIds(ids){
  const uid = fbAuth.currentUser ? fbAuth.currentUser.uid : null;
  if(!uid) return;
  try{
    localStorage.setItem(`${APPROVAL_DISMISSED_KEY_PREFIX}${uid}`, JSON.stringify([...ids]));
  }catch(err){
    console.error('承認履歴の保存エラー:', err);
  }
}

function findNearestFutureDateForWeekday(weekday){
  const start = new Date();
  for(let i=0;i<14;i++){
    const d = new Date(start);
    d.setDate(start.getDate()+i);
    if(WEEKDAY_JP[d.getDay()]===weekday){
      return toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
    }
  }
  return null;
}

function approvalJumpDate(a){
  if(a.oneTimeDate) return a.oneTimeDate;
  const ym = getActiveYearMonth();
  const today = getTodayStr();
  const total = daysInYearMonth(ym);
  for(let d=1; d<=total; d++){
    const dateStr = `${ym}-${pad2(d)}`;
    if(dateStr < today) continue;
    if(getDayStatus(dateStr).weekday === a.day) return dateStr;
  }
  for(let d=1; d<=total; d++){
    const dateStr = `${ym}-${pad2(d)}`;
    if(getDayStatus(dateStr).weekday === a.day) return dateStr;
  }
  return findNearestFutureDateForWeekday(a.day);
}

function approvalWhenPill(a){
  const slotLabel = SLOTS.find(s=>s.id===a.slot)?.label || `${a.slot}講`;
  const dateStr = approvalJumpDate(a);
  if(dateStr){
    const { md, weekday } = calAlertDateParts(dateStr, getDayStatus);
    return buildCalAlertWhenPill(md, weekday, slotLabel);
  }
  return buildCalAlertWhenPill(`${a.day}曜`, '', slotLabel);
}

function approvalRowAriaLabel(a, teacherName){
  const slotLabel = SLOTS.find(s=>s.id===a.slot)?.label || `${a.slot}講`;
  const dateStr = approvalJumpDate(a);
  const datePart = dateStr ? (()=>{
    const { md, weekday } = calAlertDateParts(dateStr, getDayStatus);
    return `${md}（${weekday}）${slotLabel}`;
  })() : `${a.day}曜${slotLabel}`;
  return `${teacherName} ${datePart} ${a.studentName}（${a.studentGrade||''}）${a.subject}`;
}

function approvalSubjectLevel(a){
  const student = S.students.find(s=> s.name === a.studentName);
  return student?.level || '中学';
}

function approvalAppliesInMonth(ticket, yearMonth){
  const ym = getActiveYearMonth(yearMonth);
  if(ticket.oneTimeDate) return ticket.oneTimeDate.startsWith(ym);
  if(!teacherHasSubmittedMonth(ticket.teacherId, ym)) return false;
  const total = daysInYearMonth(ym);
  for(let d = 1; d <= total; d++){
    const dateStr = `${ym}-${pad2(d)}`;
    const status = getDayStatus(dateStr);
    if(status.weekday !== ticket.day) continue;
    if(status.type !== 'open') continue;
    return true;
  }
  return false;
}

function openMatchingForApprovalTicket(a){
  const student = S.students.find(s=> s.name === a.studentName);
  if(!student){
    const host = document.getElementById('shortageWrap')?.parentElement || document.getElementById('calViewShell');
    showInlineNotice(host, `${a.studentName}さんのデータが見つかりませんでした。`, { variant: 'warn' });
    return;
  }
  document.dispatchEvent(new CustomEvent('matching:go-student-date', {
    detail: { studentId: student.id, dateStr: approvalJumpDate(a) },
  }));
}

function approvalBadgeHtml(status){
  if(status==='rejected'){
    return '<span class="approval-badge rejected">講師が断りました</span>';
  }
  return '';
}

function renderApprovalDashboardItem(a, teacherName, status, { action = false } = {}){
  const rowCls = status==='rejected' ? ' approval-item-rejected' : '';
  const badge = approvalBadgeHtml(status);
  const whenPill = approvalWhenPill(a);
  const teacherHead = buildCalAlertTeacherHead(teacherName);
  const personInline = buildCalAlertPersonInline(a.studentName, a.studentGrade || '');
  const subjectTag = buildCalAlertSubjectTag(subjectColor, approvalSubjectLevel(a), a.subject);
  const aria = approvalRowAriaLabel(a, teacherName);
  if(!action){
    return buildApprovalAlertRowHtml({
      whenPill, teacherHead, personInline, subjectTag, badgeHtml: badge, rowCls, tag: 'div',
    });
  }
  return buildApprovalAlertRowHtml({
    whenPill, teacherHead, personInline, subjectTag, badgeHtml: badge, rowCls,
    dataAttrs: ` data-approval-id="${a.id}" aria-label="${aria}のコマをマッチングで開く"`,
    tag: 'button',
  });
}

async function renderApprovalStatus(){
  await renderShortageDashboard();
}

async function loadPendingCancellationRequests(){
  const user = fbAuth.currentUser;
  if(!user) return [];
  try{
    const snap = await fbDb.collection('assignmentCancellationRequests')
      .where('adminUid','==',user.uid).where('status','==','pending').get();
    const list = [];
    snap.forEach(doc=> list.push({id:doc.id, ...doc.data()}));
    return list;
  }catch(err){
    console.error('キャンセル依頼の読み込みエラー:', err);
    return [];
  }
}

async function renderCancellationRequests(){
  const card = document.getElementById('cancellationRequestCard');
  const wrap = document.getElementById('cancellationRequestWrap');
  if(!card || !wrap) return;
  const requests = await loadPendingCancellationRequests();
  if(requests.length===0){
    card.style.display = 'none';
    return;
  }
  card.style.display = '';
  wrap.innerHTML = requests.map(r=>{
    const teacher = S.teachers.find(t=>t.id===r.teacherId);
    const teacherName = teacher ? teacher.name : '(削除された講師)';
    const dateNote = r.oneTimeDate ? `（${r.oneTimeDate} 単発）` : '';
    return `<div class="change-req-row">
      <div class="change-req-main">
        <span class="change-req-name">${teacherName}</span>
        <span class="change-req-detail">${r.day}曜${SLOTS.find(s=>s.id===r.slot)?.label||r.slot+'講'}　${r.studentName}（${r.studentGrade||''}）${r.subject}${dateNote}</span>
        <div class="change-req-note">担当授業のキャンセルを依頼しています</div>
      </div>
      <div class="change-req-actions">
        <button class="primary" data-id="${r.id}" data-action="approve">承認</button>
        <button class="ghost" data-id="${r.id}" data-action="reject">却下</button>
      </div>
    </div>`;
  }).join('');

  wrap.querySelectorAll('button[data-action]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const req = requests.find(r=>r.id===btn.dataset.id);
      if(!req) return;
      const verb = btn.dataset.action==='approve' ? 'キャンセルを承認' : 'キャンセルを却下';
      mountInlineConfirm(wrap, btn, {
        message: `${req.studentName}さんの${req.day}曜${SLOTS.find(s=>s.id===req.slot)?.label||req.slot+'講'} ${req.subject}について、${verb}します。\nよろしいですか？`,
        confirmLabel: btn.dataset.action==='approve' ? '承認する' : '却下する',
        variant: btn.dataset.action==='approve' ? 'primary' : 'danger',
        mountSelector: '.change-req-row',
        onConfirm: async ()=>{
          btn.disabled = true;
          try{
            if(btn.dataset.action==='approve'){
              await approveCancellationRequest(req, req.id);
            }else{
              await rejectCancellationRequest(req.id);
            }
            renderCancellationRequests();
            renderTeacherScheduleTab();
            renderMatrix();
            renderMatching();
            renderCalendar();
            return { ok: true };
          }catch(err){
            btn.disabled = false;
            console.error(err);
            return { ok: false, msg: '処理に失敗しました。Firestoreの設定を確認してください。' };
          }
        },
      });
    });
  });
}

async function renderChangeRequests(){
  const card = document.getElementById('changeRequestCard');
  const wrap = document.getElementById('changeRequestWrap');
  if(!card || !wrap) return;
  const requests = await loadPendingChangeRequests();
  if(requests.length===0){
    card.style.display = 'none';
    return;
  }
  card.style.display = '';
  wrap.innerHTML = requests.map(r=>{
    const teacher = S.teachers.find(t=>t.id===r.teacherId);
    const teacherName = teacher ? teacher.name : '(削除された講師)';
    const mark = r.priority==='none' ? '×不可' : (r.priority==='preferred' ? '○特に希望' : '△対応可能');
    return `<div class="change-req-row">
      <div class="change-req-main">
        <span class="change-req-name">${teacherName}</span>
        <span class="change-req-detail">${r.dateStr}　${SLOTS.find(s=>s.id===r.slot)?.label||r.slot+'講'}　→　${mark}</span>
        ${r.note ? `<div class="change-req-note">${r.note.replace(/</g,'&lt;')}</div>` : ''}
      </div>
      <div class="change-req-actions">
        <button class="primary" data-id="${r.id}" data-action="approve">承認</button>
        <button class="ghost" data-id="${r.id}" data-action="reject">却下</button>
      </div>
    </div>`;
  }).join('');

  wrap.querySelectorAll('button[data-action]').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      const req = requests.find(r=>r.id===btn.dataset.id);
      if(!req) return;
      if(btn.dataset.action==='approve'){
        const yearMonth = req.dateStr.slice(0,7);
        const schedule = getOrCreateDraftSchedule(req.teacherId, yearMonth);
        setDateSlotState(schedule, req.dateStr, req.slot, req.priority);
        await saveTeacherScheduleDoc(schedule);
      }
      await fbDb.collection('scheduleChangeRequests').doc(req.id).update({
        status: btn.dataset.action==='approve' ? 'approved' : 'rejected',
      });
      renderChangeRequests();
      renderTeacherScheduleTab();
      renderMatrix();
      renderMatching();
      renderCalendar();
    });
  });
}

function renderTeacherScheduleTab(){
  scheduleSave();
  renderChangeRequests();
  renderCancellationRequests();
  const wrap = document.getElementById('tsTeacherListWrap');
  if(!wrap) return;
  if(S.calYear===undefined){
    const t = new Date();
    S.calYear = t.getFullYear();
    S.calMonth = t.getMonth();
  }
  document.getElementById('tsMonthTitle').textContent = `${S.calYear}年${S.calMonth+1}月`;

  if(!S.dataReady){
    wrap.innerHTML = '<div class="loading">読み込み中…</div>';
    return;
  }
  if(S.teachers.length===0){
    wrap.innerHTML = '<div class="empty-note">講師登録タブから講師を登録すると、ここにスケジュール提出状況が表示されます。</div>';
    return;
  }

  const yearMonth = `${S.calYear}-${pad2(S.calMonth+1)}`;
  const daysInMonth = new Date(S.calYear, S.calMonth+1, 0).getDate();
  wrap.innerHTML = S.teachers.map(t=>{
    const sch = findTeacherSchedule(t.id, yearMonth);
    let statusClass, statusLabel;
    if(!sch){ statusClass='none'; statusLabel='未提出'; }
    else if(sch.status==='submitted'){
      statusClass='submitted';
      if(sch.submittedBy==='admin') statusLabel = '提出済み（教室長が代理入力）';
      else if(sch.submittedBy==='teacher') statusLabel = '提出済み（本人）';
      else statusLabel = '提出済み';
    }
    else { statusClass='draft'; statusLabel='入力中（未提出）'; }

    let stripHtml = '';
    for(let d=1; d<=daysInMonth; d++){
      const dateStr = `${yearMonth}-${pad2(d)}`;
      const count = sch ? (sch.days[dateStr]||[]).length : 0;
      stripHtml += `<div class="ts-day-cell ${count>0?'has-count':''}" title="${d}日：${count}コマ">
        <div class="ts-day-num">${d}</div>
        <div class="ts-day-count">${count>0?count:'-'}</div>
      </div>`;
    }

    const fill = computeTeacherShiftFill(t.id, yearMonth);
    const shiftFillLabel = fill.submitted
      ? `希望 ${fill.hope} → 授業 ${fill.lesson}`
      : '希望 — → 授業 —';

    return `<div class="ts-teacher-row ${t.id===S.tsSelectedTeacherId?'active':''}" data-teacher="${t.id}">
      <span class="ts-name">${t.name}</span>
      <div class="ts-day-strip">${stripHtml}</div>
      <span class="ts-shift-fill">${shiftFillLabel}</span>
      <span class="ts-status-badge ${statusClass}">${statusLabel}</span>
    </div>`;
  }).join('');

  wrap.querySelectorAll('.ts-teacher-row').forEach(row=>{
    row.addEventListener('click', ()=>{
      S.tsSelectedTeacherId = row.dataset.teacher;
      renderTeacherScheduleTab();
      openTeacherScheduleEditor(S.tsSelectedTeacherId);
    });
  });
}

function openTeacherScheduleEditor(teacherId){
  const teacher = S.teachers.find(t=>t.id===teacherId);
  if(!teacher) return;
  const yearMonth = `${S.calYear}-${pad2(S.calMonth+1)}`;
  const card = document.getElementById('tsEditCard');
  card.style.display = 'block';
  document.getElementById('tsEditTitle').textContent = `${teacher.name}さんのスケジュール（${S.calYear}年${S.calMonth+1}月）`;
  document.getElementById('tsFormMsg').textContent = '';

  const existing = findTeacherSchedule(teacherId, yearMonth);
  const alertWrap = document.getElementById('tsUnsubmittedAlert');
  if(!existing){
    alertWrap.innerHTML = `<div class="ts-alert">この月はまだスケジュールが未提出です。未提出の間は「全日×（対応不可）」として扱われます。入力後「この内容で提出する」を押してください。</div>`;
  }else if(existing.status==='draft'){
    alertWrap.innerHTML = `<div class="ts-alert">入力途中です。「提出する」を押すまでは全日×として扱われます。</div>`;
  }else{
    alertWrap.innerHTML = '';
  }

  const schedule = getOrCreateDraftSchedule(teacherId, yearMonth);
  renderTeacherScheduleGrid(schedule);
}

function renderTeacherScheduleGrid(schedule){
  const wrap = document.getElementById('tsGridWrap');
  const yearMonth = schedule.yearMonth;
  const total = daysInYearMonth(yearMonth);

  let thead = '<thead><tr><th>日付</th>' + SLOTS.map(s=>`<th>${s.label}</th>`).join('') + '</tr></thead>';
  let tbody = '<tbody>';
  for(let d=1; d<=total; d++){
    const dateStr = `${yearMonth}-${pad2(d)}`;
    const wd = WEEKDAY_JP[new Date(dateStr+'T00:00:00').getDay()];
    const closed = S.regularClosedDays.includes(wd) ||
      (S.holidayAutoDetect && HOLIDAYS_JP.some(h=>h.date===dateStr)) ||
      !!findCustomClosure(dateStr);
    tbody += `<tr class="${closed?'ts-row-closed':''}"><th>${d}日<span class="ts-wd">(${wd})</span></th>`;
    SLOTS.forEach(slot=>{
      const entry = (schedule.days[dateStr]||[]).find(e=>e.slot===slot.id);
      const st = entry ? entry.priority : 'none';
      const label = st==='none' ? '×' : (st==='preferred' ? '○' : '△');
      tbody += `<td><button type="button" class="ts-cell-btn st-${st}" data-date="${dateStr}" data-slot="${slot.id}">${label}</button></td>`;
    });
    tbody += '</tr>';
  }
  tbody += '</tbody>';
  wrap.innerHTML = `<div class="ts-grid-scroll"><table class="ts-grid">${thead}${tbody}</table></div>`;

  wrap.querySelectorAll('.ts-cell-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const dateStr = btn.dataset.date, slot = Number(btn.dataset.slot);
      const curEntry = (schedule.days[dateStr]||[]).find(e=>e.slot===slot);
      const curState = curEntry ? curEntry.priority : 'none';
      const next = cycleTeacherState(curState);
      setDateSlotState(schedule, dateStr, slot, next);
      schedule.submittedBy = 'admin'; // 教室長がこの内容を触ったことを記録
      btn.textContent = next==='none' ? '×' : (next==='preferred' ? '○' : '△');
      btn.className = `ts-cell-btn st-${next}`;
      saveTeacherScheduleDoc(schedule);
    });
  });
}

function isPreferredPair(studentId, courseId, teacherId){
  return S.preferredPairs.some(p=>p.studentId===studentId && p.courseId===courseId && p.teacherId===teacherId);
}

function getPreferredTeachersForCourse(studentId, courseId){
  return S.preferredPairs
    .filter(p=> p.studentId === studentId && p.courseId === courseId)
    .map(p=> S.teachers.find(t=> t.id === p.teacherId))
    .filter(Boolean);
}

function getPreferredPairsForTeacher(teacherId){
  return S.preferredPairs
    .filter(p=> p.teacherId === teacherId)
    .map(p=>{
      const student = S.students.find(s=> s.id === p.studentId);
      if(!student) return null;
      const course = student.courses.find(c=> c.id === p.courseId);
      if(!course) return null;
      return { student, course };
    })
    .filter(Boolean);
}
function addPreferredPair(studentId, courseId, teacherId){
  if(isPreferredPair(studentId, courseId, teacherId)) return;
  S.preferredPairs.push({id:'pref-'+Date.now()+'-'+Math.random().toString(36).slice(2,6), studentId, courseId, teacherId});
}
function removePreferredPair(id){
  S.preferredPairs = S.preferredPairs.filter(p=>p.id!==id);
}
function removePreferredPairFor(studentId, courseId, teacherId){
  const hit = S.preferredPairs.find(p=>
    p.studentId===studentId && p.courseId===courseId && p.teacherId===teacherId
  );
  if(hit) removePreferredPair(hit.id);
}
function isPreferredSubjectForTeacher(teacher, level, subject){
  const s = teacher.subjects.find(ts=>ts.level===level && ts.subject===subject);
  return !!(s && s.preferred);
}

// 候補講師1人分の評価情報（優先ペア／得意科目／優先希望日／残り定員）をまとめる
// その講師が、指定の曜日・コマ以外に、同じ曜日の別コマも担当しているか（稼働集約＝出勤日数を増やさず交通費比率を抑える）
function teacherWorksOtherSlotOnWeekday(teacherId, weekday, excludeSlot, yearMonth){
  const ym = getActiveYearMonth(yearMonth);
  return S.assignments.concat(S.pendingAssignments, S.draftAssignments).some(a=>
    a.teacherId===teacherId && a.day===weekday && a.slot!==excludeSlot &&
    isAssignmentEffectiveInMonth(a, ym)
  );
}

function countTeacherCourseSlotCoverage(teacher, studentId, courseId, level, subject, yearMonth){
  const student = S.students.find(s=> s.id === studentId);
  if(!student) return { covered: 0, total: 0 };
  const course = student.courses.find(c=> c.id === courseId);
  if(!course || course.desiredSlots.length === 0) return { covered: 0, total: 0 };
  const ym = getActiveYearMonth(yearMonth);
  const slots = course.desiredSlots.filter(ds=> !S.regularClosedDays.includes(ds.day));
  if(slots.length === 0) return { covered: 0, total: 0 };
  let covered = 0;
  slots.forEach(ds=>{
    if(!teacher.subjects.some(ts=> ts.level === level && ts.subject === subject)) return;
    if(!getWeekdayAvailabilityInMonth(teacher.id, ds.day, ds.slot, ym)) return;
    if(countTeacherSlot(teacher.id, ds.day, ds.slot, studentId, ym) >= S.teacherCapacity) return;
    covered++;
  });
  return { covered, total: slots.length };
}

function buildCandidateInfo(studentId, courseId, level, subject, day, slot, teacher, dateStr){
  const ym = getActiveYearMonth();
  const used = dateStr
    ? countTeacherSlotOnDate(teacher.id, dateStr, slot, studentId)
    : countTeacherSlot(teacher.id, day, slot, studentId, ym);
  const coverage = countTeacherCourseSlotCoverage(teacher, studentId, courseId, level, subject, ym);
  return {
    teacher, used,
    remaining: S.teacherCapacity - used,
    full: used >= S.teacherCapacity,
    prefPair: isPreferredPair(studentId, courseId, teacher.id),
    courseSlotCoverage: coverage.covered,
    courseSlotCoverageTotal: coverage.total,
    prefSubject: isPreferredSubjectForTeacher(teacher, level, subject),
    prefDay: dateStr
      ? getDateSlotState(teacher.id, dateStr, slot) === 'preferred'
      : isPreferredDay(teacher, day, slot),
    fillBonus: used > 0,
    dayConsolidation: teacherWorksOtherSlotOnWeekday(teacher.id, day, slot, ym),
  };
}

function findAssignment(studentId, courseId, day, slot){
  return S.assignments.find(a=>a.studentId===studentId && a.courseId===courseId && a.day===day && a.slot===slot) || null;
}

function assignmentAppliesOnDate(a, dateStr){
  if(!dateStr) return true;
  const status = getDayStatus(dateStr);
  if(status.type !== 'open') return false;
  if(a.day !== status.weekday) return false;
  if(!isAssignmentEffectiveInMonth(a, dateStr.slice(0,7))) return false;
  if(a.oneTimeDate) return a.oneTimeDate === dateStr;
  return getDateSlotState(a.teacherId, dateStr, a.slot) !== 'none';
}

function countTeacherSlotOnDate(teacherId, dateStr, slot, excludeStudentId){
  const all = S.assignments.concat(S.pendingAssignments, S.draftAssignments);
  return all.filter(a=>
    a.teacherId===teacherId && Number(a.slot)===Number(slot) &&
    a.studentId!==excludeStudentId && assignmentAppliesOnDate(a, dateStr)
  ).length;
}

function countRoomSlotOnDate(dateStr, slot, excludeStudentId){
  const all = S.assignments.concat(S.pendingAssignments, S.draftAssignments);
  return all.filter(a=>
    Number(a.slot)===Number(slot) && a.studentId!==excludeStudentId &&
    assignmentAppliesOnDate(a, dateStr)
  ).length;
}

function removeSlotAssignmentsOnDate(studentId, courseId, day, slot, dateStr){
  const conflicts = a=> a.studentId===studentId && a.courseId===courseId && a.day===day && Number(a.slot)===Number(slot) &&
    assignmentAppliesOnDate(a, dateStr);
  S.assignments = S.assignments.filter(a=> !conflicts(a));
  S.pendingAssignments = S.pendingAssignments.filter(a=> !conflicts(a));
  S.draftAssignments = S.draftAssignments.filter(a=> !conflicts(a));
}

function removeAllSlotAssignments(studentId, courseId, day, slot){
  const matches = a=> a.studentId===studentId && a.courseId===courseId && a.day===day && Number(a.slot)===Number(slot);
  S.assignments = S.assignments.filter(a=> !matches(a));
  S.pendingAssignments = S.pendingAssignments.filter(a=> !matches(a));
  S.draftAssignments = S.draftAssignments.filter(a=> !matches(a));
}

// 講師がその月のシフトを提出済みか（提出済みの月だけマッチングを有効とみなす）
function getActiveYearMonth(yearMonth){
  if(yearMonth) return yearMonth;
  if(S.referenceYearMonth) return S.referenceYearMonth;
  const t = new Date();
  return `${t.getFullYear()}-${pad2(t.getMonth()+1)}`;
}
function teacherHasSubmittedMonth(teacherId, yearMonth){
  const ym = getActiveYearMonth(yearMonth);
  const sch = findTeacherSchedule(teacherId, ym);
  return !!(sch && sch.status === 'submitted');
}
function isAssignmentEffectiveInMonth(assignment, yearMonth){
  if(!assignment) return false;
  return teacherHasSubmittedMonth(assignment.teacherId, yearMonth);
}
// 表示・集計用：その月（と任意の日付）に有効な割当だけ返す
function findEffectiveAssignment(studentId, courseId, day, slot, yearMonth, dateStr){
  const ym = getActiveYearMonth(yearMonth);
  const pick = (list, flags)=>{
    const hit = list.find(a=>{
      if(a.studentId!==studentId || a.courseId!==courseId || a.day!==day || Number(a.slot)!==Number(slot)) return false;
      if(!isAssignmentEffectiveInMonth(a, ym)) return false;
      if(dateStr && !assignmentAppliesOnDate(a, dateStr)) return false;
      return true;
    });
    return hit ? {entry: hit, isPending: !!flags.isPending, isDraft: !!flags.isDraft} : null;
  };
  return pick(S.assignments, {isPending:false, isDraft:false})
    || pick(S.pendingAssignments, {isPending:true, isDraft:false})
    || pick(S.draftAssignments, {isPending:false, isDraft:true})
    || null;
}

function countCourseConfirmed(studentId, courseId, yearMonth){
  const ym = getActiveYearMonth(yearMonth);
  return S.assignments.filter(a=>
    a.studentId===studentId && a.courseId===courseId && isAssignmentEffectiveInMonth(a, ym)
  ).length;
}
function countTeacherSlot(teacherId, day, slot, excludeStudentId, yearMonth){
  const ym = getActiveYearMonth(yearMonth);
  const all = S.assignments.concat(S.pendingAssignments, S.draftAssignments); // 定員は確定・承認待ち・下書きすべてでふさがる
  return all.filter(a=>
    a.teacherId===teacherId && a.day===day && a.slot===slot && a.studentId!==excludeStudentId &&
    isAssignmentEffectiveInMonth(a, ym)
  ).length;
}
function countRoomSlot(day, slot, excludeStudentId, yearMonth){
  const ym = getActiveYearMonth(yearMonth);
  const all = S.assignments.concat(S.pendingAssignments, S.draftAssignments);
  return all.filter(a=>
    a.day===day && a.slot===slot && a.studentId!==excludeStudentId &&
    isAssignmentEffectiveInMonth(a, ym)
  ).length;
}

// 提出済みシフトの「希望コマ」のうち、授業が入っているコマ数を月単位で数える
function computeTeacherShiftFill(teacherId, yearMonth){
  const sch = findTeacherSchedule(teacherId, yearMonth);
  if(!sch || sch.status !== 'submitted'){
    return { hope: null, lesson: null, submitted: false };
  }
  const total = daysInYearMonth(yearMonth);
  let hope = 0;
  let lesson = 0;
  for(let d=1; d<=total; d++){
    const dateStr = `${yearMonth}-${pad2(d)}`;
    const entries = sch.days[dateStr] || [];
    entries.forEach(entry=>{
      hope++;
      const wd = WEEKDAY_JP[new Date(dateStr+'T00:00:00').getDay()];
      if(countTeacherSlotOnDate(teacherId, dateStr, entry.slot, null) > 0){
        lesson++;
      }
    });
  }
  return { hope, lesson, submitted: true };
}

// 講師専用ページで承認してもらうためのチケットを発行する（ログイン未発行の講師には発行しない）
async function issueAssignmentApproval(studentId, courseId, subject, day, slot, teacherId, oneTimeDate){
  const teacher = S.teachers.find(t=>t.id===teacherId);
  if(!teacher || !teacher.loginUid) return false;
  const student = S.students.find(s=>s.id===studentId);
  if(!student) return;
  try{
    const payload = {
      adminUid: fbAuth.currentUser.uid,
      teacherId, teacherLoginUid: teacher.loginUid,
      studentName: student.name, studentGrade: gradeLabel(student),
      subject, day, slot,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if(oneTimeDate) payload.oneTimeDate = oneTimeDate; // 指定日のみの代講の場合、その日付を明記する
    await fbDb.collection('assignmentApprovals').add(payload);
    return true;
  }catch(err){
    console.error('承認チケット発行エラー:', err);
    return false;
  }
}

// 教室長が選んだ担当は、まず仮決めとして保存する（送信後に講師承認）
function confirmAssignment(studentId, courseId, subject, day, slot, teacherId, source, opts){
  source = source || 'manual';
  opts = opts || {};
  const dateStr = opts.dateStr || null;
  const recurring = !!opts.recurring;
  const teacher = S.teachers.find(t=>t.id===teacherId);
  if(!teacher) return {ok:false, msg:'講師が見つかりません。'};

  if(dateStr && !recurring){
    if(!isTeacherAvailableOnDate(teacherId, dateStr, slot)){
      return {ok:false, msg:`${teacher.name}先生はこの日のシフト未登録です。`};
    }
    const teacherUsed = countTeacherSlotOnDate(teacherId, dateStr, slot, studentId);
    if(teacherUsed >= S.teacherCapacity){
      const slotLabel = SLOTS.find(s=>s.id===slot)?.label || slot+'講';
      return {ok:false, msg:`${teacher.name}先生は${dateStr} ${slotLabel}の定員（${S.teacherCapacity}人）に達しています。`};
    }
    const roomUsed = countRoomSlotOnDate(dateStr, slot, studentId);
    if(roomUsed >= S.roomCapacity){
      const slotLabel = SLOTS.find(s=>s.id===slot)?.label || slot+'講';
      return {ok:false, msg:`${dateStr} ${slotLabel}は教室全体の定員（${S.roomCapacity}人）に達しています。`};
    }
    removeSlotAssignmentsOnDate(studentId, courseId, day, slot, dateStr);
  }else{
    const teacherUsed = countTeacherSlot(teacherId, day, slot, studentId);
    if(teacherUsed >= S.teacherCapacity){
      return {ok:false, msg:`${teacher.name}先生は${day}曜${SLOTS.find(s=>s.id===slot).label}の定員（${S.teacherCapacity}人）に達しています。`};
    }
    const roomUsed = countRoomSlot(day, slot, studentId);
    if(roomUsed >= S.roomCapacity){
      return {ok:false, msg:`${day}曜${SLOTS.find(s=>s.id===slot).label}は教室全体の定員（${S.roomCapacity}人）に達しています。`};
    }
    removeAllSlotAssignments(studentId, courseId, day, slot);
  }

  const entry = {
    id:'asg-'+Date.now()+'-'+Math.random().toString(36).slice(2,6),
    studentId, courseId, subject, day, slot, teacherId, source,
  };
  if(dateStr && !recurring) entry.oneTimeDate = dateStr;

  S.draftAssignments.push(entry);
  return {ok:true, draft:true, pending:false};
}
function cancelAssignment(studentId, courseId, day, slot){
  S.assignments = S.assignments.filter(a=>!(a.studentId===studentId && a.courseId===courseId && a.day===day && a.slot===slot));
  S.pendingAssignments = S.pendingAssignments.filter(a=>!(a.studentId===studentId && a.courseId===courseId && a.day===day && a.slot===slot));
  S.draftAssignments = S.draftAssignments.filter(a=>!(a.studentId===studentId && a.courseId===courseId && a.day===day && a.slot===slot));
}

function countAssignmentsInMonth(list, yearMonth){
  const ym = getActiveYearMonth(yearMonth);
  return list.filter(a=> isAssignmentEffectiveInMonth(a, ym)).length;
}

function cancelDraftAuto(){
  const count = S.draftAssignments.filter(a=> a.source === 'auto').length;
  S.draftAssignments = S.draftAssignments.filter(a=> a.source !== 'auto');
  return count;
}

function cancelAllDrafts(){
  const count = S.draftAssignments.length;
  S.draftAssignments = [];
  return count;
}

async function sendDraftAssignments(){
  const drafts = [...S.draftAssignments];
  if(drafts.length === 0){
    return { sent: 0, pending: 0, skippedNoLogin: 0, noLoginTeachers: [] };
  }
  S.draftAssignments = [];
  let pending = 0;
  let skippedNoLogin = 0;
  const noLoginTeachers = new Set();
  const keptDrafts = [];
  for(const entry of drafts){
    const teacher = S.teachers.find(t=> t.id === entry.teacherId);
    if(!teacher?.loginUid){
      skippedNoLogin++;
      if(teacher) noLoginTeachers.add(teacher.name);
      keptDrafts.push(entry);
      continue;
    }
    S.pendingAssignments.push(entry);
    await issueAssignmentApproval(
      entry.studentId, entry.courseId, entry.subject, entry.day, entry.slot,
      entry.teacherId, entry.oneTimeDate || null,
    );
    pending++;
  }
  S.draftAssignments.push(...keptDrafts);
  return {
    sent: pending,
    pending,
    skippedNoLogin,
    noLoginTeachers: [...noLoginTeachers],
  };
}

async function revokePendingApprovalTicket(student, course, day, slot, oneTimeDate){
  const user = fbAuth.currentUser;
  if(!user) return;
  const updates = [];
  const snap = await fbDb.collection('assignmentApprovals').where('adminUid','==', user.uid).get();
  snap.forEach(doc=>{
    const a = doc.data();
    if(a.status !== 'pending') return;
    if(a.studentName !== student.name || a.subject !== course.subject) return;
    if(a.day !== day || Number(a.slot) !== Number(slot)) return;
    if(oneTimeDate){
      if(a.oneTimeDate !== oneTimeDate) return;
    }else if(a.oneTimeDate){
      return;
    }
    updates.push(fbDb.collection('assignmentApprovals').doc(doc.id).update({
      status: 'cancelled',
      handled: true,
      cancelledByAdmin: true,
      cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
      teacherRead: false,
    }));
  });
  await Promise.all(updates);
}

async function withdrawPendingAssignment(studentId, courseId, day, slot, dateStr){
  const student = S.students.find(s=> s.id === studentId);
  const course = student?.courses.find(c=> c.id === courseId);
  if(!student || !course){
    return { ok: false, msg: '生徒または教科が見つかりません。' };
  }
  const ym = dateStr ? dateStr.slice(0, 7) : getActiveYearMonth();
  const eff = findEffectiveAssignment(studentId, courseId, day, slot, ym, dateStr || null);
  if(!eff?.isPending || eff.isDraft){
    return { ok: false, msg: '承認待ちのコマが見つかりません。' };
  }
  const teacher = S.teachers.find(t=> t.id === eff.entry.teacherId);
  const oneTimeDate = eff.entry.oneTimeDate || null;
  cancelAssignment(studentId, courseId, day, slot);
  try{
    await revokePendingApprovalTicket(student, course, day, slot, oneTimeDate);
  }catch(err){
    console.error('承認依頼取り消しエラー:', err);
    return { ok: false, msg: '依頼の取り消しに失敗しました。' };
  }
  scheduleSave();
  scheduleSyncTeacherAssignments();
  renderApprovalStatus();
  return { ok: true, teacherName: teacher?.name || '' };
}

// 希望通りの枠に対応できる講師がいない場合の代替候補（学年・教科が対応可能な曜日/コマ）を探す
function findAlternativeSlots(level, subject, excludeSlots){
  const alternatives = [];
  DAYS.forEach(day=>{
    if(S.regularClosedDays.includes(day)) return; // 定休日は代替候補から除外
    SLOTS.forEach(slot=>{
      if(excludeSlots.some(es=>es.day===day && es.slot===slot.id)) return;
      const hasTeacher = S.teachers.some(t =>
        isAvailable(t, day, slot.id) &&
        t.subjects.some(ts=>ts.level===level && ts.subject===subject)
      );
      if(hasTeacher) alternatives.push({day, slot:slot.id});
    });
  });
  return alternatives;
}

// 生徒の受講科目の「希望曜日・コマ」を、対応できない枠から代替日程へ差し替える
async function replaceDesiredSlot(studentId, courseId, oldDay, oldSlot, newDay, newSlot){
  const student = S.students.find(s=>s.id===studentId);
  if(!student) return;
  const course = student.courses.find(c=>c.id===courseId);
  if(!course) return;
  const idx = course.desiredSlots.findIndex(ds=>ds.day===oldDay && ds.slot===oldSlot);
  if(idx===-1) return;
  course.desiredSlots[idx] = {day:newDay, slot:newSlot};
  await saveStudents();
  renderStudentList();
  renderMatching();
}


export { loadPendingChangeRequests, loadAssignmentApprovals, loadDismissedApprovalIds, saveDismissedApprovalIds, approvalAppliesInMonth, openMatchingForApprovalTicket, renderApprovalDashboardItem, renderApprovalStatus, renderChangeRequests, renderTeacherScheduleTab, openTeacherScheduleEditor, renderTeacherScheduleGrid, isPreferredPair, getPreferredTeachersForCourse, getPreferredPairsForTeacher, addPreferredPair, removePreferredPair, removePreferredPairFor, isPreferredSubjectForTeacher, teacherWorksOtherSlotOnWeekday, countTeacherCourseSlotCoverage, buildCandidateInfo, findAssignment, getActiveYearMonth, teacherHasSubmittedMonth, isAssignmentEffectiveInMonth, assignmentAppliesOnDate, findEffectiveAssignment, countCourseConfirmed, countTeacherSlot, countTeacherSlotOnDate, countRoomSlot, countRoomSlotOnDate, issueAssignmentApproval, confirmAssignment, cancelAssignment, cancelDraftAuto, cancelAllDrafts, sendDraftAssignments, countAssignmentsInMonth, withdrawPendingAssignment, findAlternativeSlots, replaceDesiredSlot };
