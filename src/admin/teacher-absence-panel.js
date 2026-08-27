import { SLOTS } from '../shared/constants.js';
import { S } from './state.js';
import {
  cancelSubstitute,
  confirmSubstitute,
  findSubstituteCandidatesForStudent,
  findTeacherAbsence,
  getTeacherLessonsOnDate,
  recordTeacherAbsence,
  resolveSlotViaStudentAbsence,
} from './absences.js';
import { teacherHonorific } from './schedule-core.js';
import { mountInlineConfirm } from '../shared/inline-confirm.js';

function candAreaId(teacherId, slotId, studentId){
  return `taCand-${teacherId}-${slotId}-${studentId}`;
}

export function buildAbsentTeacherFollowupHtml({ dateStr, slotId, studentId, courseId, subject, originalTeacherId }){
  const areaId = candAreaId(originalTeacherId, slotId, studentId);
  return `<div class="match-none">この日は決まっていた講師が欠勤です。代講を探すか、生徒を欠席にしてください。</div>
    <button type="button" class="ghost ta-find-sub-btn" data-teacher="${originalTeacherId}" data-slot="${slotId}" data-student="${studentId}" data-subject="${subject}" data-date="${dateStr}">代講を探す</button>
    <button type="button" class="no-makeup-btn ta-absent-fallback-btn" data-fallback-teacher="${originalTeacherId}" data-fallback-slot="${slotId}" data-fallback-student="${studentId}" data-fallback-course="${courseId || ''}" data-fallback-subject="${subject || ''}" data-date="${dateStr}">代講せず欠席にする</button>
    <div class="ta-cand-area" id="${areaId}" style="display:none;"></div>`;
}

export function bindAbsentTeacherFollowup(container, onRefresh){
  if(!container) return;
  container.querySelectorAll('.ta-find-sub-btn').forEach(btn=>{
    if(btn.dataset.boundFollowup === '1') return;
    btn.dataset.boundFollowup = '1';
    btn.addEventListener('click', ()=>{
      const teacherId = btn.dataset.teacher;
      const slotId = Number(btn.dataset.slot);
      const studentId = btn.dataset.student;
      const subject = btn.dataset.subject;
      const dateStr = btn.dataset.date;
      const candArea = container.querySelector(`#${candAreaId(teacherId, slotId, studentId)}`);
      if(!candArea) return;
      const isOpen = candArea.style.display !== 'none';
      if(isOpen){ candArea.style.display = 'none'; return; }

      const candidates = findSubstituteCandidatesForStudent(dateStr, slotId, teacherId, studentId, subject);
      let html = '';
      if(candidates.length === 0){
        html = `<div class="match-none">対応できる代講候補が見つかりませんでした。</div>
          <button type="button" class="no-makeup-btn" data-fallback-teacher="${teacherId}" data-fallback-slot="${slotId}" data-fallback-student="${studentId}" data-date="${dateStr}">代講せず欠席にする</button>`;
      }else{
        candidates.forEach(c=>{
          html += `<div class="match-cand">
            <span>${c.name}先生</span>
            <button type="button" class="confirm-makeup-btn" data-confirm-sub="${slotId}" data-confirm-student="${studentId}" data-sub-teacher="${c.id}" data-teacher="${teacherId}" data-date="${dateStr}">この先生に代講してもらう</button>
          </div>`;
        });
        html += `<button type="button" class="no-makeup-btn" data-fallback-teacher="${teacherId}" data-fallback-slot="${slotId}" data-fallback-student="${studentId}" data-date="${dateStr}" style="margin-top:6px;">代講せず欠席にする</button>`;
      }
      candArea.innerHTML = html;
      candArea.style.display = 'block';
      bindAbsentTeacherFollowupActions(candArea, onRefresh);
    });
  });
  bindAbsentTeacherFollowupActions(container, onRefresh);
}

