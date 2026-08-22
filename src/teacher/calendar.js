import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { pad2, daysInYearMonth, toDateStr } from '../shared/date-utils.js';
import { S } from './state.js';
import { getDayStatus } from './day-status.js';
import { findPendingTicket, approveTicket, rejectTicket } from './approvals.js';

function resolveApprovalState(entry){
  if(entry.approvalStatus === 'pending') return 'pending';
  if(entry.approvalStatus === 'confirmed') return 'confirmed';
  return findPendingTicket(entry.day, entry.slot, entry.subject, entry.studentName, entry.oneTimeDate) ? 'pending' : 'confirmed';
}

function statusBadgeHtml(state){
  if(state === 'pending') return '<span class="mycal-status-badge is-pending">依頼中</span>';
  return '<span class="mycal-status-badge is-confirmed">確定済み</span>';
}

// ---- マイカレンダー（実日付ベースの担当授業一覧） ----
function renderMyCalendar(){
  const wrap = document.getElementById('myCalWrap');
  if(!wrap) return;
  document.getElementById('calMonthTitle').textContent = `${S.myCalYear}年${S.myCalMonth+1}月`;

  const pendingCount = S.newAssignments.length;
  const bannerCard = document.getElementById('pendingBannerCard');
  const bannerHint = document.getElementById('pendingBannerHint');
  if(pendingCount>0){
    bannerCard.style.display = '';
    document.getElementById('pendingBannerText').textContent = `${pendingCount}コマ、授業依頼が届いています`;
    document.getElementById('approveAllBtn').textContent = `まとめて承認（${pendingCount}コマ）`;
    if(bannerHint) bannerHint.textContent = '同じコマは毎週の曜日ごとに表示されます。承認は1回でそのコマ全体に反映されます。';
  }else{
    bannerCard.style.display = 'none';
    if(bannerHint) bannerHint.textContent = '';
  }

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
          const isOrphan = isPending && !ticket;
          let actionsHtml = '';
          if(ticket){
            actionsHtml = `<div class="mycal-actions">
              <button type="button" class="mycal-approve-btn" data-id="${ticket.id}">承認する</button>
              <button type="button" class="mycal-reject-btn" data-id="${ticket.id}">断る</button>
            </div>`;
          }else if(isOrphan){
            actionsHtml = '<span class="mycal-orphan-note">反映待ち（教室長に連絡）</span>';
          }
          return `<div class="mycal-lesson-row ${isPending?'pending':''}">
            <div class="mycal-lesson-info">
              <span class="mycal-slot-tag">${slotLabel?slotLabel.label:e.slot+'講'}</span>
              <b>${e.studentName}</b>（${e.studentGrade||''}）　${e.subject}
              ${e.oneTimeDate ? '<span class="mycal-status-badge is-sub">単発の代講</span>' : ''}
              ${statusBadgeHtml(approvalState)}
            </div>
            ${actionsHtml}
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
  wrap.querySelectorAll('.mycal-approve-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> approveTicket(btn.dataset.id));
  });
  wrap.querySelectorAll('.mycal-reject-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> rejectTicket(btn.dataset.id));
  });
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
