const HOLIDAYS = [
  {date:'2026-01-01', name:'元日'},
  {date:'2026-01-12', name:'成人の日'},
  {date:'2026-02-11', name:'建国記念の日'},
  {date:'2026-02-23', name:'天皇誕生日'},
  {date:'2026-03-20', name:'春分の日'},
  {date:'2026-04-29', name:'昭和の日'},
  {date:'2026-05-03', name:'憲法記念日'},
  {date:'2026-05-04', name:'みどりの日'},
  {date:'2026-05-05', name:'こどもの日'},
  {date:'2026-05-06', name:'休日（振替休日）'},
  {date:'2026-07-20', name:'海の日'},
  {date:'2026-08-11', name:'山の日'},
  {date:'2026-09-21', name:'敬老の日'},
  {date:'2026-09-22', name:'休日'},
  {date:'2026-09-23', name:'秋分の日'},
  {date:'2026-10-12', name:'スポーツの日'},
  {date:'2026-11-03', name:'文化の日'},
  {date:'2026-11-23', name:'勤労感謝の日'},
];

const closedDates = new Set(HOLIDAYS.map(h=> h.date));
closedDates.delete('2026-05-05');

function allClosed(){
  return HOLIDAYS.every(h=> closedDates.has(h.date));
}
function noneClosed(){
  return HOLIDAYS.every(h=> !closedDates.has(h.date));
}

function syncBulkToggle(){
  const bulk = document.getElementById('holidayAutoDetectToggle');
  if(!bulk) return;
  if(allClosed()){
    bulk.checked = true;
    bulk.indeterminate = false;
  }else if(noneClosed()){
    bulk.checked = false;
    bulk.indeterminate = false;
  }else{
    bulk.checked = false;
    bulk.indeterminate = true;
  }
}

function renderHolidayList(){
  const wrap = document.getElementById('holidayListWrap');
  if(!wrap) return;
  wrap.innerHTML = HOLIDAYS.map(h=>{
    const closed = closedDates.has(h.date);
    const rowClass = closed ? '' : ' is-disabled';
    const checked = closed ? ' checked' : '';
    const badge = closed ? '<span class="holiday-status-badge">休校</span>' : '';
    return `<label class="holiday-row${rowClass}">
      <input type="checkbox" class="holiday-closed-checkbox" data-date="${h.date}"${checked} aria-label="${h.name}を休校にする">
      <span class="holiday-date">${h.date}</span>
      <span class="holiday-name">${h.name}</span>
      ${badge}
    </label>`;
  }).join('');

  wrap.querySelectorAll('.holiday-closed-checkbox').forEach(cb=>{
    cb.addEventListener('change', ()=>{
      if(cb.checked) closedDates.add(cb.dataset.date);
      else closedDates.delete(cb.dataset.date);
      renderHolidayList();
    });
  });
  syncBulkToggle();
}

function init(){
  const bulk = document.getElementById('holidayAutoDetectToggle');
  bulk.addEventListener('change', ()=>{
    if(bulk.checked){
      HOLIDAYS.forEach(h=> closedDates.add(h.date));
    }else{
      closedDates.clear();
    }
    renderHolidayList();
  });
  renderHolidayList();
}

init();
