import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { S } from './state.js';
import {
  cancelAbsenceRecord,
  cancelMakeup,
  clearMakeupPlacement,
  confirmMakeup,
  findDualMakeupCandidates,
  findDualMakeupCandidatesOnDate,
  findMakeupCandidates,
  findMakeupCandidatesOnDate,
  getAbsenceRecordsOnDate,
  getEffectiveDayAssignments,
  getMakeupPlacementAbsence,
  getStudentDateRows,
  markNoMakeup,
  recordStudentSlotAbsence,
  setMakeupPlacementFromAbsence,
} from './absences.js';
import { resolveFilterStudent, resolveFilterTeacher } from './cal-filter.js';
import { getDayStatus, getUnassignedRowsForDate } from './calendar.js';
import { renderMatching, renderShortageDashboard } from './matching.js';
import { gradeLabel, subjectColor, teacherHonorific } from './schedule-core.js';
import { renderTeacherAbsencePanel, buildAbsentTeacherFollowupHtml, bindAbsentTeacherFollowup } from './teacher-absence-panel.js';
import {
  cancelAssignment,
  cancelDualAssignment,
  countRoomSlotOnDate,
  countTeacherSlotOnDate,
  findAlternativeSlots,
  replaceDesiredSlot,
  withdrawPendingAssignment,
  findEffectiveAssignment,
  getActiveYearMonth,
} from './teacher-schedule-tab.js';
import { buildDualMatchCandidatesHtml, buildMatchCandidatesHtml } from './match-candidates-html.js';
import { buildPrefPairActionHtmlForTeacher, buildDraftSlotCardHtml, buildWaitingSlotCardHtml, buildFlowStatusBadgeChipHtml } from './match-candidate-ui.js';
import { mountWithdrawConfirm } from './withdraw-pending-ui.js';
import { mountInlineConfirm, showInlineNotice } from '../shared/inline-confirm.js';
import { analyzePendingMatchSlot } from './match-slot-status.js';
import { buildDualSubjectTagsHtml, findDualPairForStudent, collapseDualAssignmentDisplayRows, countSlotAssignmentUnits } from './dual-subject.js';

function dualMakeupDataAttrs(isDual, subjects){
  return isDual && subjects?.length === 2
    ? ` data-dual="1" data-subjects="${subjects.join(',')}"`
    : '';
}

function buildMakeupCandidateRowsHtml(absenceId, makeupCands){
  if(makeupCands.length === 0){
    return `<div class="match-none">対応できる振替候補が見つかりませんでした。</div>`;
  }
  let html = '';
  makeupCands.forEach(mc=>{
    const md = new Date(mc.date + 'T00:00:00');
    const mLabel = `${md.getMonth() + 1}/${md.getDate()}（${WEEKDAY_JP[md.getDay()]}）${mc.slot.label}`;
    mc.candidates.forEach(cand=>{
      html += `<div class="match-cand">
        <span class="match-badge full">${mLabel}</span>
        <span>${cand.teacher.name}</span>
        <span class="cap-note">${cand.used}/${S.teacherCapacity}人</span>
        <button type="button" class="confirm-makeup-btn" data-absence="${absenceId}" data-date="${mc.date}" data-slot="${mc.slot.id}" data-teacher="${cand.teacher.id}">振替を確定</button>
      </div>`;
    });
  });
  return html;
}

function lookupMakeupCandidates(student, subjects, dateStr, oneDateOnly){
  if(subjects.length === 2){
    return oneDateOnly
      ? findDualMakeupCandidatesOnDate(student.id, student.level, subjects, dateStr)
      : findDualMakeupCandidates(student.id, student.level, subjects, dateStr);
  }
  return oneDateOnly
    ? findMakeupCandidatesOnDate(student.id, student.level, subjects[0], dateStr)
    : findMakeupCandidates(student.id, student.level, subjects[0], dateStr);
}

