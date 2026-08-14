import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr } from '../shared/date-utils.js';
import { fbAuth, fbDb, S } from './state.js';
import { getDayStatus } from './day-status.js';
import { findPendingTicket,approveTicket } from './approvals.js';

// ---- マイカレンダー（実日付ベースの担当授業一覧） ----
function renderMyCalendar(){
  const wrap = document.getElementById('myCalWrap');
  if(!wrap) return;
  document.getElementById('calMonthTitle').textContent = `${S.myCalYear}年${S.myCalMonth+1}月`;

  const pendingCount = S.newAssignments.length;
  const bannerCard = document.getElementById('pendingBannerCard');
  if(pendingCount>0){
    bannerCard.style.display = '';
    document.getElementById('pendingBannerText').textContent = `${pendingCount}件、確認が必要な授業があります`;
    document.getElementById('approveAllBtn').textContent = `まとめて承認する（${pendingCount}件）`;
  }else{
    bannerCard.style.display = 'none';
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
          const ticket = findPendingTicket(e.day, e.slot, e.subject, e.studentName, e.oneTimeDate);
          const isPending = !!ticket;
          return `<div class="mycal-lesson-row ${isPending?'pending':''}">
            <div class="mycal-lesson-info">
              <span class="mycal-slot-tag">${slotLabel?slotLabel.label:e.slot+'講'}</span>
              <b>${e.studentName}</b>（${e.studentGrade||''}）　${e.subject}
              ${e.oneTimeDate ? '<span class="mycal-pending-tag" style="color:var(--ink-soft);">単発の代講</span>' : ''}
              ${isPending ? '<span class="mycal-pending-tag">未承認</span>' : ''}
            </div>
            ${isPending ? `<button type="button" class="mycal-approve-btn" data-id="${ticket.id}">承認する</button>` : ''}
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
