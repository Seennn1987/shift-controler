import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr } from '../shared/date-utils.js';
import { fbAuth, fbDb, S } from './state.js';
import { cycleState,labelFor,cellKey } from './schedule-utils.js';
import { saveMonthEntry } from './schedule.js';

function getMonthEntry(yearMonth){
  const existing = S.scheduleDoc.months && S.scheduleDoc.months[yearMonth];
  if(existing){
    if(!existing.id) existing.id = `tsch-${S.myTeacherId}-${yearMonth}`; // 過去データにidが無い場合の補完
    return existing;
  }
  return {id: `tsch-${S.myTeacherId}-${yearMonth}`, status:'draft', days:{}};
}

// 月を切り替えた時に呼ぶ（未送信の下書きをリセットする）
function render(){
  S.localOverrides = {};
  renderKeepingOverrides();
}
// Firestoreのリアルタイム更新を受けて再描画する時に呼ぶ（未送信の下書きは保持する）
function renderKeepingOverrides(){
  const yearMonth = `${S.curYear}-${pad2(S.curMonth+1)}`;
  document.getElementById('monthTitle').textContent = `${S.curYear}年${S.curMonth+1}月`;
  const entry = getMonthEntry(yearMonth);
  const isSubmitted = entry.status==='submitted';

  const adminNote = entry.submittedBy==='admin' ? '（教室長が代理入力した内容です。内容をご確認ください）' : '';
  document.getElementById('statusBar').innerHTML = isSubmitted
    ? `<span class="status-badge submitted">確定</span><span>この月は提出済みです${adminNote}。セルをクリックして変更内容を選び、最後に「変更をリクエストする」を押すとまとめて教室長に届きます（押すまでは送信されません）。</span>`
    : `<span class="status-badge draft">未提出</span><span>セルをクリックして入力し「この内容で提出する」を押してください${adminNote}。</span>`;

  const total = daysInYearMonth(yearMonth);
  let thead = '<thead><tr><th>日付</th>' + SLOTS.map(s=>`<th>${s.label}</th>`).join('') + '</tr></thead>';
  let tbody = '<tbody>';
  for(let d=1; d<=total; d++){
    const dateStr = `${yearMonth}-${pad2(d)}`;
    const wd = WEEKDAY_JP[new Date(dateStr+'T00:00:00').getDay()];
    tbody += `<tr><th>${d}日（${wd}）</th>`;
    SLOTS.forEach(slot=>{
      tbody += `<td>${buildCellHtml(entry, dateStr, slot.id)}</td>`;
    });
    tbody += '</tr>';
  }
  tbody += '</tbody>';
  document.getElementById('gridWrap').innerHTML = `<table class="grid">${thead}${tbody}</table>`;

  document.querySelectorAll('.cell-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> handleCellClick(btn, entry, isSubmitted, yearMonth));
  });
  updateSendButtonState();
}

// そのセルの「確定値（または既存の申請中の値）」を基準値として返す
function baselineState(entry, dateStr, slot){
  const req = S.pendingRequests.find(r=>r.dateStr===dateStr && r.slot===slot);
  if(req) return req.priority;
  const cur = (entry.days[dateStr]||[]).find(e=>e.slot===slot);
  return cur ? cur.priority : 'none';
}
// 表示に使う実際の状態（下書きがあればそれを優先）
function effectiveState(entry, dateStr, slot){
  const key = cellKey(dateStr, slot);
  if(S.localOverrides.hasOwnProperty(key)) return S.localOverrides[key];
  return baselineState(entry, dateStr, slot);
}
function buildCellHtml(entry, dateStr, slotId){
  const key = cellKey(dateStr, slotId);
  const state = effectiveState(entry, dateStr, slotId);
  const isDirty = S.localOverrides.hasOwnProperty(key);
  const isRequested = !isDirty && S.pendingRequests.some(r=>r.dateStr===dateStr && r.slot===slotId);
  let cls = `cell-btn st-${state}`;
  let badge = '';
  if(isDirty){ cls += ' pending-local'; badge = '<span class="local-badge">未送信</span>'; }
  else if(isRequested){ cls += ' requested'; badge = '<span class="req-badge">申請中</span>'; }
  return `<button type="button" class="${cls}" data-date="${dateStr}" data-slot="${slotId}">${labelFor(state)}${badge}</button>`;
}

