import { SLOTS, WEEKDAY_JP } from '../shared/constants.js';
import { HOLIDAYS_JP } from '../shared/holidays.js';
import { pad2, daysInYearMonth, toDateStr } from '../shared/date-utils.js';
import { fbAuth, fbDb, S } from './state.js';

const debugLines = [];

// ---- 診断パネル：実際の呼び出し直前の値・エラーの詳細をそのまま画面に表示する ----
function debugLog(line){
  const time = new Date().toLocaleTimeString('ja-JP');
  const full = `[${time}] ${line}`;
  console.log('%c[DEBUG] ' + full, 'color:#d9822b;font-weight:bold;'); // コンソールにも同時出力（見つけやすいよう色付け）
  debugLines.push(full);
  if(debugLines.length>50) debugLines.shift();
  const panel = document.getElementById('debugPanel');
  if(panel) panel.textContent = debugLines.join('\n');
}
export { debugLog };