function buildAbsenceStatusBoxHtml(r, student, dateStr, { showStudentName = false } = {}){
  const subjectTag = buildRowSubjectTagHtml(student, r);
  const studentNameHtml = showStudentName
    ? `<span class="cb-teacher">${student.name}さん</span>`
    : '';
  const dualMakeupAttrs = dualMakeupDataAttrs(!!r.dualPair, r.courses?.map(c=> c.subject));

  if(r.absence.status === 'resolved' && r.absence.makeup){
    const mDate = new Date(r.absence.makeup.date + 'T00:00:00');
    const teacher = S.teachers.find(t=> t.id === r.absence.makeup.teacherId);
    return `<div class="absence-box">
      <span class="cb-label absence-label">欠席</span>
      ${subjectTag}
      ${studentNameHtml}
      <span class="cb-teacher">振替先：${mDate.getMonth() + 1}/${mDate.getDate()}（${teacher ? teacher.name : '?'}）</span>
      <button type="button" class="cancel-absence-btn" data-absence="${r.absence.id}">欠席を取り消す</button>
    </div>`;
  }

  const panelId = `makeup-cand-${r.absence.id}`;
  const isNoMakeup = r.absence.status === 'no-makeup';
  const label = isNoMakeup ? '欠席（振替なし）' : '欠席（未対応）';
  const noMakeupBtn = isNoMakeup
    ? ''
    : `<button type="button" class="no-makeup-btn" data-absence="${r.absence.id}">振替なしで確定</button>`;
  const hint = isNoMakeup
    ? ''
    : `<span class="mp-slot-note">カレンダーの日付を押すと、その日に振替できます</span>`;

  return `<div class="absence-box">
    <span class="cb-label absence-label">${label}</span>
    ${subjectTag}
    ${studentNameHtml}
    <button type="button" class="find-makeup-btn" data-absence="${r.absence.id}" data-student="${student.id}" data-level="${student.level}" data-subject="${r.course.subject}" data-date="${dateStr}" data-target="${panelId}"${dualMakeupAttrs}>振替を探す</button>
    ${noMakeupBtn}
    <button type="button" class="cancel-absence-btn" data-absence="${r.absence.id}">欠席を取り消す</button>
    ${hint}
  </div>
  <div class="makeup-cand-list" id="${panelId}" style="display:none;"></div>`;
}

function buildMakeupPlacementHtml(dateStr){
  const ab = getMakeupPlacementAbsence();
  if(!ab) return '';
  if(ab.date === dateStr) return '';
  const student = S.students.find(s=> s.id === ab.studentId);
  if(!student) return '';
  const filterStudent = resolveFilterStudent();
  if(filterStudent && filterStudent.id !== student.id) return '';
  const status = getDayStatus(dateStr);
  if(status.type !== 'open') return '';

  const from = new Date(ab.date + 'T00:00:00');
  const fromSlot = SLOTS.find(s=> Number(s.id) === Number(ab.slot));
  const dualPair = student.courses ? findDualPairForStudent(student, ab.day, Number(ab.slot)) : null;
  const subjects = dualPair?.subjects?.length === 2 ? dualPair.subjects : [ab.subject];
  const makeupCands = lookupMakeupCandidates(student, subjects, dateStr, true);
  const fromLabel = `${from.getMonth() + 1}/${from.getDate()} ${fromSlot ? fromSlot.label : ''}`;

  return `<div class="match-slot makeup-placement-slot">
    <div class="ms-slot-label">振替先を選ぶ</div>
    <div class="absence-box">
      <span class="cb-label makeup-label">振替</span>
      <span class="cb-teacher">${student.name}さん</span>
      <span class="mp-slot-note">元のコマ：${fromLabel}</span>
      <button type="button" class="cancel-makeup-placement-btn">日の指定をやめる</button>
    </div>
    <div class="makeup-cand-list" style="display:block;">
      ${buildMakeupCandidateRowsHtml(ab.id, makeupCands)}
    </div>
  </div>`;
}

function absenceRowToFilterShape(row){
  const slot = SLOTS.find(s=> Number(s.id) === Number(row.slot));
  return {
    slot,
    course: row.courses?.[0] || { id: row.absence.courseId, subject: row.subject },
    courses: row.courses,
    dualPair: row.dualPair,
    absence: row.absence,
  };
}

