import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr } from '../shared/date-utils.js';
import { fbAuth, fbDb, S } from './state.js';

function cycleState(s){
  if(s==='none') return 'preferred';
  if(s==='preferred') return 'normal';
  return 'none';
}
function labelFor(s){
  return s==='none' ? '×' : (s==='preferred' ? '○' : '△');
}

 // 提出済み月で、まだ送信していない下書きの変更（key: "日付|コマ" -> 状態）

function cellKey(dateStr, slot){ return `${dateStr}|${slot}`; }
export { cycleState, labelFor, cellKey };
