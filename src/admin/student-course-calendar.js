import { SUBJECT_MAP, DAYS, SLOTS } from '../shared/constants.js';
import { subjectColor } from './schedule-core.js';
import { S } from './state.js';
import {
  assignDualSlotSubjects,
  clearSlotAllSubjects,
  findDualPairAtSlot,
  findSingleOccupant,
  formatDualSubjectLabel,
  supportsDualSubjectSlot,
} from './dual-subject.js';
import {
  analyzeDualSubjectAtSlot,
  analyzeSubjectAtSlot,
  coursePickerMonthHint,
  renderDualSubjectPickerBadge,
  renderSubjectPickerBadge,
  resolveCoursePickerYearMonth,
  subjectPickerBadgeLabel,
  subjectPickerDualBadgeLabel,
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

function slotLabel(day, slotId){
  const slot = SLOTS.find(s=> s.id === slotId);
  return `${day}曜 ${slot?.label || ''}（${slot?.time || ''}）`;
}

function cellStatusBadgeHtml(level, subject, day, slotId, yearMonth){
  const analysis = analyzeSubjectAtSlot(level, subject, day, slotId, yearMonth);
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

function cellDualStatusBadgeHtml(level, subjectA, subjectB, day, slotId, yearMonth){
  const analysis = analyzeDualSubjectAtSlot(level, subjectA, subjectB, day, slotId, yearMonth);
  const map = {
    priority: 'is-priority',
    ready: 'is-ready',
    'no-shift': 'is-no-capable',
    'no-capable': 'is-no-capable',
    closed: 'is-closed',
    'room-full': 'is-no-shift',
  };
  const cls = map[analysis.status] || 'is-no-capable';
  const label = subjectPickerDualBadgeLabel(analysis);
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
  clearSlotAllSubjects(formCourses, day, slot);
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
  clearSlotAllSubjects(formCourses, day, slot);
  pruneAndSync(formCourses);
}

export { assignDualSlotSubjects } from './dual-subject.js';

export function normalizeFormCoursesForSave(formCourses){
  pruneAndSync(formCourses);
  return formCourses.filter(c=> c.desiredSlots.length > 0).map(c=>({
    ...c,
    weeklyCount: c.desiredSlots.length,
  }));
}

function renderDualSubjectTags(level, subjects){
  return subjects.map(sub=>{
    const c = subjectColor(level, sub);
    return `<span class="scc-subject-name" style="background:${c.bg};color:${c.text};">${sub}</span>`;
  }).join('<span class="scc-dual-plus">+</span>');
}

function mountPopover(anchor, pop){
  document.body.appendChild(pop);
  activePopover = pop;
  const cell = anchor.closest('.scc-cell');
  cell?.classList.add('scc-selected');
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
  setTimeout(()=> document.addEventListener('click', onDocumentClick, true), 0);
}

function showSubjectPopover(anchor, { level, day, slot, currentSubject, onPick, onClear, yearMonth }){
  closePopover();
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
      const analysis = analyzeSubjectAtSlot(level, sub, day, slot, yearMonth);
      const badge = renderSubjectPickerBadge(analysis);
      return `<button type="button" class="scp-subject-row${active}" data-subject="${sub}">
        <span class="scp-subject-name" style="background:${c.bg};color:${c.text};">${sub}</span>
        ${badge}
      </button>`;
    }).join('')}</div>
    ${currentSubject ? '<button type="button" class="scp-clear-btn ghost">このコマを空にする</button>' : ''}
  `;
  mountPopover(anchor, pop);

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
}

function showElementaryPopover(anchor, { level, day, slot, dualPair, singleSubject, formCourses, genCourseId, onChange, yearMonth }){
  closePopover();
  const subjects = SUBJECT_MAP[level] || [];
  const initialA = dualPair?.subjects[0] || '';
  const initialB = dualPair?.subjects[1] || '';
  let pickA = initialA;
  let pickB = initialB;

  const pop = document.createElement('div');
  pop.className = 'student-course-popover student-course-popover-dual';
  pop.setAttribute('role', 'dialog');
  pop.innerHTML = `
    <div class="scp-slot-context">${slotLabel(day, slot)}</div>
    <div class="scp-title">${dualPair || singleSubject ? '教科を変更' : '教科を選択'}</div>
    <p class="scp-hint">通常は<strong>1教科・90分</strong>です。国語と算数を続けて教える生徒だけ、下の「2教科で登録」を使います。</p>
    <div class="scp-section-label">1教科・90分（通常）</div>
    <div class="scp-subjects scp-subjects-compact">${subjects.map(sub=>{
      const c = subjectColor(level, sub);
      const active = singleSubject === sub ? ' scp-subject-active' : '';
      const analysis = analyzeSubjectAtSlot(level, sub, day, slot, yearMonth);
      const badge = renderSubjectPickerBadge(analysis);
      return `<button type="button" class="scp-subject-row${active}" data-single-subject="${sub}">
        <span class="scp-subject-name" style="background:${c.bg};color:${c.text};">${sub}</span>
        ${badge}
      </button>`;
    }).join('')}</div>
    <details class="scp-dual-details">
      <summary class="scp-dual-summary">2教科で登録（45分×2）— 必要な場合のみ</summary>
      <div class="scp-dual-pick">
        <div class="scp-dual-row">
          <span class="scp-dual-label">1教科目</span>
          <div class="scp-dual-chips" data-dual-role="a">${subjects.map(sub=>{
          const c = subjectColor(level, sub);
          return `<button type="button" class="scp-dual-chip" data-subject="${sub}" style="--chip-bg:${c.bg};--chip-fg:${c.text};">${sub}</button>`;
        }).join('')}</div>
        </div>
        <div class="scp-dual-row">
          <span class="scp-dual-label">2教科目</span>
          <div class="scp-dual-chips" data-dual-role="b">${subjects.map(sub=>{
          const c = subjectColor(level, sub);
          return `<button type="button" class="scp-dual-chip" data-subject="${sub}" style="--chip-bg:${c.bg};--chip-fg:${c.text};">${sub}</button>`;
        }).join('')}</div>
        </div>
        <div class="scp-dual-status" id="scpDualStatus"></div>
        <button type="button" class="confirm-btn scp-dual-save" id="scpDualSave" disabled>2教科で登録</button>
      </div>
    </details>
    ${dualPair || singleSubject ? '<button type="button" class="scp-clear-btn ghost">このコマを空にする</button>' : ''}
  `;
  mountPopover(anchor, pop);

  if(dualPair) pop.querySelector('.scp-dual-details')?.setAttribute('open', '');

  const statusEl = pop.querySelector('#scpDualStatus');
  const saveBtn = pop.querySelector('#scpDualSave');

  function syncDualUi(){
    pop.querySelectorAll('[data-dual-role="a"] .scp-dual-chip').forEach(chip=>{
      const sub = chip.dataset.subject;
      chip.classList.toggle('is-selected-a', sub === pickA);
      chip.disabled = !!pickB && sub === pickB;
    });
    pop.querySelectorAll('[data-dual-role="b"] .scp-dual-chip').forEach(chip=>{
      const sub = chip.dataset.subject;
      chip.classList.toggle('is-selected-b', sub === pickB);
      chip.disabled = !!pickA && sub === pickA;
    });
    const valid = pickA && pickB && pickA !== pickB;
    saveBtn.disabled = !valid;
    if(!valid){
      statusEl.innerHTML = pickA && !pickB
        ? '<span class="scp-dual-hint-text">2教科目を選んでください</span>'
        : '';
      return;
    }
    const analysis = analyzeDualSubjectAtSlot(level, pickA, pickB, day, slot, yearMonth);
    statusEl.innerHTML = renderDualSubjectPickerBadge(analysis);
  }

  pop.querySelectorAll('[data-dual-role="a"] .scp-dual-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      pickA = pickA === chip.dataset.subject ? '' : chip.dataset.subject;
      if(pickA === pickB) pickB = '';
      syncDualUi();
    });
  });
  pop.querySelectorAll('[data-dual-role="b"] .scp-dual-chip').forEach(chip=>{
    chip.addEventListener('click', ()=>{
      pickB = pickB === chip.dataset.subject ? '' : chip.dataset.subject;
      if(pickB === pickA) pickA = '';
      syncDualUi();
    });
  });

  saveBtn.addEventListener('click', ()=>{
    if(!pickA || !pickB || pickA === pickB) return;
    assignDualSlotSubjects(formCourses, genCourseId, day, slot, pickA, pickB);
    pruneAndSync(formCourses);
    onChange();
    closePopover();
  });

  pop.querySelectorAll('[data-single-subject]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      assignSlotSubject(formCourses, genCourseId, day, slot, btn.dataset.singleSubject);
      onChange();
      closePopover();
    });
  });

  pop.querySelector('.scp-clear-btn')?.addEventListener('click', ()=>{
    clearSlotSubject(formCourses, day, slot);
    onChange();
    closePopover();
  });

  syncDualUi();
}

export function renderStudentCourseCalendar(container, opts){
  if(!container) return;
  closePopover();

  const { formCourses, level, genCourseId, onChange, courseStartDate } = opts;
  const pickerMonth = resolveCoursePickerYearMonth(courseStartDate);
  const yearMonth = pickerMonth.yearMonth;
  const dualEnabled = supportsDualSubjectSlot(level);

  let tableHtml = '<table class="avail-grid student-course-grid"><thead><tr><th class="slot-h">時間割</th>';
  DAYS.forEach(d=>{ tableHtml += `<th data-day="${d}">${d}</th>`; });
  tableHtml += '</tr></thead><tbody>';

  SLOTS.forEach(slot=>{
    tableHtml += `<tr><th class="slot-h">${slot.label}<br><span class="slot-time">${slot.time}</span></th>`;
    DAYS.forEach(day=>{
      const closed = S.regularClosedDays.includes(day);
      const dualPair = dualEnabled ? findDualPairAtSlot(formCourses, day, slot.id) : null;
      const single = !dualPair ? findSingleOccupant(formCourses, day, slot.id) : null;
      if(closed){
        tableHtml += `<td class="scc-cell scc-closed" data-day="${day}"><span class="scc-closed-label">休</span></td>`;
      }else if(dualPair){
        const badge = cellDualStatusBadgeHtml(level, dualPair.subjects[0], dualPair.subjects[1], day, slot.id, yearMonth);
        tableHtml += `<td class="scc-cell scc-filled scc-dual" data-day="${day}" data-slot="${slot.id}">
          <button type="button" class="scc-slot-btn scc-slot-filled-btn">
            <span class="scc-dual-tags">${renderDualSubjectTags(level, dualPair.subjects)}</span>
            <span class="scc-dual-mode-label">90分・2教科</span>
            ${badge}
          </button>
        </td>`;
      }else if(single){
        const c = subjectColor(level, single.subject);
        const badge = cellStatusBadgeHtml(level, single.subject, day, slot.id, yearMonth);
        tableHtml += `<td class="scc-cell scc-filled" data-day="${day}" data-slot="${slot.id}">
          <button type="button" class="scc-slot-btn scc-slot-filled-btn">
            <span class="scc-subject-name" style="background:${c.bg};color:${c.text};">${single.subject}</span>
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
      <p class="field-hint tight">${coursePickerMonthHint(pickerMonth)}</p>
      <div class="scc-summary">${summaryHtml}</div>
    </div>
  `;

  container.querySelectorAll('.scc-slot-btn').forEach(btn=>{
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      const cell = btn.closest('.scc-cell');
      const day = cell.dataset.day;
      const slot = Number(cell.dataset.slot);
      const dualPair = dualEnabled ? findDualPairAtSlot(formCourses, day, slot) : null;
      const single = !dualPair ? findSingleOccupant(formCourses, day, slot) : null;

      if(dualEnabled){
        showElementaryPopover(btn, {
          level,
          day,
          slot,
          dualPair,
          singleSubject: single?.subject || null,
          formCourses,
          genCourseId,
          onChange,
          yearMonth,
        });
        return;
      }

      showSubjectPopover(btn, {
        level,
        day,
        slot,
        currentSubject: single?.subject || null,
        onPick: subject=>{
          assignSlotSubject(formCourses, genCourseId, day, slot, subject);
          onChange();
        },
        onClear: ()=>{
          clearSlotSubject(formCourses, day, slot);
          onChange();
        },
        yearMonth,
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

export function getSlotDisplayLabel(formCourses, level, day, slot){
  const dualPair = supportsDualSubjectSlot(level) ? findDualPairAtSlot(formCourses, day, slot) : null;
  if(dualPair) return formatDualSubjectLabel(dualPair.subjects);
  const single = findSingleOccupant(formCourses, day, slot);
  return single?.subject || '';
}
