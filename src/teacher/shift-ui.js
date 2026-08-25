import { pad2 } from '../shared/date-utils.js';
import { fbAuth, fbDb, S } from './state.js';
import { cellKey } from './schedule-utils.js';
import { saveMonthEntry } from './schedule.js';

/** 左から ○優先 → △可能 → ×不可（右端が×） */
export const SHIFT_PICK_OPTIONS = [
  { key: 'preferred', sym: '○', label: '優先' },
  { key: 'normal', sym: '△', label: '可能' },
  { key: 'none', sym: '×', label: '不可' },
];

function getMonthEntry(yearMonth){
  const existing = S.scheduleDoc.months && S.scheduleDoc.months[yearMonth];
  if(existing){
    if(!existing.id) existing.id = `tsch-${S.myTeacherId}-${yearMonth}`;
    return existing;
  }
  return { id: `tsch-${S.myTeacherId}-${yearMonth}`, status: 'draft', days: {} };
}

function baselineState(entry, dateStr, slot){
  const req = S.pendingRequests.find(r=> r.dateStr === dateStr && r.slot === slot);
  if(req) return req.priority;
  const cur = (entry.days[dateStr] || []).find(e=> e.slot === slot);
  return cur ? cur.priority : 'none';
}

function effectiveState(entry, dateStr, slot){
  const key = cellKey(dateStr, slot);
  if(Object.prototype.hasOwnProperty.call(S.localOverrides, key)) return S.localOverrides[key];
  return baselineState(entry, dateStr, slot);
}

function hasLocalShiftChange(dateStr, slotId){
  return Object.prototype.hasOwnProperty.call(S.localOverrides, cellKey(dateStr, slotId));
}

function buildShiftPickGroupHtml(dateStr, slotId, entry){
  const slotNum = Number(slotId);
  const state = effectiveState(entry, dateStr, slotNum);
  const key = cellKey(dateStr, slotNum);
  const isDirty = Object.prototype.hasOwnProperty.call(S.localOverrides, key);
  const isRequested = !isDirty && S.pendingRequests.some(r=> r.dateStr === dateStr && r.slot === slotNum);

  const buttons = SHIFT_PICK_OPTIONS.map(opt=> `
    <button type="button" class="shift-pick-btn${state === opt.key ? ' is-active' : ''}"
      data-shift-date="${dateStr}" data-shift-slot="${slotNum}" data-priority="${opt.key}"
      aria-pressed="${state === opt.key}">
      <span class="shift-pick-symbol">${opt.sym}</span>
      <span class="shift-pick-label">${opt.label}</span>
    </button>
  `).join('');

  const reqBadge = isRequested ? '<span class="shift-req-badge">シフト変更承認待ち</span>' : '';

  return `<div class="shift-pick-group shift-pick-s4" role="group" aria-label="${slotNum}講の出勤希望">
    ${reqBadge}
    ${buttons}
  </div>`;
}

function updateShiftDockBadges(isSubmitted, changeCount){
  const wrap = document.getElementById('shiftDockBadges');
  if(!wrap) return;
  if(!isSubmitted){
    wrap.innerHTML = '<span class="status-badge draft">未提出</span>';
    return;
  }
  const badges = ['<span class="status-badge submitted">提出済</span>'];
  if(changeCount > 0) badges.push('<span class="status-badge change">シフト変更送信前</span>');
  wrap.innerHTML = badges.join('');
}

function updateShiftFormState(){
  const submitBtn = document.getElementById('submitShiftBtn');
  const sendBtn = document.getElementById('sendRequestBtn');
  if(!submitBtn || !sendBtn || S.curYear == null || S.curMonth == null) return;
  const yearMonth = `${S.curYear}-${pad2(S.curMonth + 1)}`;
  const entry = getMonthEntry(yearMonth);
  const isSubmitted = entry.status === 'submitted';
  const changeCount = Object.keys(S.localOverrides).length;

  updateShiftDockBadges(isSubmitted, changeCount);

  submitBtn.style.display = isSubmitted ? 'none' : '';
  if(isSubmitted){
    sendBtn.style.display = changeCount > 0 ? '' : 'none';
    sendBtn.textContent = `シフト変更を提出する（${changeCount}件）`;
    sendBtn.disabled = changeCount === 0;
  }else{
    sendBtn.style.display = 'none';
    sendBtn.disabled = false;
  }
}

