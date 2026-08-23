import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { collapseTeacherCalendarEntries } from '../admin/dual-subject.js';
import { pad2, daysInYearMonth, toDateStr } from '../shared/date-utils.js';
import { fbAuth, fbDb, S } from './state.js';
import { getDayStatus } from './day-status.js';
import { cycleState, labelFor, cellKey } from './schedule-utils.js';
import { saveMonthEntry } from './schedule.js';
import { getMonthEntry } from './shift-ui.js';
import {
  markAdminCancelledNoticeRead,
  formatAdminCancelledNoticeLine,
  findPendingTicket,
  findPendingCancellation,
  resolveApprovalState,
  getSlotDraft,
  setDraftForSlot,
  clearSlotDraft,
  draftKeyForSlot,
  setDraftForCancel,
  clearDraftByKey,
  draftKeyForCancel,
  countUnrepliedPendingSlots,
  summarizeDrafts,
  pruneStaleResponseDrafts,
} from './approvals.js';

function getEntriesForSlot(dateStr, slotId){
  const wd = WEEKDAY_JP[new Date(`${dateStr}T00:00:00`).getDay()];
  return collapseTeacherCalendarEntries(
    S.myAssignmentEntries.filter(e=>{
      if(Number(e.slot) !== Number(slotId)) return false;
      return e.oneTimeDate ? e.oneTimeDate === dateStr : e.day === wd;
    })
  );
}

function getSlotPendingTickets(dateStr, slotId){
  const wd = WEEKDAY_JP[new Date(`${dateStr}T00:00:00`).getDay()];
  return S.newAssignments.filter(t=>{
    if(t.day !== wd || Number(t.slot) !== Number(slotId)) return false;
    if(t.oneTimeDate) return t.oneTimeDate === dateStr;
    return true;
  });
}

function slotHasPending(dateStr, slotId){
  return getSlotPendingTickets(dateStr, slotId).length > 0;
}

function buildAvailButtonHtml(entry, dateStr, slotId, isSubmitted){
  const state = effectiveState(entry, dateStr, slotId);
  const key = cellKey(dateStr, slotId);
  const isDirty = S.localOverrides.hasOwnProperty(key);
  const isRequested = !isDirty && S.pendingRequests.some(r=> r.dateStr === dateStr && r.slot === slotId);
  let cls = `schedule-avail-btn st-${state}`;
  if(isDirty) cls += ' pending-local';
  else if(isRequested) cls += ' requested';
  let badge = '';
  if(isDirty) badge = '<span class="schedule-avail-badge">未送信</span>';
  else if(isRequested) badge = '<span class="schedule-avail-badge is-req">申請中</span>';
  return `<button type="button" class="${cls}" data-avail-date="${dateStr}" data-avail-slot="${slotId}" aria-label="出勤可否">${labelFor(state)}${badge}</button>`;
}

function buildLessonLineHtml(entry){
  const approvalState = resolveApprovalState(entry);
  const isPending = approvalState === 'pending';
  const ticket = isPending ? findPendingTicket(entry.day, entry.slot, entry.subject, entry.studentName, entry.oneTimeDate) : null;
  const pendingCancel = findPendingCancellation(entry);
  const cancelKey = draftKeyForCancel(entry);
  const cancelDraft = S.responseDrafts[cancelKey];
  let cls = 'schedule-lesson-line';
  if(isPending) cls += ' is-pending';
  else if(approvalState === 'confirmed') cls += ' is-confirmed';
  let badges = '';
  if(approvalState === 'confirmed') badges += '<span class="mycal-status-badge is-confirmed">確定</span>';
  if(entry.isPreferredPair) badges += '<span class="mycal-status-badge is-assigned">担当生徒</span>';
  let cancelHtml = '';
  if(approvalState === 'confirmed'){
    if(pendingCancel){
      cancelHtml = '<span class="schedule-cancel-note">キャンセル待ち</span>';
    }else if(cancelDraft){
      cancelHtml = `<button type="button" class="mycal-undo-btn" data-draft-key="${cancelKey}">取り消す</button>`;
    }else{
      const payload = encodeURIComponent(JSON.stringify({
        day: entry.day, slot: entry.slot, subject: entry.subject,
        studentName: entry.studentName, studentGrade: entry.studentGrade || '',
        oneTimeDate: entry.oneTimeDate || null,
      }));
      cancelHtml = `<button type="button" class="mycal-cancel-btn schedule-cancel-btn" data-cancel-entry="${payload}">キャンセルを依頼</button>`;
    }
  }
  if(!ticket && isPending){
    return `<div class="${cls}"><span class="schedule-lesson-text"><b>${entry.studentName}</b>（${entry.studentGrade || ''}） ${entry.subject}</span><span class="mycal-orphan-note">反映待ち</span></div>`;
  }
  return `<div class="${cls}"><span class="schedule-lesson-text"><b>${entry.studentName}</b>（${entry.studentGrade || ''}） ${entry.subject}</span>${badges}${cancelHtml}</div>`;
}