async function handleCellClick(btn, entry, isSubmitted, yearMonth){
  const dateStr = btn.dataset.date;
  const slot = Number(btn.dataset.slot);

  if(!isSubmitted){
    // 未提出の月：今まで通り、直接編集してその都度保存する
    const cur = (entry.days[dateStr]||[]).find(e=>e.slot===slot);
    const curState = cur ? cur.priority : 'none';
    const next = cycleState(curState);
    entry.days[dateStr] = entry.days[dateStr] || [];
    entry.days[dateStr] = entry.days[dateStr].filter(e=>e.slot!==slot);
    if(next!=='none') entry.days[dateStr].push({slot, priority:next});
    entry.submittedBy = 'teacher'; // 講師本人が触ったことを記録
    btn.className = `cell-btn st-${next}`;
    btn.innerHTML = labelFor(next);
    await saveMonthEntry(yearMonth, entry);
    return;
  }

  // 提出済みの月：クリックしても即送信せず、画面上の下書きだけを進める
  const key = cellKey(dateStr, slot);
  const base = baselineState(entry, dateStr, slot);
  const cur = S.localOverrides.hasOwnProperty(key) ? S.localOverrides[key] : base;
  const next = cycleState(cur);
  if(next===base){
    delete S.localOverrides[key]; // 元の値に戻ったら「変更なし」扱いにする
  }else{
    S.localOverrides[key] = next;
  }
  const td = btn.closest('td');
  td.innerHTML = buildCellHtml(entry, dateStr, slot);
  td.querySelector('.cell-btn').addEventListener('click', ()=> handleCellClick(td.querySelector('.cell-btn'), entry, isSubmitted, yearMonth));
  updateSendButtonState();
}

function updateSendButtonState(){
  const count = Object.keys(S.localOverrides).length;
  const sendBtn = document.getElementById('sendRequestBtn');
  if(count===0){
    sendBtn.style.display = 'none';
  }else{
    sendBtn.style.display = '';
    sendBtn.textContent = `変更をリクエストする（${count}件）`;
  }
}

async function sendPendingChanges(){
  const yearMonth = `${S.curYear}-${pad2(S.curMonth+1)}`;
  const entry = getMonthEntry(yearMonth);
  const msg = document.getElementById('formMsg');
  const keys = Object.keys(S.localOverrides);
  if(keys.length===0) return;
  msg.textContent = '送信中…';
  try{
    for(const key of keys){
      const [dateStr, slotStr] = key.split('|');
      const slot = Number(slotStr);
      const priority = S.localOverrides[key];
      const existingReq = S.pendingRequests.find(r=>r.dateStr===dateStr && r.slot===slot);
      if(existingReq){
        await fbDb.collection('scheduleChangeRequests').doc(existingReq.id).update({priority});
        existingReq.priority = priority;
      }else{
        const docRef = await fbDb.collection('scheduleChangeRequests').add({
          adminUid: S.myAdminUid, teacherId: S.myTeacherId, teacherLoginUid: fbAuth.currentUser.uid,
          dateStr, slot, priority, status:'pending',
          submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        S.pendingRequests.push({id:docRef.id, dateStr, slot, priority, status:'pending'});
      }
    }
    S.localOverrides = {};
    msg.textContent = `✓ ${keys.length}件の変更をリクエストしました。教室長の承認をお待ちください。`;
    render();
  }catch(err){
    console.error('変更リクエストエラー:', err);
    msg.textContent = 'リクエストの送信に失敗しました。通信状況をご確認ください。';
  }
}
document.getElementById('sendRequestBtn').addEventListener('click', sendPendingChanges);

document.getElementById('prevBtn').addEventListener('click', ()=>{
  S.curMonth--; if(S.curMonth<0){ S.curMonth=11; S.curYear--; }
  render();
});
document.getElementById('nextBtn').addEventListener('click', ()=>{
  S.curMonth++; if(S.curMonth>11){ S.curMonth=0; S.curYear++; }
  render();
});
document.getElementById('todayBtn').addEventListener('click', ()=>{
  const t = new Date(); S.curYear = t.getFullYear(); S.curMonth = t.getMonth();
  render();
});
document.getElementById('submitBtn').addEventListener('click', async ()=>{
  const yearMonth = `${S.curYear}-${pad2(S.curMonth+1)}`;
  const entry = getMonthEntry(yearMonth);
  entry.status = 'submitted';
  entry.submittedBy = 'teacher';
  const msg = document.getElementById('formMsg');
  msg.textContent = '提出中…';
  await saveMonthEntry(yearMonth, entry);
  msg.textContent = '✓ 提出しました。';
  render();
});
export { getMonthEntry, render, renderKeepingOverrides, baselineState, effectiveState, buildCellHtml, handleCellClick, updateSendButtonState, sendPendingChanges };
