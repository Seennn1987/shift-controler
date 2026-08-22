import { SUBJECT_MAP, DAYS, SLOTS } from '../shared/constants.js';
import { subjectColor } from './schedule-core.js';
import { S } from './state.js';
import {
  analyzeSubjectAtSlot,
  renderSubjectPickerBadge,
  subjectPickerBadgeLabel,
} from './match-slot-status.js';

let activePopover = null;

function closePopover(){
  if(activePopover){
    activePopover.remove();
    activePopover = null;
  }
  document.removeEventListener('click', onDocumentClick, true);
  document.querySelectorAll('.scc-cell.scc-selected').forEach(el=> el.classList.remove('scc-selected'));
}

function onDocumentClick(e){
  if(activePopover && !activePopover.contains(e.target)){
    closePopover();
  }
}

function findOccupant(formCourses, day, slot){
  for(const course of formCourses){
    if(course.desiredSlots.some(ds=> ds.day === day && ds.slot === slot)) return course;
  }
  return null;
}

function slotLabel(day, slotId){
  const slot = SLOTS.find(s=> s.id === slotId);
  return `${day}曜 ${slot?.label || ''}（${slot?.time || ''}）`;
}

function cellStatusBadgeHtml(level, subject, day, slotId){
  const analysis = analyzeSubjectAtSlot(level, subject, day, slotId, S.referenceYearMonth);
  const map = {
    priority: 'is-priority',
    ready: 'is-ready',
    'no-shift': 'is-no-capable',
    'no-capable': 'is-no-capable',
    closed: 'is-closed',
    'room-full': 'is-no-shift',
  };
  const cls = map[analysis.status] || 'is-no-capable';
  const label = subjectPickerBadgeLabel(analysis);
  return `<span class="scc-cell-badge match-status-badge ${cls}">${label}</span>`;
}

function pruneAndSync(formCourses){
  for(let i = formCourses.length - 1; i >= 0; i--){
    const course = formCourses[i];
    course.weeklyCount = course.desiredSlots.length;
    if(course.desiredSlots.length === 0) formCourses.splice(i, 1);
  }
}

export function assignSlotSubject(formCourses, genCourseId, day, slot, subject){
  formCourses.forEach(c=>{
    c.desiredSlots = c.desiredSlots.filter(ds=> !(ds.day === day && ds.slot === slot));
  });
  let course = formCourses.find(c=> c.subject === subject);
  if(!course){
    course = { id: genCourseId(), subject, weeklyCount: 0, desiredSlots: [] };
    formCourses.push(course);
  }
  if(!course.desiredSlots.some(ds=> ds.day === day && ds.slot === slot)){
    course.desiredSlots.push({ day, slot });
  }
  pruneAndSync(formCourses);
}

export function clearSlotSubject(formCourses, day, slot){
  formCourses.forEach(c=>{
    c.desiredSlots = c.desiredSlots.filter(ds=> !(ds.day === day && ds.slot === slot));
  });
  pruneAndSync(formCourses);
}

export function normalizeFormCoursesForSave(formCourses){
  pruneAndSync(formCourses);
  return formCourses.filter(c=> c.desiredSlots.length > 0).map(c=>({
    ...c,
    weeklyCount: c.desiredSlots.length,
  }));
}

function showSubjectPopover(anchor, { level, day, slot, currentSubject, onPick, onClear }){
  closePopover();
  const cell = anchor.closest('.scc-cell');
  cell?.classList.add('scc-selected');

  const subjects = SUBJECT_MAP[level] || [];
  const pop = document.createElement('div');
  pop.className = 'student-course-popover';
  pop.setAttribute('role', 'dialog');
  pop.innerHTML = `
    <div class="scp-slot-context">${slotLabel(day, slot)}</div>
    <div class="scp-title">${currentSubject ? '教科を変更' : '教科を選択'}</div>
    <p class="scp-hint">各教科の横で、このコマに講師が組めるか確認できます。</p>
    <div class="scp-subjects">${subjects.map(sub=>{
      const c = subjectColor(level, sub);
      const active = sub === currentSubject ? ' scp-subject-active' : '';
      const analysis = analyzeSubjectAtSlot(level, sub, day, slot, S.referenceYearMonth);
      const badge = renderSubjectPickerBadge(analysis);
      return `<button type="button" class="scp-subject-row${active}" data-subject="${sub}">
        <span class="scp-subject-name" style="background:${c.bg};color:${c.text};">${sub}</span>
        ${badge}
      </button>`;
    }).join('')}</div>
    ${currentSubject ? '<button type="button" class="scp-clear-btn ghost">このコマを空にする</button>' : ''}
  `;
  document.body.appendChild(pop);
  activePopover = pop;

  const rect = anchor.getBoundingClientRect();
  pop.style.position = 'fixed';
  requestAnimationFrame(()=>{
    const h = pop.offsetHeight;
    const w = pop.offsetWidth;
    let top = rect.bottom + 4;
    let left = rect.left;
    if(top + h + 8 > window.innerHeight) top = Math.max(8, rect.top - h - 4);
    if(left + w + 8 > window.innerWidth) left = Math.max(8, window.innerWidth - w - 8);
    if(left < 8) left = 8;
    pop.style.top = `${top}px`;
    pop.style.left = `${left}px`;
  });

  pop.querySelectorAll('.scp-subject-row').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      onPick(btn.dataset.subject);
      closePopover();
    });
  });
  pop.querySelector('.scp-clear-btn')?.addEventListener('click', ()=>{
    onClear();
    closePopover();
  });
  setTimeout(()=> document.addEventListener('click', onDocumentClick, true), 0);
}