function bindAbsentTeacherFollowupActions(root, onRefresh){
  root.querySelectorAll('[data-confirm-sub]').forEach(cbtn=>{
    if(cbtn.dataset.boundFollowup === '1') return;
    cbtn.dataset.boundFollowup = '1';
    cbtn.addEventListener('click', ()=>{
      const teacherId = cbtn.dataset.teacher;
      const dateStr = cbtn.dataset.date;
      const slotId = Number(cbtn.dataset.confirmSub);
      const studentId = cbtn.dataset.confirmStudent;
      confirmSubstitute(teacherId, dateStr, slotId, cbtn.dataset.subTeacher, studentId);
      recordTeacherAbsence(teacherId, dateStr, [slotId]);
      if(typeof onRefresh === 'function') onRefresh();
    });
  });
  root.querySelectorAll('[data-fallback-teacher]').forEach(fbtn=>{
    if(fbtn.dataset.boundFollowup === '1') return;
    fbtn.dataset.boundFollowup = '1';
    fbtn.addEventListener('click', ()=>{
      const teacherId = fbtn.dataset.fallbackTeacher;
      const dateStr = fbtn.dataset.date;
      const slotId = Number(fbtn.dataset.fallbackSlot);
      const studentId = fbtn.dataset.fallbackStudent;
      const courseId = fbtn.dataset.fallbackCourse;
      const subject = fbtn.dataset.fallbackSubject;
      const lessons = getTeacherLessonsOnDate(teacherId, dateStr);
      const entry = (lessons[slotId] || []).find(e=> e.studentId === studentId)
        || (courseId ? { studentId, courseId, subject } : null);
      if(entry) resolveSlotViaStudentAbsence(teacherId, dateStr, slotId, [entry]);
      recordTeacherAbsence(teacherId, dateStr, [slotId]);
      if(typeof onRefresh === 'function') onRefresh();
    });
  });
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
    const isMarked = !!(ta && ta.slots.some(s=> Number(s) === Number(slotId)));

    let studentRowsHtml = '';
    studentEntries.forEach(e=>{
      const st = S.students.find(s=> s.id === e.studentId);
      const subjectLabel = e.subjects?.length === 2 ? e.subjects.join('+') : e.subject;
      const studentLabel = `${st ? st.name : '?'}（${subjectLabel}）`;
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

  const unmarkedCount = slotIds.filter(slotId=> !(ta && ta.slots.some(s=> Number(s) === Number(slotId)))).length;

  container.innerHTML = `<div class="teacher-absence-panel">
    <p class="teacher-absence-desc">1コマに複数の生徒がいる場合は、生徒ごとに個別に代講を探せます。見つからない場合は「代講せず欠席にする」から、その生徒だけ振替の流れに乗せられます。</p>
    <label class="chip teacher-absence-all-chip">
      <input type="checkbox" id="taAllSlotsCheckbox"${unmarkedCount === 0 ? ' disabled' : ''}>
      <span>全コマ欠勤にする</span>
    </label>
    ${rowsHtml}
  </div>`;

  const refreshPanel = ()=>{
    if(typeof onRefresh === 'function') onRefresh();
    else renderTeacherAbsencePanel(container, teacherId, dateStr, onRefresh);
  };

  let syncingAll = false;
  const unmarkedBoxes = ()=> [...container.querySelectorAll('.ta-slot-checkbox:not(:disabled)')];
  const uncheckAbsenceDraft = ()=>{
    const allCb = container.querySelector('#taAllSlotsCheckbox');
    if(allCb) allCb.checked = false;
    unmarkedBoxes().forEach(cb=>{ cb.checked = false; });
  };

  container.querySelector('#taAllSlotsCheckbox')?.addEventListener('change', (e)=>{
    const on = e.target.checked;
    syncingAll = true;
    unmarkedBoxes().forEach(cb=>{ cb.checked = on; });
    syncingAll = false;
    if(!on) return;
    mountInlineConfirm(container, e.target, {
      message: `${teacherHonorific(teacher)}の、この日の授業をすべて欠勤にしますか？代講は、欠勤のあとで生徒ごとに付けられます。`,
      confirmLabel: '欠勤にする',
      cancelLabel: 'やめる',
      variant: 'primary',
      mountSelector: '.teacher-absence-panel, .sched-teacher-box',
      onConfirm: async ()=>{
        const slots = unmarkedBoxes().filter(cb=> cb.checked).map(cb=> Number(cb.dataset.slot));
        if(slots.length) recordTeacherAbsence(teacherId, dateStr, slots);
        refreshPanel();
        return { ok: true };
      },
    });
    container.querySelector('.app-inline-confirm [data-action=cancel]')?.addEventListener('click', uncheckAbsenceDraft);
  });

  unmarkedBoxes().forEach(cb=>{
    cb.addEventListener('change', ()=>{
      if(syncingAll) return;
      if(!cb.checked) return;
      const slotId = Number(cb.dataset.slot);
      const slot = SLOTS.find(s=> Number(s.id) === slotId);
      const slotLabel = slot ? slot.label : `${slotId}講`;
      mountInlineConfirm(container, cb, {
        message: `${teacherHonorific(teacher)}の${slotLabel}を欠勤にしますか？代講は、欠勤のあとで生徒ごとに付けられます。`,
        confirmLabel: '欠勤にする',
        cancelLabel: 'やめる',
        variant: 'primary',
        mountSelector: '.ta-slot-row, .teacher-absence-panel, .sched-teacher-box',
        onConfirm: async ()=>{
          recordTeacherAbsence(teacherId, dateStr, [slotId]);
          refreshPanel();
          return { ok: true };
        },
      });
      container.querySelector('.app-inline-confirm [data-action=cancel]')?.addEventListener('click', ()=>{
        cb.checked = false;
        const allCb = container.querySelector('#taAllSlotsCheckbox');
        if(allCb) allCb.checked = false;
      });
    });
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
      refreshPanel();
    });
  });
}