function buildSlotActionsHtml(dateStr, slotId){
  if(!slotHasPending(dateStr, slotId)) return '';
  const draft = getSlotDraft(dateStr, slotId);
  const slotKey = draftKeyForSlot(dateStr, slotId);
  if(draft){
    if(draft.action === 'approve'){
      return `<div class="schedule-slot-actions">
        <button type="button" class="mycal-approve-btn is-done" disabled>受ける（選択済）</button>
        <button type="button" class="mycal-undo-btn" data-draft-key="${slotKey}">取り消す</button>
      </div>`;
    }
    return `<div class="schedule-slot-actions">
      <button type="button" class="mycal-decline-btn is-selected" disabled>受けられない（選択済）</button>
      <button type="button" class="mycal-undo-btn" data-draft-key="${slotKey}">取り消す</button>
    </div>`;
  }
  return `<div class="schedule-slot-actions">
    <button type="button" class="mycal-approve-btn" data-slot-date="${dateStr}" data-slot-id="${slotId}">受ける</button>
    <button type="button" class="mycal-decline-btn" data-slot-date="${dateStr}" data-slot-id="${slotId}">受けられない</button>
  </div>`;
}

function buildScheduleCellHtml(entry, dateStr, slotId, isSubmitted, dayStatus){
  if(dayStatus.type !== 'open'){
    return `<div class="schedule-cell is-closed"><span class="schedule-closed-label">休校</span></div>`;
  }
  const entries = getEntriesForSlot(dateStr, slotId);
  const pending = slotHasPending(dateStr, slotId);
  const cellCls = ['schedule-cell', pending ? 'has-pending' : '', entries.some(e=> resolveApprovalState(e) === 'confirmed') ? 'has-confirmed' : ''].filter(Boolean).join(' ');
  const lessonsHtml = entries.length
    ? entries.map(buildLessonLineHtml).join('')
    : '<div class="schedule-lesson-empty">授業なし</div>';
  return `<div class="${cellCls}">
    ${buildAvailButtonHtml(entry, dateStr, slotId, isSubmitted)}
    <div class="schedule-lessons">${lessonsHtml}</div>
    ${buildSlotActionsHtml(dateStr, slotId)}
  </div>`;
}

function effectiveState(entry, dateStr, slot){
  const key = cellKey(dateStr, slot);
  if(S.localOverrides.hasOwnProperty(key)) return S.localOverrides[key];
  return baselineState(entry, dateStr, slot);
}

function baselineState(entry, dateStr, slot){
  const req = S.pendingRequests.find(r=> r.dateStr === dateStr && r.slot === slot);
  if(req) return req.priority;
  const cur = (entry.days[dateStr] || []).find(e=> e.slot === slot);
  return cur ? cur.priority : 'none';
}

function updateBanner(){
  pruneStaleResponseDrafts();
  const bannerCard = document.getElementById('pendingBannerCard');
  const requestLine = document.getElementById('pendingBannerRequest');
  const draftLine = document.getElementById('pendingBannerDraft');
  const noticeWrap = document.getElementById('pendingBannerNotices');
  const draftAllBtn = document.getElementById('draftApproveAllBtn');
  const submitBtn = document.getElementById('submitResponsesBtn');

  const unreplied = countUnrepliedPendingSlots();
  const draftCount = Object.keys(S.responseDrafts).length;
  const notices = S.adminCancelledNotices || [];
  const show = unreplied > 0 || draftCount > 0 || notices.length > 0;

  if(!bannerCard) return;
  bannerCard.style.display = show ? '' : 'none';

  if(noticeWrap){
    if(notices.length > 0){
      noticeWrap.style.display = '';
      noticeWrap.innerHTML = notices.map(n=> `
        <div class="pending-banner-notice-row">
          <p class="pending-banner-line pending-banner-notice">【お知らせ】教室長が依頼を取り消しました — ${formatAdminCancelledNoticeLine(n)}</p>
          <button type="button" class="ghost pending-notice-dismiss-btn" data-notice-id="${n.id}">確認した</button>
        </div>
      `).join('');
    }else{
      noticeWrap.style.display = 'none';
      noticeWrap.innerHTML = '';
    }
  }

  if(requestLine){
    if(unreplied > 0){
      requestLine.style.display = '';
      requestLine.textContent = `【返事が必要】あと${unreplied}コマ、授業依頼への返事が必要です`;
    }else{
      requestLine.style.display = 'none';
      requestLine.textContent = '';
    }
  }

  if(draftLine){
    if(draftCount > 0){
      draftLine.style.display = '';
      const summary = summarizeDrafts(S.responseDrafts);
      draftLine.textContent = `【教室長に送る】${draftCount}件、まだ送っていません${summary ? `（${summary}）` : ''}`;
    }else{
      draftLine.style.display = 'none';
      draftLine.textContent = '';
    }
  }

  if(draftAllBtn){
    draftAllBtn.style.display = unreplied > 0 ? '' : 'none';
    draftAllBtn.textContent = `残り${unreplied}コマをすべて受ける`;
  }
  if(submitBtn){
    submitBtn.style.display = draftCount > 0 ? '' : 'none';
    submitBtn.textContent = `${draftCount}件を教室長に送信する`;
  }
}

