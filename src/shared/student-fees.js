/** 入塾した年の年会費（4〜6月は全額、7月以降は3月までの残りの月数×減る額） */
export function firstYearAnnualFee(startMonth1, fees){
  const full = Number(fees.annual) || 0;
  if(startMonth1 >= 4 && startMonth1 <= 6) return full;
  const remaining = startMonth1 >= 7 ? 16 - startMonth1 : 4 - startMonth1;
  return Math.min(full, remaining * (Number(fees.annualMonthlyReduction) || 0));
}