function buildDayDetailStudentRowHtml(a, dateStr, weekday){
  const student = S.students.find(s=> s.id === a.studentId);
  const studentName = student ? student.name : '(削除された生徒)';
  const gLabel = student ? gradeLabel(student) : '';
  const level = student ? student.level : '';
  const subjectTagHtml = a.isDual && level
    ? buildDualSubjectTagsHtml(level, a.subjects, subjectColor)
    : (()=>{
      const c = level ? subjectColor(level, a.subject) : { bg: '#eee', text: '#333' };
      return `<span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${a.subject}</span>`;
    })();
  const flowBadgeChip = buildFlowStatusBadgeChipHtml({
    draft: !!a.draft,
    waiting: !!a.pending,
  });
  const makeupBadge = a.kind === 'makeup'
    ? '<span class="auto-badge" style="background:#fff;color:var(--ink);border:1px dashed var(--ink);">振替</span>'
    : '';
  const courseId = a.courseIds?.[0] || a.courseId;
  const subject = a.subjects?.[0] || a.subject;
  const dualAttr = a.isDual ? ' data-dual="1"' : '';
  const handleBtn = a.kind === 'normal' && !a.draft && !a.pending && courseId
    ? `<button type="button" class="absent-btn" data-student="${a.studentId}" data-course="${courseId}" data-subject="${subject}" data-day="${weekday}" data-slot="${a.slot}" data-date="${dateStr}"${dualAttr}>欠席にする</button>`
    : '';
  return `<div class="sched-student-row sched-student-row--day-detail">
    <div class="sched-student-row-body">
      ${subjectTagHtml}
      <span class="sched-student-row-name">${studentName}<span class="grade-tag">${gLabel}</span></span>
      ${flowBadgeChip}${makeupBadge}
    </div>
    ${handleBtn}
  </div>`;
}

function buildRowSubjectTagHtml(student, r){
  if(r.dualPair && r.courses?.length === 2){
    return buildDualSubjectTagsHtml(student.level, r.courses.map(c=> c.subject), subjectColor);
  }
  const c = subjectColor(student.level, r.course.subject);
  return `<span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span>`;
}

function cancelRowDraftOrAssignment(btn){
  const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(btn.dataset.date || '') ? btn.dataset.date : null;
  if(btn.dataset.dual === '1'){
    const student = S.students.find(s=> s.id === btn.dataset.student);
    const dualPair = findDualPairForStudent(student, btn.dataset.day, Number(btn.dataset.slot));
    if(dualPair) cancelDualAssignment(btn.dataset.student, dualPair, btn.dataset.day, Number(btn.dataset.slot), dateStr);
    return;
  }
  cancelAssignment(btn.dataset.student, btn.dataset.course, btn.dataset.day, Number(btn.dataset.slot), dateStr);
}

export function getDayDetailTitle(dateStr){
  const status = getDayStatus(dateStr);
  const d = new Date(dateStr + 'T00:00:00');
  const label = `${d.getMonth() + 1}月${d.getDate()}日（${status.weekday}）`;
  const filterStudent = resolveFilterStudent();
  if(filterStudent){
    return {
      title: label,
      subtitle: `${filterStudent.name}さん（${gradeLabel(filterStudent)}）`,
    };
  }
  return { title: label, subtitle: '教室全体' };
}