async function handleAvailClick(btn, entry, isSubmitted, yearMonth){
  const dateStr = btn.dataset.availDate;
  const slot = Number(btn.dataset.availSlot);

  if(!isSubmitted){
    const cur = (entry.days[dateStr] || []).find(e=> e.slot === slot);
    const curState = cur ? cur.priority : 'none';
    const next = cycleState(curState);
    entry.days[dateStr] = entry.days[dateStr] || [];
    entry.days[dateStr] = entry.days[dateStr].filter(e=> e.slot !== slot);
    if(next !== 'none') entry.days[dateStr].push({ slot, priority: next });
    entry.submittedBy = 'teacher';
    await saveMonthEntry(yearMonth, entry);
    renderScheduleKeepingOverrides();
    return;
  }

  const key = cellKey(dateStr, slot);
  const base = baselineState(entry, dateStr, slot);
  const cur = S.localOverrides.hasOwnProperty(key) ? S.localOverrides[key] : base;
  const next = cycleState(cur);
  if(next === base) delete S.localOverrides[key];
  else S.localOverrides[key] = next;
  updateSendButtonState();
  renderScheduleKeepingOverrides();
}

function bindScheduleGrid(entry, isSubmitted, yearMonth){
  const wrap = document.getElementById('gridWrap');
  if(!wrap) return;

  wrap.querySelectorAll('.schedule-avail-btn').forEach(btn=>{
    btn.addEventListener('click', (ev)=>{
      ev.stopPropagation();
      handleAvailClick(btn, entry, isSubmitted, yearMonth);
    });
  });

  wrap.querySelectorAll('.mycal-approve-btn[data-slot-date]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      setDraftForSlot(btn.dataset.slotDate, Number(btn.dataset.slotId), 'approve');
    });
  });
  wrap.querySelectorAll('.mycal-decline-btn[data-slot-date]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      setDraftForSlot(btn.dataset.slotDate, Number(btn.dataset.slotId), 'reject');
    });
  });
  wrap.querySelectorAll('.mycal-cancel-btn[data-cancel-entry]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      try{
        setDraftForCancel(JSON.parse(decodeURIComponent(btn.dataset.cancelEntry)));
      }catch(e){
        console.error('キャンセル下書きエラー:', e);
      }
    });
  });
  wrap.querySelectorAll('.mycal-undo-btn[data-draft-key]').forEach(btn=>{
    btn.addEventListener('click', ()=> clearDraftByKey(btn.dataset.draftKey));
  });
}

function bindNoticeDismiss(){
  document.querySelectorAll('.pending-notice-dismiss-btn').forEach(btn=>{
    btn.addEventListener('click', async ()=>{
      btn.disabled = true;
      await markAdminCancelledNoticeRead(btn.dataset.noticeId);
      renderScheduleKeepingOverrides();
    });
  });
}

function updateSendButtonState(){
  const count = Object.keys(S.localOverrides).length;
  const sendBtn = document.getElementById('sendRequestBtn');
  if(!sendBtn) return;
  if(count === 0){
    sendBtn.style.display = 'none';
  }else{
    sendBtn.style.display = '';
    sendBtn.textContent = `変更をリクエストする（${count}件）`;
  }
}

