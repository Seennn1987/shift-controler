import { toDateStr } from '../shared/date-utils.js';
import { S } from './state.js';
import { computeDayFinance } from './absences.js';
import { personAppliesOnDate } from './active-people.js';

function prevYearMonth(year, month){
  if(month === 0) return { year: year - 1, month: 11 };
  return { year, month: month - 1 };
}

function monthLastDateStr(year, month){
  const days = new Date(year, month + 1, 0).getDate();
  return toDateStr(year, month, days);
}

/** その月末時点で在籍していた生徒数（開始前・退塾済みは除く） */
function countStudentsAsOfMonthEnd(year, month){
  const lastDay = monthLastDateStr(year, month);
  return (S.students || []).filter(student=>{
    if(!personAppliesOnDate(student, lastDay)) return false;
    const start = student.courseStartDate;
    if(typeof start === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(start) && start > lastDay){
      return false;
    }
    return true;
  }).length;
}

/** 指定月の売上・コスト・実施コマを日次集計からまとめる */
function computeMonthFinance(year, month, includeTransport){
  if(includeTransport === undefined) includeTransport = S.finIncludeTransport;
  const days = new Date(year, month + 1, 0).getDate();
  let revenue = 0;
  let lessonCost = 0;
  let transportCost = 0;
  let lessonCount = 0;
  for(let day = 1; day <= days; day++){
    const fin = computeDayFinance(toDateStr(year, month, day), includeTransport);
    revenue += fin.revenue;
    lessonCost += fin.lessonCost;
    transportCost += fin.transportCost;
    lessonCount += fin.lessonCount;
  }
  const cost = lessonCost + (includeTransport ? transportCost : 0);
  const ratio = revenue > 0 ? (cost / revenue * 100) : null;
  const gross = revenue - cost;
  return {
    studentCount: countStudentsAsOfMonthEnd(year, month),
    revenue,
    lessonCost,
    transportCost,
    cost,
    ratio,
    lessonCount,
    gross,
  };
}

function deltaValue(current, previous){
  if(current == null || previous == null) return null;
  if(!Number.isFinite(current) || !Number.isFinite(previous)) return null;
  return current - previous;
}

/** 表示月と前月の指標・差分を返す */
function buildMonthFinanceCompare(year, month, includeTransport){
  const current = computeMonthFinance(year, month, includeTransport);
  const prev = prevYearMonth(year, month);
  const previous = computeMonthFinance(prev.year, prev.month, includeTransport);
  return {
    current,
    previous,
    deltas: {
      studentCount: deltaValue(current.studentCount, previous.studentCount),
      lessonCount: deltaValue(current.lessonCount, previous.lessonCount),
      revenue: deltaValue(current.revenue, previous.revenue),
      lessonCost: deltaValue(current.lessonCost, previous.lessonCost),
      transportCost: deltaValue(current.transportCost, previous.transportCost),
      cost: deltaValue(current.cost, previous.cost),
      ratio: deltaValue(current.ratio, previous.ratio),
      gross: deltaValue(current.gross, previous.gross),
    },
  };
}

function formatYen(n){
  return `¥${Math.round(n).toLocaleString('ja-JP')}`;
}

function formatFinanceDelta(delta, kind){
  if(delta == null || !Number.isFinite(delta)) return '先月比 —';
  if(Math.abs(delta) < 1e-9) return '先月と同じ';
  const sign = delta > 0 ? '+' : '−';
  const abs = Math.abs(delta);
  if(kind === 'count') return `先月比 ${sign}${Math.round(abs)}人`;
  if(kind === 'lesson') return `先月比 ${sign}${Math.round(abs)}コマ`;
  if(kind === 'yen') return `先月比 ${sign}${formatYen(abs)}`;
  if(kind === 'ratio') return `先月比 ${sign}${abs.toFixed(1)}pt`;
  return `先月比 ${sign}${abs}`;
}

export {
  prevYearMonth,
  countStudentsAsOfMonthEnd,
  computeMonthFinance,
  buildMonthFinanceCompare,
  formatYen,
  formatFinanceDelta,
};
