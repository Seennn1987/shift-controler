import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr } from '../shared/date-utils.js';
import { fbAuth, fbDb, S } from './state.js';
import { renderMyCalendar } from './calendar.js';

// タブ切り替え
document.querySelectorAll('.tab-btn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active', b===btn));
    const tab = btn.dataset.tab;
    document.getElementById('tab-mycal').classList.toggle('active', tab==='mycal');
    document.getElementById('tab-shift').classList.toggle('active', tab==='shift');
  });
});
