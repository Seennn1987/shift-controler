import { SLOTS } from '../shared/constants.js';
import { S } from './state.js';
import {
  cancelSubstitute,
  cancelTeacherAbsence,
  confirmSubstitute,
  findSubstituteCandidatesForStudent,
  findTeacherAbsence,
  getTeacherLessonsOnDate,
  recordTeacherAbsence,
  resolveSlotViaStudentAbsence,
} from './absences.js';
import { teacherHonorific } from './schedule-core.js';

function candAreaId(teacherId, slotId, studentId){
  return `taCand-${teacherId}-${slotId}-${studentId}`;
}

export function renderTeacherAbsencePanel(container, teacherId, dateStr, onRefresh){
  if(!container) return;
  const teacher = S.teachers.find(t=> t.id === teacherId);
  if(!teacher){
    container.innerHTML = '<div class="cal-empty-day">講師が見つかりません。</div>';
    return;
  }

  const lessonsBySlot = getTeacherLessonsOnDate(teacherId, dateStr);
  const slotIds = Object.keys(lessonsBySlot).map(Number).sort((a, b)=> a - b);
  const ta = findTeacherAbsence(teacherId, dateStr);

  if(slotIds.length === 0){
    container.innerHTML = `<div class="cal-empty-day">${teacherHonorific(teacher)}は、この日に確定している授業はありません。</div>`;
    return;
  }

  let rowsHtml = '';
  slotIds.forEach(slotId=>{
    const slot = SLOTS.find(s=> s.id === slotId);
    const studentEntries = lessonsBySlot[slotId];
    const isMarked = ta && ta.slots.includes(slotId);

    let studentRowsHtml = '';
    studentEntries.forEach(e=>{
      const st = S.students.find(s=> s.id === e.studentId);
      const studentLabel = `${st ? st.name : '?'}（${e.subject}）`;
      const sub = S.teacherSubstitutions.find(s=>
        s.teacherId === teacherId && s.date === dateStr && s.slot === slotId && s.studentId === e.studentId,
      );
      let stStatusHtml = '';
      if(sub){
        const subTeacher = S.teachers.find(t=> t.id === sub.substituteTeacherId);
        stStatusHtml = `<span class="ta-resolved-inline">代講：${subTeacher ? subTeacher.name : '?'}先生 <button type="button" class="cancel-absence-btn" data-cancel-sub="${slotId}" data-cancel-student="${e.studentId}">取り消す</button></span>`;
      }
      const areaId = candAreaId(teacherId, slotId, e.studentId);
      studentRowsHtml += `<div class="ta-student-row" data-slot="${slotId}" data-student="${e.studentId}" data-subject="${e.subject}">
        <span class="ta-student-label">${studentLabel}</span>
        ${!sub ? `<button type="button" class="ghost ta-find-sub-btn" data-slot="${slotId}" data-student="${e.studentId}" data-subject="${e.subject}">代講を探す</button>` : ''}
        ${stStatusHtml}
        <div class="ta-cand-area" id="${areaId}" style="display:none;"></div>
      </div>`;
    });

    rowsHtml += `<div class="ta-slot-row">
      <label class="ta-slot-check">
        <input type="checkbox" class="ta-slot-checkbox" data-slot="${slotId}" ${isMarked ? 'checked disabled' : ''}>
        <span><b>${slot.label}（${slot.time}）</b></span>
      </label>
      ${studentRowsHtml}
      ${isMarked ? '<div class="ta-resolved">この枠は欠勤対応済みです</div>' : ''}
    </div>`;
  });

  container.innerHTML = `<div class="teacher-absence-panel">
    <p class="teacher-absence-desc">1コマに複数の生徒がいる場合は、生徒ごとに個別に代講を探せます。見つからない場合は「代講せず欠席にする」から、その生徒だけ振替の流れに乗せられます。</p>
    <label class="chip teacher-absence-all-chip">
      <input type="checkbox" id="taAllSlotsCheckbox">
      <span>全コマ欠勤にする</span>
    </label>
    ${rowsHtml}
  </div>`;

  const refreshPanel = ()=>{
    if(typeof onRefresh === 'function') onRefresh();
    else renderTeacherAbsencePanel(container, teacherId, dateStr, onRefresh);
  };

  container.querySelector('#taAllSlotsCheckbox')?.addEventListener('change', (e)=>{
    container.querySelectorAll('.ta-slot-checkbox:not(:disabled)').forEach(cb=>{ cb.checked = e.target.checked; });
  });

  container.querySelectorAll('.ta-find-sub-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const slotId = Number(btn.dataset.slot);
      const studentId = btn.dataset.student;
      const subject = btn.dataset.subject;
      const candArea = container.querySelector(`#${candAreaId(teacherId, slotId, studentId)}`);
      if(!candArea) return;
      const isOpen = candArea.style.display !== 'none';
      if(isOpen){ candArea.style.display = 'none'; return; }

      const candidates = findSubstituteCandidatesForStudent(dateStr, slotId, teacherId, studentId, subject);
      let html = '';
      if(candidates.length === 0){
        html = `<div class="match-none">対応できる代講候補が見つかりませんでした。</div>
          <button type="button" class="no-makeup-btn" data-fallback-slot="${slotId}" data-fallback-student="${studentId}">代講せず欠席にする</button>`;
      }else{
        candidates.forEach(c=>{
          html += `<div class="match-cand">
            <span>${c.name}先生</span>
            <button type="button" class="confirm-makeup-btn" data-confirm-sub="${slotId}" data-confirm-student="${studentId}" data-sub-teacher="${c.id}">この先生に代講してもらう</button>
          </div>`;
        });
        html += `<button type="button" class="no-makeup-btn" data-fallback-slot="${slotId}" data-fallback-student="${studentId}" style="margin-top:6px;">代講せず欠席にする</button>`;
      }
      candArea.innerHTML = html;
      candArea.style.display = 'block';

      candArea.querySelectorAll('[data-confirm-sub]').forEach(cbtn=>{
        cbtn.addEventListener('click', ()=>{
          const s = Number(cbtn.dataset.confirmSub);
          const sid = cbtn.dataset.confirmStudent;
          confirmSubstitute(teacherId, dateStr, s, cbtn.dataset.subTeacher, sid);
          recordTeacherAbsence(teacherId, dateStr, [s]);
          refreshPanel();
        });
      });
      candArea.querySelectorAll('[data-fallback-slot]').forEach(fbtn=>{
        fbtn.addEventListener('click', ()=>{
          const s = Number(fbtn.dataset.fallbackSlot);
          const sid = fbtn.dataset.fallbackStudent;
          const entry = lessonsBySlot[s]?.find(e=> e.studentId === sid);
          if(entry) resolveSlotViaStudentAbsence(teacherId, dateStr, s, [entry]);
          recordTeacherAbsence(teacherId, dateStr, [s]);
          refreshPanel();
        });
      });
    });
  });

  container.querySelectorAll('[data-cancel-sub]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const slotId = Number(btn.dataset.cancelSub);
      const studentId = btn.dataset.cancelStudent;
      cancelSubstitute(teacherId, dateStr, slotId, studentId);
      if(ta){
        ta.slots = ta.slots.filter(s=> s !== slotId);
        if(ta.slots.length === 0) cancelTeacherAbsence(ta.id);
      }
      refreshPanel();
    });
  });
}
