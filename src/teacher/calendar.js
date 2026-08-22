import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { pad2, daysInYearMonth, toDateStr } from '../shared/date-utils.js';
import { S } from './state.js';
import { getDayStatus } from './day-status.js';
import {
  findPendingTicket,
  findPendingCancellation,
  getDraftForEntry,
  setDraftForTicket,
  setDraftForCancel,
  clearDraftByKey,
  draftKeyForTicket,
  draftKeyForCancel,
  countUnrepliedPendingTickets,
  summarizeDrafts,
} from './approvals.js';

function resolveApprovalState(entry){
  if(entry.approvalStatus === 'pending') return 'pending';
  if(entry.approvalStatus === 'confirmed') return 'confirmed';
  return findPendingTicket(entry.day, entry.slot, entry.subject, entry.studentName, entry.oneTimeDate) ? 'pending' : 'confirmed';
}

function buildActionsHtml(entry, ticket, approvalState){
  const draft = getDraftForEntry(entry, ticket);
  const pendingCancel = findPendingCancellation(entry);

  if(approvalState === 'pending'){
    if(!ticket){
      return '<span class="mycal-orphan-note">反映待ち（教室長に連絡）</span>';
    }
    const tKey = draftKeyForTicket(ticket.id);
    if(draft){
      if(draft.action === 'approve'){
        return `<div class="mycal-actions">
          <button type="button" class="mycal-approve-btn is-done" disabled>承認済</button>
          <button type="button" class="mycal-undo-btn" data-draft-key="${tKey}">取り消す</button>
        </div>`;
      }
      if(draft.action === 'reject'){
        return `<div class="mycal-actions">
          <button type="button" class="mycal-reject-btn is-selected" disabled>断る</button>
          <button type="button" class="mycal-undo-btn" data-draft-key="${tKey}">取り消す</button>
        </div>`;
      }
    }
    return `<div class="mycal-actions">
      <button type="button" class="mycal-approve-btn" data-ticket-id="${ticket.id}">承認する</button>
      <button type="button" class="mycal-reject-btn" data-ticket-id="${ticket.id}">断る</button>
    </div>`;
  }

  // 確定済み
  const cKey = draftKeyForCancel(entry);
  if(pendingCancel){
    return `<div class="mycal-actions">
      <button type="button" class="mycal-approve-btn is-done" disabled>承認済</button>
      <button type="button" class="mycal-cancel-btn is-waiting" disabled>キャンセル待ち</button>
    </div>`;
  }
  if(draft && draft.action === 'cancel'){
    return `<div class="mycal-actions">
      <button type="button" class="mycal-approve-btn is-done" disabled>承認済</button>
      <button type="button" class="mycal-cancel-btn is-selected" disabled>キャンセル</button>
      <button type="button" class="mycal-undo-btn" data-draft-key="${cKey}">取り消す</button>
    </div>`;
  }
  return `<div class="mycal-actions">
    <button type="button" class="mycal-approve-btn is-done" disabled>承認済</button>
    <button type="button" class="mycal-cancel-btn" data-cancel-entry="${encodeURIComponent(JSON.stringify({day:entry.day,slot:entry.slot,subject:entry.subject,studentName:entry.studentName,studentGrade:entry.studentGrade||'',oneTimeDate:entry.oneTimeDate||null}))}">キャンセルを依頼</button>
  </div>`;
}

function rowClass(entry, approvalState, ticket){
  const draft = getDraftForEntry(entry, ticket);
  if(approvalState === 'pending'){
    return `mycal-lesson-row pending${draft ? ' has-draft' : ''}`;
  }
  if(findPendingCancellation(entry)) return 'mycal-lesson-row is-cancel-waiting';
  if(draft) return 'mycal-lesson-row has-draft';
  return 'mycal-lesson-row';
}