function buildUnassignedSlotHtml(row, dateStr, weekday){
  const { student, course, slot, dualPair, missingTeacher } = row;
  const subjectTag = dualPair
    ? buildDualSubjectTagsHtml(student.level, row.courses.map(c=> c.subject), subjectColor)
    : (()=>{
      const c = subjectColor(student.level, course.subject);
      return `<span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${course.subject}</span>`;
    })();
  const followupHtml = missingTeacher
    ? buildAbsentTeacherFollowupHtml({
      dateStr,
      slotId: slot.id,
      studentId: student.id,
      courseId: course.id,
      subject: course.subject,
      originalTeacherId: missingTeacher.teacherId,
    })
    : ((dualPair
      ? buildDualMatchCandidatesHtml(student, dualPair, weekday, slot.id, dateStr, {
        btnClass: 'confirm-btn mp-confirm-btn',
        showConfirm: true,
      })
      : buildMatchCandidatesHtml(
        student, course.id, course.subject, weekday, slot.id, dateStr,
        { btnClass: 'confirm-btn mp-confirm-btn', showConfirm: true },
      )) || `<div class="match-none">対応できる講師がいません</div>`);

  return `<div class="day-detail-unassigned">
    <div class="day-detail-unassigned-head">
      <div class="day-detail-unassigned-head-main">
        ${subjectTag}
        <span>${student.name}さん</span>
        <span class="grade-tag">${gradeLabel(student)}</span>
        ${buildFlowStatusBadgeChipHtml({ pending: true })}
      </div>
    </div>
    ${followupHtml}
  </div>`;
}