function renderScheduleKeepingOverrides(){
  const yearMonth = `${S.curYear}-${pad2(S.curMonth + 1)}`;
  const titleEl = document.getElementById('scheduleMonthTitle');
  if(titleEl) titleEl.textContent = `${S.curYear}年${S.curMonth + 1}月`;
  updateBanner();

  const entry = getMonthEntry(yearMonth);
  const isSubmitted = entry.status === 'submitted';
  const adminNote = entry.submittedBy === 'admin' ? '（教室長が代理入力した内容です。内容をご確認ください）' : '';
  const statusBar = document.getElementById('statusBar');
  if(statusBar){
    statusBar.innerHTML = isSubmitted
      ? `<span class="status-badge submitted">提出済</span><span>×／○／△を変更する場合はセルをクリックし、最後に「変更をリクエストする」を押してください${adminNote}。</span>`
      : `<span class="status-badge draft">未提出</span><span>各コマの×／○／△を選び、授業依頼があれば「受ける／受けられない」を選んでから「この内容で提出する」を押してください${adminNote}。</span>`;
  }

  const total = daysInYearMonth(yearMonth);
  const todayStr = toDateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  let thead = '<thead><tr><th>日付</th>' + SLOTS.map(s=> `<th>${s.label}</th>`).join('') + '</tr></thead>';
  let tbody = '<tbody>';

  for(let d = 1; d <= total; d++){
    const dateStr = `${yearMonth}-${pad2(d)}`;
    const wd = WEEKDAY_JP[new Date(`${dateStr}T00:00:00`).getDay()];
    const dayStatus = getDayStatus(dateStr);
    const isToday = dateStr === todayStr;
    const rowLabel = `${d}日（${wd}）${isToday ? '・今日' : ''}${dayStatus.type !== 'open' ? `・${dayStatus.label}` : ''}`;
    tbody += `<tr class="${dayStatus.type !== 'open' ? 'is-closed-day' : ''}"><th>${rowLabel}</th>`;
    SLOTS.forEach(slot=>{
      tbody += `<td>${buildScheduleCellHtml(entry, dateStr, slot.id, isSubmitted, dayStatus)}</td>`;
    });
    tbody += '</tr>';
  }
  tbody += '</tbody>';

  const gridWrap = document.getElementById('gridWrap');
  if(gridWrap) gridWrap.innerHTML = `<table class="grid schedule-grid">${thead}${tbody}</table>`;

  bindScheduleGrid(entry, isSubmitted, yearMonth);
  bindNoticeDismiss();
  updateSendButtonState();
}

function renderScheduleUnified(){
  S.localOverrides = {};
  renderScheduleKeepingOverrides();
}

async function sendPendingChanges(){
  const yearMonth = `${S.curYear}-${pad2(S.curMonth + 1)}`;
  const msg = document.getElementById('formMsg');
  const keys = Object.keys(S.localOverrides);
  if(keys.length === 0) return;
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
          adminUid: S.myAdminUid, teacherId: S.myTeacherId, teacherLoginUid: fbAuth.currentUser.uid,
          dateStr, slot, priority, status: 'pending',
          submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        S.pendingRequests.push({ id: docRef.id, dateStr, slot, priority, status: 'pending' });
      }
    }
    S.localOverrides = {};
    if(msg) msg.textContent = `✓ ${keys.length}件の変更をリクエストしました。教室長の承認をお待ちください。`;
    renderScheduleUnified();
  }catch(err){
    console.error('変更リクエストエラー:', err);
    if(msg) msg.textContent = 'リクエストの送信に失敗しました。通信状況をご確認ください。';
  }
}

function bindScheduleChrome(){
  if(bindScheduleChrome._bound) return;
  bindScheduleChrome._bound = true;

  document.getElementById('schedulePrevBtn')?.addEventListener('click', ()=>{
    S.curMonth--; if(S.curMonth < 0){ S.curMonth = 11; S.curYear--; }
    renderScheduleUnified();
  });
  document.getElementById('scheduleNextBtn')?.addEventListener('click', ()=>{
    S.curMonth++; if(S.curMonth > 11){ S.curMonth = 0; S.curYear++; }
    renderScheduleUnified();
  });
  document.getElementById('scheduleTodayBtn')?.addEventListener('click', ()=>{
    const t = new Date(); S.curYear = t.getFullYear(); S.curMonth = t.getMonth();
    renderScheduleUnified();
  });
  document.getElementById('sendRequestBtn')?.addEventListener('click', sendPendingChanges);
  document.getElementById('submitScheduleBtn')?.addEventListener('click', async ()=>{
    const yearMonth = `${S.curYear}-${pad2(S.curMonth + 1)}`;
    const entry = getMonthEntry(yearMonth);
    entry.status = 'submitted';
    entry.submittedBy = 'teacher';
    const msg = document.getElementById('formMsg');
    if(msg) msg.textContent = '提出中…';
    await saveMonthEntry(yearMonth, entry);
    if(msg) msg.textContent = '✓ 提出しました。';
    renderScheduleUnified();
  });
}

bindScheduleChrome();

export { renderScheduleUnified, renderScheduleKeepingOverrides };
