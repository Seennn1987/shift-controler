import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr } from '../shared/date-utils.js';
import { fbAuth, fbDb, S } from './state.js';

// 休校日設定（教室長側から同期される。取得できるまでは全日OKとして扱う）

function findCustomClosure(dateStr){
  return S.customClosures.find(c=> dateStr>=c.startDate && dateStr<=c.endDate) || null;
}
function getDayStatus(dateStr){
  const d = new Date(dateStr+'T00:00:00');
  const weekday = WEEKDAY_JP[d.getDay()];
  const closure = findCustomClosure(dateStr);
  if(closure) return {type:'custom-closed', label:closure.label, weekday};
  if(S.regularClosedDays.includes(weekday)) return {type:'closed-weekday', label:'定休日', weekday};
  if(S.holidayAutoDetect){
    const h = HOLIDAYS_JP.find(x=>x.date===dateStr);
    if(h) return {type:'holiday', label:h.name, weekday};
  }
  return {type:'open', label:'', weekday};
}
export { findCustomClosure, getDayStatus };
