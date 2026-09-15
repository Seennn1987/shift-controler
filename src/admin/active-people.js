import { getTodayStr } from '../shared/date-utils.js';
import { S } from './state.js';

function escapeHtml(value){
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function isActivePerson(person){
  return !!(person && !person.left);
}

export function activeStudents(students = S.students){
  return (students || []).filter(isActivePerson);
}

export function activeTeachers(teachers = S.teachers){
  return (teachers || []).filter(isActivePerson);
}

/** 退会・退社日以降は、授業の記録として扱わない */
export function personAppliesOnDate(person, dateStr){
  if(!person || !person.left) return true;
  if(typeof person.leftDate !== 'string') return false;
  if(typeof dateStr !== 'string') return false;
  return dateStr < person.leftDate;
}

export function markPersonLeft(person, left){
  if(!person) return;
  if(left){
    person.left = true;
    person.leftDate = person.leftDate || getTodayStr();
  }else{
    delete person.left;
    delete person.leftDate;
  }
}

export function renderLeaveFlash(host, flash){
  if(!host) return;
  host.innerHTML = '';
  if(!flash) return;
  if(flash.restoreLabel){
    host.innerHTML = `
      <div class="matching-panel-result-msg ok">
        <div class="matching-panel-flash-main">${escapeHtml(flash.message)}</div>
        <div class="matching-panel-flash-followup">
          <span class="matching-panel-flash-followup-text">押し間違えたときは、すぐ戻せます。</span>
          <div class="matching-panel-flash-followup-actions">
            <button type="button" class="ghost matching-panel-flash-btn" data-action="restore">${escapeHtml(flash.restoreLabel)}</button>
            <button type="button" class="matching-panel-flash-dismiss" data-action="dismiss">閉じる</button>
          </div>
        </div>
      </div>
    `;
    host.querySelector('[data-action=restore]')?.addEventListener('click', flash.onRestore);
    host.querySelector('[data-action=dismiss]')?.addEventListener('click', flash.onDismiss);
    return;
  }
  host.innerHTML = `<div class="matching-panel-result-msg ok">${escapeHtml(flash.message)}</div>`;
}

export function syncHideButton(btn, on){
  if(!btn) return;
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.classList.toggle('is-active-filter', on);
}