export function renderDayDetailPanel(container, dateStr){
  if(!container || !dateStr) return;

  const status = getDayStatus(dateStr);
  const weekday = status.weekday;
  const d = new Date(dateStr + 'T00:00:00');
  const label = `${d.getMonth() + 1}月${d.getDate()}日（${weekday}）`;
  const filterStudent = resolveFilterStudent();
  const filterTeacher = resolveFilterTeacher();
  const detailYearMonth = dateStr.slice(0, 7);

  if(filterStudent){
    if(status.type !== 'open'){
      container.innerHTML = `<div class="cal-empty-day">${label}は${status.label || status.holidayName || status.closureLabel || '休校日'}です。</div>`;
      return;
    }
    const rows = getStudentDateRows(filterStudent, dateStr);
    if(rows.length === 0){
      const placementHtml = buildMakeupPlacementHtml(dateStr);
      if(placementHtml){
        container.innerHTML = `<div class="cal-day-note">${filterStudent.name}さんの振替先として、この日の空きコマを選べます。</div>
          <button type="button" class="ghost mp-action day-detail-go-month" data-student-id="${filterStudent.id}">${filterStudent.name}さんの月間一覧へ</button>
          ${placementHtml}`;
        return;
      }
      container.innerHTML = `<div class="cal-empty-day">${filterStudent.name}さんは、この曜日（${weekday}曜日）に希望しているコマがありません。</div>`;
      return;
    }

    let html = `<div class="cal-day-note">${filterStudent.name}さんの希望曜日パターン（＋振替）から、この日の状況を表示しています。講師を選ぶと下書き保存されます。「講師にスケジュールを送信」で依頼できます。</div>`;
    html += `<button type="button" class="ghost mp-action day-detail-go-month" data-student-id="${filterStudent.id}">${filterStudent.name}さんの月間一覧へ</button>`;
    html += buildMakeupPlacementHtml(dateStr);

    rows.forEach(r=>{
      const subjectTag = buildRowSubjectTagHtml(filterStudent, r);
      const isDual = !!r.dualPair;
      const dualAttr = isDual ? ' data-dual="1"' : '';

      if(r.isMakeupTarget){
        const teacher = S.teachers.find(t=> t.id === r.absence.makeup.teacherId);
        const waitingLabel = r.isPending ? '振替（承認待ち）' : '振替授業';
        html += `<div class="match-slot">
          <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
          <div class="confirmed-box makeup-box">
            <span class="cb-label makeup-label">${waitingLabel}</span>
            ${subjectTag}
            <span class="cb-teacher">講師：${teacherHonorific(teacher)}</span>
            ${r.isPending ? buildFlowStatusBadgeChipHtml({ waiting: true }) : ''}
            <button class="cancel-makeup-btn" data-absence="${r.absence.id}">振替を取り消す</button>
          </div>
        </div>`;
        return;
      }

      if(r.absence){
        html += `<div class="match-slot">
          <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
          ${buildAbsenceStatusBoxHtml(r, filterStudent, dateStr)}
        </div>`;
        return;
      }

      if(r.existing){
        const teacher = S.teachers.find(t=> t.id === r.existing.teacherId);
        const used = teacher ? countTeacherSlotOnDate(teacher.id, dateStr, r.slot.id, null) : 0;
        const autoBadge = r.existing.source === 'auto' ? '<span class="auto-badge">自動</span>' : '';
        if(r.isDraft){
          const roomUsed = countRoomSlotOnDate(dateStr, r.slot.id, null);
          html += buildDraftSlotCardHtml({
            slotLabel: r.slot.label,
            slotTime: r.slot.time,
            roomUsed,
            roomCapacity: S.roomCapacity,
            subjectTagHtml: subjectTag,
            teacherName: teacher?.name || '不明',
            studentId: filterStudent.id,
            courseId: r.course.id,
            weekday,
            slotId: r.slot.id,
            dateStr,
            autoBadge,
            dual: isDual,
          });
        }else if(r.isPending){
          const roomUsed = countRoomSlotOnDate(dateStr, r.slot.id, null);
          html += buildWaitingSlotCardHtml({
            slotLabel: r.slot.label,
            slotTime: r.slot.time,
            roomUsed,
            roomCapacity: S.roomCapacity,
            subjectTagHtml: subjectTag,
            teacherName: teacher?.name || '不明',
            studentId: filterStudent.id,
            courseId: r.course.id,
            weekday,
            slotId: r.slot.id,
            dateStr,
            dual: isDual,
          });
        }else{
          const prefHtml = buildPrefPairActionHtmlForTeacher(filterStudent.id, r.course.id, r.existing.teacherId);
          html += `<div class="match-slot">
            <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
            <div class="confirmed-box">
              <span class="cb-label">確定${autoBadge}</span>
              ${subjectTag}
              <span class="cb-teacher">講師：${teacherHonorific(teacher)}</span>
              <span class="cb-cap">（定員 ${used}/${S.teacherCapacity}）</span>
              <div class="confirmed-box-actions">${prefHtml}
                <button class="absent-btn" data-student="${filterStudent.id}" data-course="${r.course.id}" data-subject="${r.course.subject}" data-day="${weekday}" data-slot="${r.slot.id}" data-date="${dateStr}"${dualAttr}>欠席にする</button>
                <button class="unconfirm-btn" data-student="${filterStudent.id}" data-course="${r.course.id}" data-day="${weekday}" data-slot="${r.slot.id}" data-date="${dateStr}"${dualAttr}>確定を解除</button>
              </div>
            </div>
          </div>`;
        }
      }else{
        if(r.missingTeacher){
          html += `<div class="match-slot">
            <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
            <div style="margin-bottom:6px;">${subjectTag}</div>
            ${buildFlowStatusBadgeChipHtml({ pending: true })}
            ${buildAbsentTeacherFollowupHtml({
              dateStr,
              slotId: r.slot.id,
              studentId: filterStudent.id,
              courseId: r.course.id,
              subject: r.course.subject,
              originalTeacherId: r.missingTeacher.teacherId,
            })}
          </div>`;
          return;
        }
        if(S.regularClosedDays.includes(weekday)){
          html += `<div class="match-slot">
            <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
            <div class="match-none">この曜日は定休日のため授業を組めません（基本設定で変更できます）</div>
          </div>`;
          return;
        }

        const roomUsed = countRoomSlotOnDate(dateStr, r.slot.id, null);
        let candHtml = isDual
          ? buildDualMatchCandidatesHtml(filterStudent, r.dualPair, weekday, r.slot.id, dateStr, {
            btnClass: 'confirm-btn mp-confirm-btn',
            showConfirm: true,
          })
          : buildMatchCandidatesHtml(
            filterStudent, r.course.id, r.course.subject, weekday, r.slot.id, dateStr,
            { btnClass: 'confirm-btn mp-confirm-btn', showConfirm: true },
          );
        if(!candHtml){
          const slotAnalysis = analyzePendingMatchSlot(filterStudent, r.course, weekday, r.slot.id, detailYearMonth, dateStr);
          const alternatives = findAlternativeSlots(filterStudent.level, r.course.subject, r.course.desiredSlots);
          candHtml = `<div class="match-none">${slotAnalysis.label}：${slotAnalysis.detailLines?.[0] || `対応できる講師がいません（${weekday}曜${r.slot.label}は希望通りには組めません）`}</div>`;
          if(alternatives.length === 0){
            candHtml += `<div class="match-none">他に空いている代替日程もありません。講師の追加登録をご検討ください。</div>`;
          }else{
            const panelId = `caldet-alt-${r.course.id}-${weekday}-${r.slot.id}`;
            candHtml += `<button type="button" class="alt-toggle-btn" data-target="${panelId}">代替日程を提案（${alternatives.length}件）</button>
            <div class="alt-panel" id="${panelId}">
              ${alternatives.map(alt=>{
                const altSlot = SLOTS.find(sl=> sl.id === alt.slot);
                return `<button type="button" class="alt-option-btn"
                  data-student="${filterStudent.id}" data-course="${r.course.id}"
                  data-old-day="${weekday}" data-old-slot="${r.slot.id}"
                  data-new-day="${alt.day}" data-new-slot="${alt.slot}">
                  ${alt.day}曜 ${altSlot.label}（${altSlot.time}）に変更
                </button>`;
              }).join('')}
            </div>`;
          }
        }

        html += `<div class="match-slot">
          <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）<span style="font-weight:400;color:var(--ink-soft);"> ／ 教室 ${roomUsed}/${S.roomCapacity}</span></div>
          <div style="margin-bottom:6px;">${subjectTag}</div>
          ${candHtml}
        </div>`;
      }
    });

    container.innerHTML = html;
    return;
  }

  if(filterTeacher){
    container.innerHTML = `<div class="cal-day-note">${teacherHonorific(filterTeacher)}のこの日の担当授業について、欠勤・代講ができます。</div><div class="teacher-absence-root"></div>`;
    return;
  }

  const list = getEffectiveDayAssignments(dateStr);
  const unassigned = getUnassignedRowsForDate(dateStr);

  if(status.type !== 'open'){
    container.innerHTML = `<div class="cal-empty-day">${label}は${status.label || status.holidayName || status.closureLabel || '休校日'}です。</div>`;
    return;
  }

  const absenceRows = getAbsenceRecordsOnDate(dateStr, { includeResolved: true });
  const placementHtml = buildMakeupPlacementHtml(dateStr);

  if(list.length === 0 && unassigned.length === 0 && absenceRows.length === 0){
    if(placementHtml){
      container.innerHTML = `<div class="cal-day-note">この日に、欠席した生徒の振替先を選べます。</div>${placementHtml}`;
      return;
    }
    container.innerHTML = `<div class="cal-empty-day">${label}に授業の予定はありません。</div>`;
    return;
  }

  let html = `<div class="cal-day-note">確定した授業と、講師が決まっていない希望コマを表示しています。欠席にした生徒は同じ日の一覧に残ります。</div>`;
  html += placementHtml;
  SLOTS.forEach(slot=>{
    const slotList = list.filter(a=> a.slot === slot.id);
    const slotUnassigned = unassigned.filter(r=> r.slot.id === slot.id);
    const slotAbsences = absenceRows.filter(r=> Number(r.slot) === Number(slot.id));
    if(slotList.length === 0 && slotUnassigned.length === 0 && slotAbsences.length === 0) return;

    const roomUsed = countRoomSlotOnDate(dateStr, slot.id, null);
    html += `<div class="match-slot"><div class="ms-slot-label">${slot.label}（${slot.time}）<span style="font-weight:400;color:var(--ink-soft);"> ／ 教室 ${roomUsed}/${S.roomCapacity}</span></div>`;

    if(slotList.length > 0){
      const slotByTeacher = {};
      slotList.forEach(a=>{
        if(!slotByTeacher[a.teacherId]) slotByTeacher[a.teacherId] = [];
        slotByTeacher[a.teacherId].push(a);
      });
      Object.keys(slotByTeacher).forEach(teacherId=>{
        const teacher = S.teachers.find(t=> t.id === teacherId);
        const entries = slotByTeacher[teacherId];
        const loadCount = countSlotAssignmentUnits(entries.map(e=>({
          studentId: e.studentId,
          day: weekday,
          slot: e.slot,
          dualGroupId: e.dualGroupId || null,
        })));
        const displayRows = collapseDualAssignmentDisplayRows(entries);
        let studentsHtml = '';
        displayRows.forEach(a=>{
          studentsHtml += buildDayDetailStudentRowHtml(a, dateStr, weekday);
        });
        html += `<div class="sched-teacher-box">
          <div class="sched-teacher-head-row">
            <div class="sched-teacher-name">${teacherHonorific(teacher)}<span class="sched-cap">（${loadCount}/${S.teacherCapacity}）</span></div>
            <button type="button" class="ghost handle-teacher-absence-btn" data-teacher="${teacherId}" data-date="${dateStr}" aria-expanded="false">欠勤・代講</button>
          </div>
          ${studentsHtml}
        </div>`;
      });
    }

    slotAbsences.forEach(row=>{
      if(!row.student) return;
      html += buildAbsenceStatusBoxHtml(absenceRowToFilterShape(row), row.student, dateStr, { showStudentName: true });
    });

    slotUnassigned.forEach(row=>{
      html += buildUnassignedSlotHtml(row, dateStr, weekday);
    });

    html += `</div>`;
  });
  container.innerHTML = html;
}