function updateBanner(){
  const bannerCard = document.getElementById('pendingBannerCard');
  const requestLine = document.getElementById('pendingBannerRequest');
  const draftLine = document.getElementById('pendingBannerDraft');
  const draftAllBtn = document.getElementById('draftApproveAllBtn');
  const submitBtn = document.getElementById('submitResponsesBtn');

  const unreplied = countUnrepliedPendingTickets();
  const draftCount = Object.keys(S.responseDrafts).length;
  const show = unreplied > 0 || draftCount > 0;

  if(!bannerCard) return;
  bannerCard.style.display = show ? '' : 'none';

  if(requestLine){
    if(unreplied > 0){
      requestLine.style.display = '';
      requestLine.textContent = `【カレンダーで選ぶ】あと${unreplied}コマ、授業依頼への返事が必要です`;
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
    draftAllBtn.textContent = `残り${unreplied}コマをすべて承認する`;
  }
  if(submitBtn){
    submitBtn.style.display = draftCount > 0 ? '' : 'none';
    submitBtn.textContent = `${draftCount}件を教室長に送信する`;
  }
}

function bindRowActions(wrap){
  wrap.querySelectorAll('.mycal-approve-btn[data-ticket-id]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const ticket = S.newAssignments.find(t=>t.id===btn.dataset.ticketId);
      if(!ticket) return;
      const entry = {
        day: ticket.day, slot: ticket.slot, subject: ticket.subject,
        studentName: ticket.studentName, studentGrade: ticket.studentGrade,
        oneTimeDate: ticket.oneTimeDate || null,
      };
      setDraftForTicket(ticket, 'approve', entry);
    });
  });
  wrap.querySelectorAll('.mycal-reject-btn[data-ticket-id]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const ticket = S.newAssignments.find(t=>t.id===btn.dataset.ticketId);
      if(!ticket) return;
      const entry = {
        day: ticket.day, slot: ticket.slot, subject: ticket.subject,
        studentName: ticket.studentName, studentGrade: ticket.studentGrade,
        oneTimeDate: ticket.oneTimeDate || null,
      };
      setDraftForTicket(ticket, 'reject', entry);
    });
  });
  wrap.querySelectorAll('.mycal-cancel-btn[data-cancel-entry]').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      try{
        const entry = JSON.parse(decodeURIComponent(btn.dataset.cancelEntry));
        setDraftForCancel(entry);
      }catch(e){
        console.error('キャンセル下書きエラー:', e);
      }
    });
  });
  wrap.querySelectorAll('.mycal-undo-btn[data-draft-key]').forEach(btn=>{
    btn.addEventListener('click', ()=> clearDraftByKey(btn.dataset.draftKey));
  });
}

function renderMyCalendar(){
  const wrap = document.getElementById('myCalWrap');
  if(!wrap) return;
  document.getElementById('calMonthTitle').textContent = `${S.myCalYear}年${S.myCalMonth+1}月`;
  updateBanner();

  const total = daysInYearMonth(`${S.myCalYear}-${pad2(S.myCalMonth+1)}`);
  const todayStr = toDateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  let html = '';

  for(let d=1; d<=total; d++){
    const dateStr = `${S.myCalYear}-${pad2(S.myCalMonth+1)}-${pad2(d)}`;
    const wd = WEEKDAY_JP[new Date(dateStr+'T00:00:00').getDay()];
    const status = getDayStatus(dateStr);
    const isToday = dateStr===todayStr;
    const isClosed = status.type!=='open';

    let rowsHtml;
    if(isClosed){
      rowsHtml = `<div class="mycal-lesson-row closed"><div class="mycal-lesson-info mycal-closed-label">休校（${status.label}）</div></div>`;
    }else{
      const dayEntries = S.myAssignmentEntries.filter(e=> e.oneTimeDate ? e.oneTimeDate===dateStr : e.day===wd);
      if(dayEntries.length===0){
        rowsHtml = `<div class="mycal-lesson-row empty"><div class="mycal-lesson-info mycal-empty-label">確定授業なし</div></div>`;
      }else{
        dayEntries.sort((a,b)=> a.slot - b.slot);
        rowsHtml = dayEntries.map(e=>{
          const slotLabel = SLOTS.find(s=>s.id===e.slot);
          const approvalState = resolveApprovalState(e);
          const isPending = approvalState === 'pending';
          const ticket = isPending ? findPendingTicket(e.day, e.slot, e.subject, e.studentName, e.oneTimeDate) : null;
          return `<div class="${rowClass(e, approvalState, ticket)}">
            <div class="mycal-lesson-info">
              <span class="mycal-slot-tag">${slotLabel?slotLabel.label:e.slot+'講'}</span>
              <b>${e.studentName}</b>（${e.studentGrade||''}）　${e.subject}
              ${e.oneTimeDate ? '<span class="mycal-status-badge is-sub">単発の代講</span>' : ''}
            </div>
            ${buildActionsHtml(e, ticket, approvalState)}
          </div>`;
        }).join('');
      }
    }

    html += `<div class="mycal-day ${isClosed?'is-closed':''}">
      <div class="mycal-date-label ${isToday?'is-today':''}">${S.myCalMonth+1}月${d}日（${wd}）${isToday?'（今日）':''}</div>
      ${rowsHtml}
    </div>`;
  }

  wrap.innerHTML = html;
  bindRowActions(wrap);
}

document.getElementById('calPrevBtn').addEventListener('click', ()=>{
  S.myCalMonth--; if(S.myCalMonth<0){ S.myCalMonth=11; S.myCalYear--; }
  renderMyCalendar();
});
document.getElementById('calNextBtn').addEventListener('click', ()=>{
  S.myCalMonth++; if(S.myCalMonth>11){ S.myCalMonth=0; S.myCalYear++; }
  renderMyCalendar();
});
document.getElementById('calTodayBtn').addEventListener('click', ()=>{
  const t = new Date(); S.myCalYear = t.getFullYear(); S.myCalMonth = t.getMonth();
  renderMyCalendar();
});
export { renderMyCalendar };