async function handleShiftPickSelect(dateStr, slotId, priority){
  const yearMonth = dateStr.slice(0, 7);
  const entry = getMonthEntry(yearMonth);
  const isSubmitted = entry.status === 'submitted';
  const slot = Number(slotId);
  const key = cellKey(dateStr, slot);

  if(isSubmitted){
    const base = baselineState(entry, dateStr, slot);
    if(priority === base) delete S.localOverrides[key];
    else S.localOverrides[key] = priority;
    return { rerender: true };
  }

  entry.days[dateStr] = entry.days[dateStr] || [];
  entry.days[dateStr] = entry.days[dateStr].filter(e=> e.slot !== slot);
  if(priority !== 'none') entry.days[dateStr].push({ slot, priority });
  entry.submittedBy = 'teacher';
  await saveMonthEntry(yearMonth, entry);
  return { rerender: true };
}

async function submitShiftMonth(){
  const yearMonth = `${S.curYear}-${pad2(S.curMonth + 1)}`;
  const entry = getMonthEntry(yearMonth);
  entry.status = 'submitted';
  entry.submittedBy = 'teacher';
  const msg = document.getElementById('formMsg');
  if(msg) msg.textContent = '提出中…';
  await saveMonthEntry(yearMonth, entry);
  if(msg) msg.textContent = '✓ シフトを提出しました。';
  return { rerender: true };
}

async function sendPendingChanges(){
  const yearMonth = `${S.curYear}-${pad2(S.curMonth + 1)}`;
  const entry = getMonthEntry(yearMonth);
  const msg = document.getElementById('formMsg');
  const keys = Object.keys(S.localOverrides);
  if(keys.length === 0) return { rerender: false };
  if(msg) msg.textContent = '送信中…';
  try{
    for(const key of keys){
      const [dateStr, slotStr] = key.split('|');
      const slot = Number(slotStr);
      const priority = S.localOverrides[key];
      const existingReq = S.pendingRequests.find(r=> r.dateStr === dateStr && r.slot === slot);
      if(existingReq){
        await fbDb.collection('scheduleChangeRequests').doc(existingReq.id).update({ priority });
        existingReq.priority = priority;
      }else{
        const docRef = await fbDb.collection('scheduleChangeRequests').add({
          adminUid: S.myAdminUid,
          teacherId: S.myTeacherId,
          teacherLoginUid: fbAuth.currentUser.uid,
          dateStr, slot, priority, status: 'pending',
          submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        S.pendingRequests.push({ id: docRef.id, dateStr, slot, priority, status: 'pending' });
      }
    }
    S.localOverrides = {};
    if(msg) msg.textContent = `✓ ${keys.length}件のシフト変更を提出しました。教室長の承認をお待ちください。`;
    return { rerender: true };
  }catch(err){
    console.error('変更リクエストエラー:', err);
    if(msg) msg.textContent = 'リクエストの送信に失敗しました。通信状況をご確認ください。';
    return { rerender: false };
  }
}

function clearShiftLocalOverrides(){
  S.localOverrides = {};
}

export {
  getMonthEntry,
  baselineState,
  effectiveState,
  hasLocalShiftChange,
  buildShiftPickGroupHtml,
  handleShiftPickSelect,
  updateShiftFormState,
  submitShiftMonth,
  sendPendingChanges,
  clearShiftLocalOverrides,
};

/** @deprecated 互換: schedule ポーリング後に calendar 側で再描画 */
export function renderKeepingOverrides(){
  updateShiftFormState();
}
