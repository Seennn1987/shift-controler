import { SUBJECT_MAP, DAYS, SLOTS } from '../shared/constants.js';
import { halfLabel, normalizeHalf, shortLessonSubjectAllowed, slotTimeForHalf } from '../shared/lesson-span.js';
import { subjectColor } from './schedule-core.js';
import { S } from './state.js';
import { isOneToOneCourse, oneToOneShareBlockMessage } from './one-to-one.js';
import { showInlineNotice } from '../shared/inline-confirm.js';
import {
  assignDualSlotSubjects,
  clearOverlappingSlots,
  clearSlotAllSubjects,
  findDualPairAtSlot,
  findHalfOccupant,
  findSingleOccupant,
  formatDualSubjectLabel,
  supportsDualSubjectSlot,
} from './dual-subject.js';
import {
  analyzeDualSubjectAtSlot,
  analyzeSubjectAtSlot,
  coursePickerMonthHint,
  countOpenTeachersForLevel,
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

function courseBySubject(formCourses, subject){
  return (formCourses || []).find(c=> c.subject === subject) || null;
}

function oneToOneBadgeHtml(formCourses, subject){
  if(!isOneToOneCourse(courseBySubject(formCourses, subject))) return '';
  return '<span class="match-status-badge is-no-shift">1対1</span>';
}

function setCourseOneToOne(formCourses, subject, on){
  const course = courseBySubject(formCourses, subject);
  if(!course) return { ok: false, msg: '先に教科を選んでください。' };
  if(on){
    const msg = oneToOneShareBlockMessage(S.editingStudentId, course);
    if(msg) return { ok: false, msg };
    course.oneToOne = true;
  }else{
    delete course.oneToOne;
  }
  return { ok: true, msg: '' };
}

function notifyOneToOneBlock(msg){
  if(!msg || msg === '先に教科を選んでください。') return;
  showInlineNotice(document.getElementById('courseList'), msg);
}

function cellStatusBadgeHtml(level, subject, day, slotId, yearMonth, half, oneToOne){
  const analysis = analyzeSubjectAtSlot(level, subject, day, slotId, yearMonth, half, oneToOne);
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

function cellDualStatusBadgeHtml(level, subjectA, subjectB, day, slotId, yearMonth, oneToOne){
  const analysis = analyzeDualSubjectAtSlot(level, subjectA, subjectB, day, slotId, yearMonth, oneToOne);
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

export function assignSlotSubject(formCourses, genCourseId, day, slot, subject, half){
  const h = normalizeHalf(half);
  if(h !== 'full' && !shortLessonSubjectAllowed(subject)) return;
  clearOverlappingSlots(formCourses, day, slot, h);
  let course = formCourses.find(c=> c.subject === subject);
  if(!course){
    course = { id: genCourseId(), subject, weeklyCount: 0, desiredSlots: [] };
    formCourses.push(course);
  }
  const entry = { day, slot };
  if(h !== 'full') entry.half = h;
  if(!course.desiredSlots.some(ds=> ds.day === day && Number(ds.slot) === Number(slot) && normalizeHalf(ds.half) === h)){
    course.desiredSlots.push(entry);
  }
  pruneAndSync(formCourses);
}

export function clearSlotSubject(formCourses, day, slot, half){
  if(half === 'early' || half === 'late'){
    clearOverlappingSlots(formCourses, day, slot, half);
  }else{
    clearSlotAllSubjects(formCourses, day, slot);
  }
  pruneAndSync(formCourses);
}

export { assignDualSlotSubjects } from './dual-subject.js';

export function normalizeFormCoursesForSave(formCourses){
  pruneAndSync(formCourses);
  return formCourses.filter(c=> c.desiredSlots.length > 0).map(c=>{
    const next = { ...c, weeklyCount: c.desiredSlots.length };
    if(next.oneToOne) next.oneToOne = true;
    else delete next.oneToOne;
    return next;
  });
}

/** マスの中だけ短く表示する（保存するデータは正式名のまま） */
function cellSubjectLabel(subject){
  return subject === 'プログラミング' ? 'プログラ' : subject;
}

function halfSlotButtonHtml(level, day, slot, half, yearMonth, occupant, formCourses){
  const time = slotTimeForHalf(slot, half);
  const label = halfLabel(half);
  if(occupant){
    const c = subjectColor(level, occupant.subject);
    const oneToOne = isOneToOneCourse(courseBySubject(formCourses, occupant.subject));
    const badge = cellStatusBadgeHtml(level, occupant.subject, day, slot.id, yearMonth, half, oneToOne);
    return `<button type="button" class="scc-slot-btn scc-slot-filled-btn scc-half-btn" data-half="${half}">
      <span class="scc-dual-mode-label">${label} ${time}</span>
      <span class="scc-subject-name" style="background:${c.bg};color:${c.text};">${cellSubjectLabel(occupant.subject)}</span>
      ${oneToOneBadgeHtml(formCourses, occupant.subject)}
      ${badge}
    </button>`;
  }
  const openCount = countOpenTeachersForLevel(level, day, slot.id, yearMonth, half);
  return `<button type="button" class="scc-slot-btn scc-empty-btn scc-half-btn has-avail" data-half="${half}" aria-label="${label} ${time} を追加">
    <span class="scc-dual-mode-label">${label} ${time}</span>
    <span class="scc-avail-count${openCount === 0 ? ' is-zero' : ''}">＋ 講師${openCount}</span>
  </button>`;
}

function renderDualSubjectTags(level, subjects, formCourses){
  return subjects.map(sub=>{
    const c = subjectColor(level, sub);
    return `<span class="scc-subject-name" style="background:${c.bg};color:${c.text};">${cellSubjectLabel(sub)}</span>${oneToOneBadgeHtml(formCourses, sub)}`;
  }).join('<span class="scc-dual-plus">+</span>');
}

function oneToOneBoxHtml(id){
  return `<div class="scp-one-to-one">
    <label class="chip"><input type="checkbox" id="${id}"><span>この教科は1対1</span></label>
    <p class="scp-hint">教科を入れたあと、ここで1対1にできます。この教科の希望コマ全部が対象で、隣に別の生徒は置きません。</p>
    <p class="form-msg" id="${id}Msg"></p>
  </div>`;
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

function showSubjectPopover(anchor, { level, day, slot, currentSubject, formCourses, onPick, onClear, onChange, yearMonth }){
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
      const oneToOne = isOneToOneCourse(courseBySubject(formCourses, sub));
      const analysis = analyzeSubjectAtSlot(level, sub, day, slot, yearMonth, undefined, oneToOne);
      const badge = renderSubjectPickerBadge(analysis);
      return `<button type="button" class="scp-subject-row${active}" data-subject="${sub}">
        <span class="scp-subject-name" style="background:${c.bg};color:${c.text};">${sub}</span>
        ${badge}
      </button>`;
    }).join('')}</div>
    ${oneToOneBoxHtml('scpOneToOne')}
    ${currentSubject ? '<button type="button" class="scp-clear-btn ghost">このコマを空にする</button>' : ''}
  `;
  mountPopover(anchor, pop);

  const box = pop.querySelector('#scpOneToOne');
  const msg = pop.querySelector('#scpOneToOneMsg');
  const currentCourse = courseBySubject(formCourses, currentSubject);
  box.checked = isOneToOneCourse(currentCourse);
  box.disabled = !currentCourse;
  box.addEventListener('change', ()=>{
    const result = setCourseOneToOne(formCourses, currentSubject, box.checked);
    if(!result.ok){
      box.checked = isOneToOneCourse(courseBySubject(formCourses, currentSubject));
      msg.textContent = result.msg;
      return;
    }
    msg.textContent = '';
    closePopover();
    Promise.resolve(onChange()).then(()=> notifyOneToOneBlock(result.msg));
  });

  pop.querySelectorAll('.scp-subject-row').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      onPick(btn.dataset.subject);
      closePopover();
      onChange();
    });
  });
  pop.querySelector('.scp-clear-btn')?.addEventListener('click', ()=>{
    onClear();
    closePopover();
  });
}

function showElementaryPopover(anchor, { level, day, slot, dualPair, focusHalf, formCourses, genCourseId, onChange, yearMonth }){
  closePopover();
  const subjects = SUBJECT_MAP[level] || [];
  const slotDef = SLOTS.find(s=> s.id === slot);
  const earlyOcc = findHalfOccupant(formCourses, day, slot, 'early');
  const lateOcc = findHalfOccupant(formCourses, day, slot, 'late');
  const fullOcc = findHalfOccupant(formCourses, day, slot, 'full');
  const blocksFull = !!(dualPair || fullOcc || (earlyOcc && lateOcc));
  let mode = dualPair || fullOcc ? 'full' : (focusHalf === 'late' ? 'late' : (focusHalf === 'early' ? 'early' : 'full'));
  const initialA = dualPair?.subjects[0] || '';
  const initialB = dualPair?.subjects[1] || '';
  let pickA = initialA;
  let pickB = initialB;

  const pop = document.createElement('div');
  pop.className = 'student-course-popover student-course-popover-dual';
  pop.setAttribute('role', 'dialog');
  pop.innerHTML = `
    <div class="scp-slot-context">${slotLabel(day, slot)}</div>
    <div class="scp-title">教科を選択</div>
    <p class="scp-hint">小学生は<strong>90分</strong>か、<strong>40分（前半・後半）</strong>を選べます。40分は1教科だけです。</p>
    <div class="scp-duration" role="group" aria-label="授業の長さ">
      <button type="button" class="scp-duration-btn" data-duration="full" ${blocksFull && (earlyOcc || lateOcc) && !fullOcc && !dualPair ? 'disabled' : ''}>90分</button>
      <button type="button" class="scp-duration-btn" data-duration="early">40分・前半</button>
      <button type="button" class="scp-duration-btn" data-duration="late">40分・後半</button>
    </div>
    <p class="scp-hint scp-duration-time" id="scpDurationTime"></p>
    <p class="scp-hint" id="scpFullBlocked" hidden>前半か後半に授業があるため、90分は選べません。</p>
    <div class="scp-section-label" id="scpSingleLabel">1教科</div>
    <div class="scp-subjects scp-subjects-compact" id="scpSingleList"></div>
    ${oneToOneBoxHtml('scpOneToOne')}
    <details class="scp-dual-details">
      <summary class="scp-dual-summary">2教科で登録（90分の中で2教科）— 必要な場合のみ</summary>
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
        <div class="scp-one-to-one">
          <label class="chip"><input type="checkbox" id="scpOneToOneA"><span id="scpOneToOneALabel">1教科目は1対1</span></label>
          <label class="chip"><input type="checkbox" id="scpOneToOneB"><span id="scpOneToOneBLabel">2教科目は1対1</span></label>
          <p class="scp-hint">登録済みの教科だけ、1対1にできます。この教科の希望コマ全部が対象です。</p>
          <p class="form-msg" id="scpDualOneMsg"></p>
        </div>
      </div>
    </details>
    ${(dualPair || fullOcc || earlyOcc || lateOcc) ? '<button type="button" class="scp-clear-btn ghost">この授業を空にする</button>' : ''}
  `;
  mountPopover(anchor, pop);

  const fullBtn = pop.querySelector('[data-duration="full"]');
  const ninetyBlocked = !!(earlyOcc || lateOcc) && !fullOcc && !dualPair;
  if(ninetyBlocked){
    fullBtn.disabled = true;
    if(mode === 'full') mode = focusHalf === 'late' ? 'late' : 'early';
  }
  pop.querySelector('#scpFullBlocked').hidden = !ninetyBlocked;

  const statusEl = pop.querySelector('#scpDualStatus');
  const saveBtn = pop.querySelector('#scpDualSave');
  const singleList = pop.querySelector('#scpSingleList');

  function currentSubject(){
    if(mode === 'early') return earlyOcc?.subject || '';
    if(mode === 'late') return lateOcc?.subject || '';
    return fullOcc?.subject || '';
  }

  function renderSingleList(){
    const list = mode === 'full' ? subjects : subjects.filter(shortLessonSubjectAllowed);
    const selected = currentSubject();
    const half = mode === 'full' ? 'full' : mode;
    singleList.innerHTML = list.map(sub=>{
      const c = subjectColor(level, sub);
      const active = selected === sub ? ' scp-subject-active' : '';
      const oneToOne = isOneToOneCourse(courseBySubject(formCourses, sub));
      const analysis = analyzeSubjectAtSlot(level, sub, day, slot, yearMonth, half, oneToOne);
      const badge = renderSubjectPickerBadge(analysis);
      return `<button type="button" class="scp-subject-row${active}" data-single-subject="${sub}">
        <span class="scp-subject-name" style="background:${c.bg};color:${c.text};">${sub}</span>
        ${badge}
      </button>`;
    }).join('');
    singleList.querySelectorAll('[data-single-subject]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const half = mode === 'full' ? 'full' : mode;
        assignSlotSubject(formCourses, genCourseId, day, slot, btn.dataset.singleSubject, half);
        onChange();
        closePopover();
      });
    });
  }

  function syncDuration(){
    pop.querySelectorAll('.scp-duration-btn').forEach(btn=>{
      btn.classList.toggle('is-selected', btn.dataset.duration === mode);
    });
    const half = mode === 'full' ? 'full' : mode;
    const time = slotTimeForHalf(slotDef, half);
    const name = mode === 'full' ? '90分' : `40分・${halfLabel(mode)}`;
    pop.querySelector('#scpDurationTime').textContent = `${name} ${time}`;
    pop.querySelector('#scpSingleLabel').textContent = mode === 'full' ? '1教科・90分' : `1教科・40分（${halfLabel(mode)}）`;
    const dualDetails = pop.querySelector('.scp-dual-details');
    if(dualDetails) dualDetails.hidden = mode !== 'full';
    const oneBox = pop.querySelector('#scpOneToOne');
    const subject = currentSubject();
    oneBox.disabled = !subject;
    oneBox.checked = isOneToOneCourse(courseBySubject(formCourses, subject));
    renderSingleList();
  }

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
    const pairOne = [pickA, pickB].some(sub=> isOneToOneCourse(courseBySubject(formCourses, sub)));
    const analysis = analyzeDualSubjectAtSlot(level, pickA, pickB, day, slot, yearMonth, pairOne);
    statusEl.innerHTML = renderDualSubjectPickerBadge(analysis);
    const labelA = pop.querySelector('#scpOneToOneALabel');
    const labelB = pop.querySelector('#scpOneToOneBLabel');
    if(labelA) labelA.textContent = pickA ? `${pickA}は1対1` : '1教科目は1対1';
    if(labelB) labelB.textContent = pickB ? `${pickB}は1対1` : '2教科目は1対1';
    const boxA = pop.querySelector('#scpOneToOneA');
    const boxB = pop.querySelector('#scpOneToOneB');
    if(boxA){
      boxA.disabled = !courseBySubject(formCourses, pickA);
      boxA.checked = isOneToOneCourse(courseBySubject(formCourses, pickA));
    }
    if(boxB){
      boxB.disabled = !courseBySubject(formCourses, pickB);
      boxB.checked = isOneToOneCourse(courseBySubject(formCourses, pickB));
    }
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

  pop.querySelectorAll('.scp-duration-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      if(btn.disabled) return;
      mode = btn.dataset.duration;
      syncDuration();
    });
  });

  pop.querySelector('.scp-clear-btn')?.addEventListener('click', ()=>{
    if(mode === 'early' || mode === 'late') clearSlotSubject(formCourses, day, slot, mode);
    else clearSlotSubject(formCourses, day, slot);
    onChange();
    closePopover();
  });

  if(dualPair && mode === 'full') pop.querySelector('.scp-dual-details')?.setAttribute('open', '');
  const oneBox = pop.querySelector('#scpOneToOne');
  const oneMsg = pop.querySelector('#scpOneToOneMsg');
  oneBox.addEventListener('change', ()=>{
    const result = setCourseOneToOne(formCourses, currentSubject(), oneBox.checked);
    if(!result.ok){
      oneBox.checked = isOneToOneCourse(courseBySubject(formCourses, currentSubject()));
      oneMsg.textContent = result.msg;
      return;
    }
    oneMsg.textContent = '';
    closePopover();
    Promise.resolve(onChange()).then(()=> notifyOneToOneBlock(result.msg));
  });
  const dualMsg = pop.querySelector('#scpDualOneMsg');
  [['#scpOneToOneA', ()=> pickA], ['#scpOneToOneB', ()=> pickB]].forEach(([sel, subjectOf])=>{
    const box = pop.querySelector(sel);
    box.checked = isOneToOneCourse(courseBySubject(formCourses, subjectOf()));
    box.addEventListener('change', ()=>{
      const subject = subjectOf();
      const result = setCourseOneToOne(formCourses, subject, box.checked);
      if(!result.ok){
        box.checked = isOneToOneCourse(courseBySubject(formCourses, subject));
        dualMsg.textContent = result.msg;
        return;
      }
      dualMsg.textContent = '';
      closePopover();
      Promise.resolve(onChange()).then(()=> notifyOneToOneBlock(result.msg));
    });
  });
  syncDualUi();
  syncDuration();
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
      const fullOcc = dualEnabled && !dualPair ? findHalfOccupant(formCourses, day, slot.id, 'full') : null;
      const earlyOcc = dualEnabled && !dualPair && !fullOcc ? findHalfOccupant(formCourses, day, slot.id, 'early') : null;
      const lateOcc = dualEnabled && !dualPair && !fullOcc ? findHalfOccupant(formCourses, day, slot.id, 'late') : null;
      const single = !dualPair && !dualEnabled ? findSingleOccupant(formCourses, day, slot.id) : fullOcc;
      if(closed){
        tableHtml += `<td class="scc-cell scc-closed" data-day="${day}"><span class="scc-closed-label">休</span></td>`;
      }else if(dualEnabled && !dualPair && !fullOcc){
        tableHtml += `<td class="scc-cell scc-split" data-day="${day}" data-slot="${slot.id}">
          <div class="scc-half-stack">
            ${halfSlotButtonHtml(level, day, slot, 'early', yearMonth, earlyOcc, formCourses)}
            ${halfSlotButtonHtml(level, day, slot, 'late', yearMonth, lateOcc, formCourses)}
          </div>
        </td>`;
      }else if(dualPair){
        const pairOne = dualPair.subjects.some(sub=> isOneToOneCourse(courseBySubject(formCourses, sub)));
        const badge = cellDualStatusBadgeHtml(level, dualPair.subjects[0], dualPair.subjects[1], day, slot.id, yearMonth, pairOne);
        tableHtml += `<td class="scc-cell scc-filled scc-dual" data-day="${day}" data-slot="${slot.id}">
          <button type="button" class="scc-slot-btn scc-slot-filled-btn">
            <span class="scc-dual-tags">${renderDualSubjectTags(level, dualPair.subjects, formCourses)}</span>
            <span class="scc-dual-mode-label">90分・2教科</span>
            ${badge}
          </button>
        </td>`;
      }else if(single){
        const c = subjectColor(level, single.subject);
        const oneToOne = isOneToOneCourse(courseBySubject(formCourses, single.subject));
        const badge = cellStatusBadgeHtml(level, single.subject, day, slot.id, yearMonth, undefined, oneToOne);
        const modeLabel = dualEnabled ? '<span class="scc-dual-mode-label">90分</span>' : '';
        tableHtml += `<td class="scc-cell scc-filled" data-day="${day}" data-slot="${slot.id}">
          <button type="button" class="scc-slot-btn scc-slot-filled-btn" data-half="full">
            ${modeLabel}
            <span class="scc-subject-name" style="background:${c.bg};color:${c.text};">${cellSubjectLabel(single.subject)}</span>
            ${oneToOneBadgeHtml(formCourses, single.subject)}
            ${badge}
          </button>
        </td>`;
      }else{
        const openCount = countOpenTeachersForLevel(level, day, slot.id, yearMonth);
        tableHtml += `<td class="scc-cell scc-empty" data-day="${day}" data-slot="${slot.id}">
          <button type="button" class="scc-slot-btn scc-empty-btn has-avail" aria-label="教科を追加（講師${openCount}人）">＋<span class="scc-avail-count${openCount === 0 ? ' is-zero' : ''}">講師${openCount}</span></button>
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
      const one = c.oneToOne ? ' 1対1' : '';
      return `<span class="scc-summary-tag" style="background:${col.bg};color:${col.text};">${c.subject}${one} 週${c.desiredSlots.length}コマ</span>`;
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
          focusHalf: btn.dataset.half || null,
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
        formCourses,
        onChange,
        onPick: subject=>{
          assignSlotSubject(formCourses, genCourseId, day, slot, subject);
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
