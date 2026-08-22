import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { S } from './state.js';
import {
  cancelAbsenceRecord,
  cancelMakeup,
  confirmMakeup,
  findMakeupCandidates,
  getEffectiveDayAssignments,
  getStudentDateRows,
  markNoMakeup,
  recordAbsence,
} from './absences.js';
import { resolveFilterStudent, resolveFilterTeacher } from './cal-filter.js';
import { getDayStatus, getUnassignedRowsForDate } from './calendar.js';
import { jumpToCalendarForDate, renderMatching } from './matching.js';
import { gradeLabel, subjectColor, teacherHonorific } from './schedule-core.js';
import {
  cancelAssignment,
  countRoomSlotOnDate,
  countTeacherSlotOnDate,
  findAlternativeSlots,
  replaceDesiredSlot,
  withdrawPendingAssignment,
} from './teacher-schedule-tab.js';
import { buildMatchCandidatesHtml } from './match-candidates-html.js';
import { buildPrefPairActionHtmlForTeacher, buildWaitingSlotCardHtml } from './match-candidate-ui.js';
import { analyzePendingMatchSlot } from './match-slot-status.js';

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
  const { student, course, slot } = row;
  const c = subjectColor(student.level, course.subject);
  const candHtml = buildMatchCandidatesHtml(
    student, course.id, course.subject, weekday, slot.id, dateStr,
    { btnClass: 'confirm-btn mp-confirm-btn', showConfirm: true },
  ) || `<div class="match-none">対応できる講師がいません</div>`;

  return `<div class="day-detail-unassigned">
    <div class="day-detail-unassigned-head">
      <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${course.subject}</span>
      <span>${student.name}さん</span>
      <span class="grade-tag">${gradeLabel(student)}</span>
      <span class="mp-slot-badge pending">未確定</span>
    </div>
    ${candHtml}
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
    const rows = getStudentDateRows(filterStudent, dateStr);
    if(rows.length === 0){
      container.innerHTML = `<div class="cal-empty-day">${filterStudent.name}さんは、この曜日（${weekday}曜日）に希望しているコマがありません。</div>`;
      return;
    }

    let html = `<div class="cal-day-note">${filterStudent.name}さんの希望曜日パターン（＋振替）から、この日の状況を表示しています。ここから直接、講師に依頼・欠席登録・振替の操作ができます。</div>`;
    html += `<button type="button" class="ghost mp-action day-detail-go-month" data-student-id="${filterStudent.id}">${filterStudent.name}さんの月間一覧へ</button>`;

    rows.forEach(r=>{
      const c = subjectColor(filterStudent.level, r.course.subject);

      if(r.isMakeupTarget){
        const teacher = S.teachers.find(t=> t.id === r.absence.makeup.teacherId);
        html += `<div class="match-slot">
          <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
          <div class="confirmed-box makeup-box">
            <span class="cb-label makeup-label">振替授業</span>
            <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span>
            <span class="cb-teacher">講師：${teacherHonorific(teacher)}</span>
            <button class="cancel-makeup-btn" data-absence="${r.absence.id}">振替を取り消す</button>
          </div>
        </div>`;
        return;
      }

      if(r.absence){
        if(r.absence.status === 'resolved' && r.absence.makeup){
          const mDate = new Date(r.absence.makeup.date + 'T00:00:00');
          const teacher = S.teachers.find(t=> t.id === r.absence.makeup.teacherId);
          html += `<div class="match-slot">
            <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
            <div class="absence-box">
              <span class="cb-label absence-label">欠席</span>
              <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span>
              <span class="cb-teacher">振替先：${mDate.getMonth() + 1}/${mDate.getDate()}（${teacher ? teacher.name : '?'}）</span>
              <button class="cancel-absence-btn" data-absence="${r.absence.id}">欠席を取り消す</button>
            </div>
          </div>`;
        }else if(r.absence.status === 'no-makeup'){
          const panelId2 = `makeup-cand-${r.absence.id}`;
          html += `<div class="match-slot">
            <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
            <div class="absence-box">
              <span class="cb-label absence-label">欠席（振替なし）</span>
              <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span>
              <button class="find-makeup-btn" data-absence="${r.absence.id}" data-student="${filterStudent.id}" data-level="${filterStudent.level}" data-subject="${r.course.subject}" data-date="${dateStr}" data-target="${panelId2}">振替を探す</button>
              <button class="cancel-absence-btn" data-absence="${r.absence.id}">欠席を取り消す</button>
            </div>
            <div class="makeup-cand-list" id="${panelId2}" style="display:none;"></div>
          </div>`;
        }else{
          const panelId = `makeup-cand-${r.absence.id}`;
          html += `<div class="match-slot">
            <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
            <div class="absence-box">
              <span class="cb-label absence-label">欠席（未対応）</span>
              <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span>
              <button class="find-makeup-btn" data-absence="${r.absence.id}" data-student="${filterStudent.id}" data-level="${filterStudent.level}" data-subject="${r.course.subject}" data-date="${dateStr}" data-target="${panelId}">振替を探す</button>
              <button class="no-makeup-btn" data-absence="${r.absence.id}">振替なしで確定</button>
              <button class="cancel-absence-btn" data-absence="${r.absence.id}">欠席を取り消す</button>
            </div>
            <div class="makeup-cand-list" id="${panelId}" style="display:none;"></div>
          </div>`;
        }
        return;
      }

      if(r.existing){
        const teacher = S.teachers.find(t=> t.id === r.existing.teacherId);
        const used = teacher ? countTeacherSlotOnDate(teacher.id, dateStr, r.slot.id, null) : 0;
        const autoBadge = r.existing.source === 'auto' ? '<span class="auto-badge">自動</span>' : '';
        if(r.isPending){
          const roomUsed = countRoomSlotOnDate(dateStr, r.slot.id, null);
          const subjectTag = `<span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span>`;
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
          });
        }else{
          const prefHtml = buildPrefPairActionHtmlForTeacher(filterStudent.id, r.course.id, r.existing.teacherId);
          html += `<div class="match-slot">
            <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
            <div class="confirmed-box">
              <span class="cb-label">確定${autoBadge}</span>
              <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span>
              <span class="cb-teacher">講師：${teacherHonorific(teacher)}</span>
              <span class="cb-cap">（定員 ${used}/${S.teacherCapacity}）</span>
              <div class="confirmed-box-actions">${prefHtml}
                <button class="absent-btn" data-student="${filterStudent.id}" data-course="${r.course.id}" data-subject="${r.course.subject}" data-day="${weekday}" data-slot="${r.slot.id}" data-date="${dateStr}">欠席にする</button>
                <button class="unconfirm-btn" data-student="${filterStudent.id}" data-course="${r.course.id}" data-day="${weekday}" data-slot="${r.slot.id}">確定を解除</button>
              </div>
            </div>
          </div>`;
        }
      }else{
        if(S.regularClosedDays.includes(weekday)){
          html += `<div class="match-slot">
            <div class="ms-slot-label">${r.slot.label}（${r.slot.time}）</div>
            <div class="match-none">この曜日は定休日のため授業を組めません（基本設定で変更できます）</div>
          </div>`;
          return;
        }

        const roomUsed = countRoomSlotOnDate(dateStr, r.slot.id, null);
        const slotAnalysis = analyzePendingMatchSlot(filterStudent, r.course, weekday, r.slot.id, detailYearMonth, dateStr);

        let candHtml = buildMatchCandidatesHtml(
          filterStudent, r.course.id, r.course.subject, weekday, r.slot.id, dateStr,
          { btnClass: 'confirm-btn mp-confirm-btn', showConfirm: true },
        );
        if(!candHtml){
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
          <div style="margin-bottom:6px;"><span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${r.course.subject}</span></div>
          ${candHtml}
        </div>`;
      }
    });

    container.innerHTML = html;
    return;
  }

  if(filterTeacher){
    const list = getEffectiveDayAssignments(dateStr).filter(a=> a.teacherId === filterTeacher.id);
    if(list.length === 0){
      container.innerHTML = `<div class="cal-empty-day">${teacherHonorific(filterTeacher)}は、この日に担当授業がありません。</div>`;
      return;
    }

    let html = `<div class="cal-day-note">${teacherHonorific(filterTeacher)}の担当授業を表示しています。</div>`;
    SLOTS.forEach(slot=>{
      const slotList = list.filter(a=> a.slot === slot.id);
      if(slotList.length === 0) return;
      const used = countTeacherSlotOnDate(filterTeacher.id, dateStr, slot.id, null);
      html += `<div class="match-slot"><div class="ms-slot-label">${slot.label}（${slot.time}）<span style="font-weight:400;color:var(--ink-soft);"> ／ 定員 ${used}/${S.teacherCapacity}</span></div>`;
      slotList.forEach(a=>{
        const student = S.students.find(s=> s.id === a.studentId);
        const studentName = student ? student.name : '(削除された生徒)';
        const gLabel = student ? gradeLabel(student) : '';
        const level = student ? student.level : '';
        const c = level ? subjectColor(level, a.subject) : {bg:'#eee', text:'#333'};
        const autoBadge = a.source === 'auto' ? '<span class="auto-badge">自動</span>' : '';
        const makeupBadge = a.kind === 'makeup' ? '<span class="auto-badge" style="background:#fff;color:var(--ink);border:1px dashed var(--ink);">振替</span>' : '';
        html += `<div class="confirmed-box">
          <span class="cb-label">確定${autoBadge}${makeupBadge}</span>
          <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${a.subject}</span>
          <span class="cb-teacher">${studentName}<span class="grade-tag">${gLabel}</span></span>
        </div>`;
      });
      html += '</div>';
    });
    container.innerHTML = html;
    return;
  }

  const list = getEffectiveDayAssignments(dateStr);
  const unassigned = getUnassignedRowsForDate(dateStr);

  if(status.type !== 'open'){
    container.innerHTML = `<div class="cal-empty-day">${label}は${status.label || status.holidayName || status.closureLabel || '休校日'}です。</div>`;
    return;
  }

  if(list.length === 0 && unassigned.length === 0){
    container.innerHTML = `<div class="cal-empty-day">${label}に授業の予定はありません。</div>`;
    return;
  }

  let html = `<div class="cal-day-note">確定した授業と、未確定の希望コマを表示しています。未確定のコマから講師を決められます。</div>`;
  SLOTS.forEach(slot=>{
    const slotList = list.filter(a=> a.slot === slot.id);
    const slotUnassigned = unassigned.filter(r=> r.slot.id === slot.id);
    if(slotList.length === 0 && slotUnassigned.length === 0) return;

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
        let studentsHtml = '';
        entries.forEach(a=>{
          const student = S.students.find(s=> s.id === a.studentId);
          const studentName = student ? student.name : '(削除された生徒)';
          const gLabel = student ? gradeLabel(student) : '';
          const level = student ? student.level : '';
          const c = level ? subjectColor(level, a.subject) : { bg: '#eee', text: '#333' };
          const makeupBadge = a.kind === 'makeup' ? '<span class="auto-badge" style="background:#fff;color:var(--ink);border:1px dashed var(--ink);">振替</span>' : '';
          const handleBtn = a.kind === 'normal'
            ? `<button class="handle-absence-btn" data-student="${a.studentId}" data-date="${dateStr}">欠席・振替の対応</button>`
            : '';
          studentsHtml += `<div class="sched-student-row">
            <span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${a.subject}</span>
            <span>${studentName}<span class="grade-tag">${gLabel}</span></span>${makeupBadge}${handleBtn}
          </div>`;
        });
        html += `<div class="sched-teacher-box">
          <div class="sched-teacher-name">${teacherHonorific(teacher)}<span class="sched-cap">（${entries.length}/${S.teacherCapacity}）</span></div>
          ${studentsHtml}
        </div>`;
      });
    }

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
    onRefresh(dateStr);
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
      cancelAssignment(btn.dataset.student, btn.dataset.course, btn.dataset.day, Number(btn.dataset.slot));
      refresh();
    });
  });

  container.querySelectorAll('.mp-change-teacher-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      btn.disabled = true;
      const result = await withdrawPendingAssignment(
        btn.dataset.student,
        btn.dataset.course,
        btn.dataset.day,
        Number(btn.dataset.slot),
        btn.dataset.date || dateStr,
      );
      btn.disabled = false;
      if(result.cancelled) return;
      if(!result.ok){
        window.alert(result.msg || '取り消しに失敗しました。');
        return;
      }
      refresh();
    });
  });

  container.querySelectorAll('.absent-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      recordAbsence(btn.dataset.student, btn.dataset.course, btn.dataset.subject, btn.dataset.day, Number(btn.dataset.slot), btn.dataset.date);
      refresh();
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
      markNoMakeup(btn.dataset.absence);
      refresh();
    });
  });

  container.querySelectorAll('.find-makeup-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const { student, level, subject, date, target } = btn.dataset;
      const panel = document.getElementById(target);
      if(!panel) return;
      const isOpen = panel.style.display !== 'none';
      if(isOpen){
        panel.style.display = 'none';
        return;
      }
      const absenceId = btn.dataset.absence;
      const makeupCands = findMakeupCandidates(student, level, subject, date);
      let makeupHtml = '';
      if(makeupCands.length === 0){
        makeupHtml = `<div class="match-none">対応できる振替候補が見つかりませんでした。</div>`;
      }else{
        makeupCands.forEach(mc=>{
          const md = new Date(mc.date + 'T00:00:00');
          const mLabel = `${md.getMonth() + 1}/${md.getDate()}（${WEEKDAY_JP[md.getDay()]}）${mc.slot.label}`;
          mc.candidates.forEach(cand=>{
            makeupHtml += `<div class="match-cand">
              <span class="match-badge full">${mLabel}</span>
              <span>${cand.teacher.name}</span>
              <span class="cap-note">${cand.used}/${S.teacherCapacity}人</span>
              <button class="confirm-makeup-btn" data-absence="${absenceId}" data-date="${mc.date}" data-slot="${mc.slot.id}" data-teacher="${cand.teacher.id}">振替を確定</button>
            </div>`;
          });
        });
      }
      panel.innerHTML = makeupHtml;
      panel.style.display = 'block';
      panel.querySelectorAll('.confirm-makeup-btn').forEach(cbtn=>{
        cbtn.addEventListener('click', ()=>{
          const { absence, date: mDate, teacher } = cbtn.dataset;
          const slot = Number(cbtn.dataset.slot);
          const result = confirmMakeup(absence, mDate, slot, teacher);
          if(!result.ok){
            alert(result.msg);
            return;
          }
          refresh();
        });
      });
    });
  });

  container.querySelectorAll('.confirm-makeup-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const { absence, date, teacher } = btn.dataset;
      const slot = Number(btn.dataset.slot);
      const result = confirmMakeup(absence, date, slot, teacher);
      if(!result.ok){
        alert(result.msg);
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

  container.querySelectorAll('.handle-absence-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      jumpToCalendarForDate(btn.dataset.student, btn.dataset.date);
    });
  });
}
