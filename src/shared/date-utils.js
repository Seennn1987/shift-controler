export function pad2(n) {
  return String(n).padStart(2, '0');
}

export function daysInYearMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

export function toDateStr(y, m, d) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

export function getTodayStr() {
  const t = new Date();
  return toDateStr(t.getFullYear(), t.getMonth(), t.getDate());
}

/** 開始日が無い／不正なら制限しない。YYYY-MM-DD 同士の文字列比較。 */
export function isOnOrAfterDate(dateStr, startDate) {
  if (typeof startDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return true;
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return true;
  return dateStr >= startDate;
}