export function renderStudentCourseCalendar(container, opts){
  if(!container) return;
  closePopover();

  const { formCourses, level, genCourseId, onChange } = opts;

  let tableHtml = '<table class="avail-grid student-course-grid"><thead><tr><th class="slot-h">時間割</th>';
  DAYS.forEach(d=>{ tableHtml += `<th data-day="${d}">${d}</th>`; });
  tableHtml += '</tr></thead><tbody>';

  SLOTS.forEach(slot=>{
    tableHtml += `<tr><th class="slot-h">${slot.label}<br><span class="slot-time">${slot.time}</span></th>`;
    DAYS.forEach(day=>{
      const closed = S.regularClosedDays.includes(day);
      const occupant = findOccupant(formCourses, day, slot.id);
      if(closed){
        tableHtml += `<td class="scc-cell scc-closed" data-day="${day}"><span class="scc-closed-label">休</span></td>`;
      }else if(occupant){
        const c = subjectColor(level, occupant.subject);
        const badge = cellStatusBadgeHtml(level, occupant.subject, day, slot.id);
        tableHtml += `<td class="scc-cell scc-filled" data-day="${day}" data-slot="${slot.id}">
          <button type="button" class="scc-slot-btn scc-slot-filled-btn">
            <span class="scc-subject-name" style="background:${c.bg};color:${c.text};">${occupant.subject}</span>
            ${badge}
          </button>
        </td>`;
      }else{
        tableHtml += `<td class="scc-cell scc-empty" data-day="${day}" data-slot="${slot.id}">
          <button type="button" class="scc-slot-btn scc-empty-btn" aria-label="教科を追加">＋</button>
        </td>`;
      }
    });
    tableHtml += '</tr>';
  });
  tableHtml += '</tbody></table>';

  const activeCourses = formCourses.filter(c=> c.desiredSlots.length > 0);
  const summaryHtml = activeCourses.length
    ? activeCourses.map(c=>{
      const col = subjectColor(level, c.subject);
      return `<span class="scc-summary-tag" style="background:${col.bg};color:${col.text};">${c.subject} 週${c.desiredSlots.length}コマ</span>`;
    }).join('')
    : '<span class="scc-summary-empty">空いているマスをクリックして、教科を選んでください。</span>';

  container.innerHTML = `
    <div class="student-course-calendar-wrap">
      ${tableHtml}
      <div class="scc-summary">${summaryHtml}</div>
    </div>
  `;

  container.querySelectorAll('.scc-slot-btn').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      const cell = btn.closest('.scc-cell');
      const day = cell.dataset.day;
      const slot = Number(cell.dataset.slot);
      const occupant = findOccupant(formCourses, day, slot);
      showSubjectPopover(btn, {
        level,
        day,
        slot,
        currentSubject: occupant?.subject || null,
        onPick: subject=>{
          assignSlotSubject(formCourses, genCourseId, day, slot, subject);
          onChange();
        },
        onClear: ()=>{
          clearSlotSubject(formCourses, day, slot);
          onChange();
        },
      });
    });
  });

  container.querySelectorAll('th[data-day], td[data-day]').forEach(el=>{
    el.classList.toggle('closed-day-tint', S.regularClosedDays.includes(el.dataset.day));
  });
}

export function resetCourseCalendarSelection(){
  closePopover();
}