export function bindDayDetailEvents(container, dateStr, onRefresh){
  if(!container || !dateStr) return;

  function refresh(){
    renderMatching();
    renderShortageDashboard();
    onRefresh(dateStr);
  }

  const filterTeacher = resolveFilterTeacher();
  if(filterTeacher){
    const root = container.querySelector('.teacher-absence-root');
    if(root){
      renderTeacherAbsencePanel(root, filterTeacher.id, dateStr, refresh);
    }
    return;
  }

  container.querySelectorAll('.day-detail-go-month').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      document.dispatchEvent(new CustomEvent('matching:go-student-month', {
        detail: { studentId: btn.dataset.studentId },
      }));
    });
  });

  container.querySelectorAll('.unconfirm-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      cancelRowDraftOrAssignment(btn);
      refresh();
    });
  });

  container.querySelectorAll('.cancel-draft-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      cancelRowDraftOrAssignment(btn);
      refresh();
    });
  });

  container.querySelectorAll('.mp-change-teacher-btn:not(.cancel-draft-btn)').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      mountWithdrawConfirm(container, btn, {
        teacherName: (()=>{
          const ym = (btn.dataset.date || dateStr || '').slice(0, 7) || getActiveYearMonth();
          const eff = findEffectiveAssignment(
            btn.dataset.student,
            btn.dataset.course,
            btn.dataset.day,
            Number(btn.dataset.slot),
            ym,
            btn.dataset.date || dateStr || null,
          );
          return S.teachers.find(t=> t.id === eff?.entry?.teacherId)?.name || '';
        })(),
        onConfirm: async ()=>{
          const result = await withdrawPendingAssignment(
            btn.dataset.student,
            btn.dataset.course,
            btn.dataset.day,
            Number(btn.dataset.slot),
            btn.dataset.date || dateStr,
          );
          if(!result.ok) return result;
          refresh();
          return result;
        },
      });
    });
  });

  container.querySelectorAll('.absent-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const student = S.students.find(s=> s.id === btn.dataset.student);
      const name = student ? student.name : 'この生徒';
      mountInlineConfirm(container, btn, {
        message: `${name}さんを、この日の欠席にしますか？`,
        confirmLabel: '欠席にする',
        cancelLabel: 'やめる',
        variant: 'primary',
        mountSelector: '.match-slot, .sched-teacher-box, .sched-student-row',
        onConfirm: async ()=>{
          recordStudentSlotAbsence(
            btn.dataset.student,
            btn.dataset.course,
            btn.dataset.subject,
            btn.dataset.day,
            Number(btn.dataset.slot),
            btn.dataset.date,
          );
          const recorded = S.absences.find(a=>
            a.studentId === btn.dataset.student &&
            a.date === btn.dataset.date &&
            Number(a.slot) === Number(btn.dataset.slot)
          );
          if(recorded) setMakeupPlacementFromAbsence(recorded);
          refresh();
          return { ok: true };
        },
      });
    });
  });

  container.querySelectorAll('.cancel-absence-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      cancelAbsenceRecord(btn.dataset.absence);
      refresh();
    });
  });

  container.querySelectorAll('.no-makeup-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(!btn.dataset.absence) return;
      markNoMakeup(btn.dataset.absence);
      refresh();
    });
  });

  container.querySelectorAll('.cancel-makeup-placement-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      clearMakeupPlacement();
      refresh();
    });
  });

  container.querySelectorAll('.find-makeup-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const { student, subject, date, target } = btn.dataset;
      const panel = document.getElementById(target);
      if(!panel) return;
      const isOpen = panel.style.display !== 'none';
      if(isOpen){
        panel.style.display = 'none';
        return;
      }
      const absenceId = btn.dataset.absence;
      const absence = S.absences.find(a=> a.id === absenceId);
      if(absence) setMakeupPlacementFromAbsence(absence);
      const studentObj = S.students.find(s=> s.id === student);
      const subjects = btn.dataset.dual === '1' && btn.dataset.subjects
        ? btn.dataset.subjects.split(',')
        : [subject];
      const makeupCands = studentObj
        ? lookupMakeupCandidates(studentObj, subjects, date, false)
        : [];
      panel.innerHTML = buildMakeupCandidateRowsHtml(absenceId, makeupCands);
      panel.style.display = 'block';
      panel.querySelectorAll('.confirm-makeup-btn').forEach(cbtn=>{
        cbtn.addEventListener('click', ()=>{
          const { absence: abId, date: mDate, teacher } = cbtn.dataset;
          const slot = Number(cbtn.dataset.slot);
          const result = confirmMakeup(abId, mDate, slot, teacher);
          if(!result.ok){
            showInlineNotice(container, result.msg, { variant: 'warn' });
            return;
          }
          refresh();
        });
      });
    });
  });

  container.querySelectorAll('.confirm-makeup-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(btn.dataset.confirmSub) return;
      const { absence, date, teacher } = btn.dataset;
      const slot = Number(btn.dataset.slot);
      const result = confirmMakeup(absence, date, slot, teacher);
      if(!result.ok){
        showInlineNotice(container, result.msg, { variant: 'warn' });
        return;
      }
      refresh();
    });
  });

  container.querySelectorAll('.cancel-makeup-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      cancelMakeup(btn.dataset.absence);
      refresh();
    });
  });

  container.querySelectorAll('.alt-toggle-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const panel = document.getElementById(btn.dataset.target);
      if(panel) panel.classList.toggle('open');
    });
  });

  container.querySelectorAll('.alt-option-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      replaceDesiredSlot(
        btn.dataset.student,
        btn.dataset.course,
        btn.dataset.oldDay,
        Number(btn.dataset.oldSlot),
        btn.dataset.newDay,
        Number(btn.dataset.newSlot)
      );
      refresh();
    });
  });

  container.querySelectorAll('.handle-teacher-absence-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const teacherId = btn.dataset.teacher;
      const box = btn.closest('.sched-teacher-box');
      if(!box) return;
      const existing = box.querySelector('.teacher-absence-root');
      if(existing){
        existing.remove();
        btn.setAttribute('aria-expanded', 'false');
        return;
      }
      container.querySelectorAll('.teacher-absence-root').forEach(el=> el.remove());
      container.querySelectorAll('.handle-teacher-absence-btn').forEach(b=> b.setAttribute('aria-expanded', 'false'));
      const root = document.createElement('div');
      root.className = 'teacher-absence-root';
      box.appendChild(root);
      btn.setAttribute('aria-expanded', 'true');
      renderTeacherAbsencePanel(root, teacherId, dateStr, refresh);
    });
  });

  bindAbsentTeacherFollowup(container, refresh);
}
