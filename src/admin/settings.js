import { SUBJECT_MAP, DAYS, SLOTS, WEEKDAY_JP, WEEK_FULL } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr, getTodayStr } from '../shared/date-utils.js';
import { firebaseConfig, fbAuth, fbDb, STORAGE_KEY, getSecondaryAuth, S } from './state.js';
import { renderCalendar } from './calendar.js';
import { renderMatrix } from './finance-ui.js';
import { renderMatching } from './matching.js';
import { scheduleSave, scheduleSyncClosureSettings } from './students-persistence.js';
import { MATCHING_FACTOR_META, normalizeMatchingPriority } from './matching-config.js';

// ---- 優先ペアリング（教室長が指定：生徒の教科(コース)単位で講師を優先） ----

// ---- 季節講習（春期・夏期・冬期など。通常授業は常に開校期間なのでここには登録しない） ----

function addOrUpdateTerm(term){
  if(S.editingTermId){
    const idx = S.terms.findIndex(t=>t.id===S.editingTermId);
    if(idx>-1) S.terms[idx] = {...term, id:S.editingTermId};
  }else{
    S.terms.push({...term, id:'term-'+Date.now()+'-'+Math.random().toString(36).slice(2,6)});
  }
}
function deleteTerm(id){
  S.terms = S.terms.filter(t=>t.id!==id);
}
function resetTermForm(){
  S.editingTermId = null;
  document.getElementById('termTypeSelect').value = '春期講習';
  document.getElementById('termNameInput').value = '';
  document.getElementById('termStartInput').value = '';
  document.getElementById('termEndInput').value = '';
  document.getElementById('termSaveBtn').textContent = '追加する';
  document.getElementById('termCancelBtn').style.display = 'none';
  document.getElementById('termFormMsg').textContent = '';
}
function fillTermFormForEdit(term){
  S.editingTermId = term.id;
  document.getElementById('termTypeSelect').value = term.type;
  document.getElementById('termNameInput').value = term.name;
  document.getElementById('termStartInput').value = term.startDate;
  document.getElementById('termEndInput').value = term.endDate;
  document.getElementById('termSaveBtn').textContent = '更新する';
  document.getElementById('termCancelBtn').style.display = 'inline-block';
  document.getElementById('termFormMsg').textContent = '';
}
function handleTermSave(){
  const msg = document.getElementById('termFormMsg');
  const type = document.getElementById('termTypeSelect').value;
  const name = document.getElementById('termNameInput').value.trim();
  const startDate = document.getElementById('termStartInput').value;
  const endDate = document.getElementById('termEndInput').value;

  if(!name){ msg.textContent = '名称を入力してください。'; return; }
  if(!startDate || !endDate){ msg.textContent = '開始日・終了日を両方入力してください。'; return; }
  if(startDate > endDate){ msg.textContent = '終了日は開始日より後の日付にしてください。'; return; }

  addOrUpdateTerm({type, name, startDate, endDate});
  resetTermForm();
  renderTermList();
  renderClosedDaySettings();
  renderCalendar();
}
function renderTermList(){
  scheduleSave();
  const wrap = document.getElementById('termList');
  if(!wrap) return;
  if(S.terms.length===0){
    wrap.innerHTML = '<div class="empty-note">まだ季節講習が登録されていません。上のフォームから登録してください。</div>';
    return;
  }
  const sorted = [...S.terms].sort((a,b)=> a.startDate < b.startDate ? -1 : 1);
  wrap.innerHTML = sorted.map(t=>{
    return `<div class="term-row">
      <span class="term-type season">${t.type}</span>
      <span class="term-name">${t.name}</span>
      <span class="term-range">${t.startDate} 〜 ${t.endDate}</span>
      <div class="row-actions">
        <button class="edit-btn" data-id="${t.id}">編集</button>
        <button class="del-btn" data-id="${t.id}">削除</button>
      </div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.edit-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      const t = S.terms.find(x=>x.id===b.dataset.id);
      if(t) fillTermFormForEdit(t);
    });
  });
  wrap.querySelectorAll('.del-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(b.dataset.confirming){
        deleteTerm(b.dataset.id);
        if(S.editingTermId===b.dataset.id) resetTermForm();
        renderTermList();
        renderClosedDaySettings();
        renderCalendar();
      }else{
        b.dataset.confirming = '1';
        b.textContent = '本当に削除しますか？';
        setTimeout(()=>{ b.dataset.confirming=''; b.textContent='削除'; }, 3000);
      }
    });
  });
}

// ---- 休校日設定（曜日定休日＋祝日自動判定） ----


// 内閣府発表データに含まれる祝日の一覧（表示用。通常授業は常に開校期間のため、期間による絞り込みは行わない）
function computeHolidaysInTerms(){
  return HOLIDAYS_JP.slice().sort((a,b)=> a.date<b.date?-1:1);
}

function renderClosedDaySettings(){
  scheduleSave();
  scheduleSyncClosureSettings();
  // 曜日チェックボックスの状態を反映
  document.querySelectorAll('.closed-day-checkbox').forEach(cb=>{
    cb.checked = S.regularClosedDays.includes(cb.dataset.day);
  });
  document.getElementById('holidayAutoDetectToggle').checked = S.holidayAutoDetect;

  const wrap = document.getElementById('holidayListWrap');
  if(!wrap) return;
  if(!S.holidayAutoDetect){
    wrap.innerHTML = '<div class="empty-note">「祝日をまとめて休校にする」をONにすると、祝日が一覧表示されます。</div>';
    return;
  }
  const holidays = computeHolidaysInTerms();
  if(holidays.length===0){
    wrap.innerHTML = '<div class="empty-note">祝日データが見つかりませんでした。</div>';
    return;
  }
  wrap.innerHTML = holidays.map(h=>`<div class="holiday-row">
      <span class="holiday-date">${h.date}</span>
      <span class="holiday-name">${h.name}</span>
      <span class="holiday-status-badge">休校</span>
    </div>`).join('');
}

// 登録フォームの曜日グリッド（講師・生徒）に定休日の視覚的な警告をつける（入力はブロックしない）
function applyClosedDayStyling(){
  document.querySelectorAll('th[data-day], td[data-day]').forEach(el=>{
    el.classList.toggle('closed-day-tint', S.regularClosedDays.includes(el.dataset.day));
  });
}

function buildClosedDayArea(){
  const area = document.getElementById('closedDayArea');
  if(!area) return;
  area.innerHTML = WEEK_FULL.map(d=>{
    const id = `closedday-${d}`;
    return `<label class="chip">
      <input type="checkbox" class="closed-day-checkbox" id="${id}" data-day="${d}" ${S.regularClosedDays.includes(d)?'checked':''}>
      <span>${d}曜日</span>
    </label>`;
  }).join('');
  area.querySelectorAll('.closed-day-checkbox').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      if(cb.checked){
        if(!S.regularClosedDays.includes(cb.dataset.day)) S.regularClosedDays.push(cb.dataset.day);
      }else{
        S.regularClosedDays = S.regularClosedDays.filter(d=>d!==cb.dataset.day);
      }
      applyClosedDayStyling();
      renderMatrix();
      renderMatching();
      renderCalendar();
    });
  });
}

// ---- 個別の休校日（1日〜期間指定、曜日・祝日とは別枠） ----
function addOrUpdateClosure(closure){
  if(S.editingClosureId){
    const idx = S.customClosures.findIndex(c=>c.id===S.editingClosureId);
    if(idx>-1) S.customClosures[idx] = {...closure, id:S.editingClosureId};
  }else{
    S.customClosures.push({...closure, id:'closure-'+Date.now()+'-'+Math.random().toString(36).slice(2,6)});
  }
}
function deleteClosure(id){
  S.customClosures = S.customClosures.filter(c=>c.id!==id);
}
function resetClosureForm(){
  S.editingClosureId = null;
  document.getElementById('closureLabelInput').value = '';
  document.getElementById('closureStartInput').value = '';
  document.getElementById('closureEndInput').value = '';
  document.getElementById('closureSaveBtn').textContent = '追加する';
  document.getElementById('closureCancelBtn').style.display = 'none';
  document.getElementById('closureFormMsg').textContent = '';
}
function fillClosureFormForEdit(c){
  S.editingClosureId = c.id;
  document.getElementById('closureLabelInput').value = c.label;
  document.getElementById('closureStartInput').value = c.startDate;
  document.getElementById('closureEndInput').value = c.endDate;
  document.getElementById('closureSaveBtn').textContent = '更新する';
  document.getElementById('closureCancelBtn').style.display = 'inline-block';
  document.getElementById('closureFormMsg').textContent = '';
}
function handleClosureSave(){
  const msg = document.getElementById('closureFormMsg');
  const label = document.getElementById('closureLabelInput').value.trim();
  const startDate = document.getElementById('closureStartInput').value;
  let endDate = document.getElementById('closureEndInput').value;
  if(!startDate){ msg.textContent = '開始日を入力してください（1日だけの場合も開始日は必須です）。'; return; }
  if(!endDate) endDate = startDate; // 終了日未入力なら1日だけの休校として扱う
  if(startDate > endDate){ msg.textContent = '終了日は開始日と同じか、それより後の日付にしてください。'; return; }

  addOrUpdateClosure({label: label || '休校日', startDate, endDate});
  resetClosureForm();
  renderClosureList();
  renderCalendar();
}
function renderClosureList(){
  scheduleSave();
  scheduleSyncClosureSettings();
  const wrap = document.getElementById('closureList');
  if(!wrap) return;
  if(S.customClosures.length===0){
    wrap.innerHTML = '<div class="empty-note">個別の休校日はまだ登録されていません。</div>';
    return;
  }
  const sorted = [...S.customClosures].sort((a,b)=> a.startDate<b.startDate?-1:1);
  wrap.innerHTML = sorted.map(c=>{
    const range = c.startDate===c.endDate ? c.startDate : `${c.startDate} 〜 ${c.endDate}`;
    return `<div class="term-row">
      <span class="term-type season">個別休校</span>
      <span class="term-name">${c.label}</span>
      <span class="term-range">${range}</span>
      <div class="row-actions">
        <button class="edit-btn" data-id="${c.id}">編集</button>
        <button class="del-btn" data-id="${c.id}">削除</button>
      </div>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.edit-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      const c = S.customClosures.find(x=>x.id===b.dataset.id);
      if(c) fillClosureFormForEdit(c);
    });
  });
  wrap.querySelectorAll('.del-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      if(b.dataset.confirming){
        deleteClosure(b.dataset.id);
        if(S.editingClosureId===b.dataset.id) resetClosureForm();
        renderClosureList();
        renderCalendar();
      }else{
        b.dataset.confirming = '1';
        b.textContent = '本当に削除しますか？';
        setTimeout(()=>{ b.dataset.confirming=''; b.textContent='削除'; }, 3000);
      }
    });
  });
}

const MATCHING_PRIORITY_MOVE_UP_SVG = '<svg class="matching-priority-move-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>';
const MATCHING_PRIORITY_MOVE_DOWN_SVG = '<svg class="matching-priority-move-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>';

function renderMatchingPrioritySettings(){
  const wrap = document.getElementById('matchingPriorityList');
  if(!wrap) return;
  S.matchingPriority = normalizeMatchingPriority(S.matchingPriority);
  wrap.innerHTML = S.matchingPriority.map((item, idx)=>{
    const meta = MATCHING_FACTOR_META[item.id];
    const title = meta?.title || meta?.label || item.id;
    const description = meta?.description || '';
    const rowClass = item.enabled ? '' : ' is-disabled';
    const num = item.enabled ? String(idx + 1) : '—';
    const upDisabled = idx === 0 || !item.enabled;
    const downDisabled = idx === S.matchingPriority.length - 1 || !item.enabled;
    return `<div class="matching-priority-row${rowClass}" data-id="${item.id}">
      <span class="matching-priority-num" aria-hidden="true">${num}</span>
      <label class="matching-priority-main">
        <input type="checkbox" class="matching-priority-enabled" data-id="${item.id}" ${item.enabled ? 'checked' : ''} aria-label="この条件を使う">
        <span class="matching-priority-text">
          <span class="matching-priority-title">${title}</span>
          ${description ? `<span class="matching-priority-desc">${description}</span>` : ''}
        </span>
      </label>
      <div class="matching-priority-actions">
        <button type="button" class="matching-priority-move matching-priority-up" data-id="${item.id}" ${upDisabled ? 'disabled' : ''} aria-label="上へ">${MATCHING_PRIORITY_MOVE_UP_SVG}<span class="matching-priority-move-text">上へ</span></button>
        <button type="button" class="matching-priority-move matching-priority-down" data-id="${item.id}" ${downDisabled ? 'disabled' : ''} aria-label="下へ">${MATCHING_PRIORITY_MOVE_DOWN_SVG}<span class="matching-priority-move-text">下へ</span></button>
      </div>
    </div>`;
  }).join('');

  wrap.querySelectorAll('.matching-priority-enabled').forEach(input=>{
    input.addEventListener('change', ()=>{
      const row = S.matchingPriority.find(r=> r.id === input.dataset.id);
      if(!row) return;
      row.enabled = input.checked;
      scheduleSave();
      renderMatchingPrioritySettings();
      renderMatching();
      if(S.matchingPanelOpen && S.matchingPanelStudentId){
        document.dispatchEvent(new CustomEvent('matching:refresh-panel'));
      }
    });
  });
  wrap.querySelectorAll('.matching-priority-up').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = S.matchingPriority.findIndex(r=> r.id === btn.dataset.id);
      if(idx <= 0) return;
      const tmp = S.matchingPriority[idx - 1];
      S.matchingPriority[idx - 1] = S.matchingPriority[idx];
      S.matchingPriority[idx] = tmp;
      scheduleSave();
      renderMatchingPrioritySettings();
      renderMatching();
      if(S.matchingPanelOpen && S.matchingPanelStudentId){
        document.dispatchEvent(new CustomEvent('matching:refresh-panel'));
      }
    });
  });
  wrap.querySelectorAll('.matching-priority-down').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = S.matchingPriority.findIndex(r=> r.id === btn.dataset.id);
      if(idx < 0 || idx >= S.matchingPriority.length - 1) return;
      const tmp = S.matchingPriority[idx + 1];
      S.matchingPriority[idx + 1] = S.matchingPriority[idx];
      S.matchingPriority[idx] = tmp;
      scheduleSave();
      renderMatchingPrioritySettings();
      renderMatching();
      if(S.matchingPanelOpen && S.matchingPanelStudentId){
        document.dispatchEvent(new CustomEvent('matching:refresh-panel'));
      }
    });
  });
}

function initMatchingPrioritySettings(){
  if(!S.matchingPriority) S.matchingPriority = normalizeMatchingPriority(null);
  renderMatchingPrioritySettings();
}

// =====================================================================

export { addOrUpdateTerm, deleteTerm, resetTermForm, fillTermFormForEdit, handleTermSave, renderTermList, computeHolidaysInTerms, renderClosedDaySettings, applyClosedDayStyling, buildClosedDayArea, addOrUpdateClosure, deleteClosure, resetClosureForm, fillClosureFormForEdit, handleClosureSave, renderClosureList, renderMatchingPrioritySettings, initMatchingPrioritySettings };
