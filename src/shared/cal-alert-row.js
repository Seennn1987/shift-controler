/** カレンダー上部アラート行（案C4）— 未確定・承認待ち共通 */

export function calAlertDateParts(dateStr, getDayStatus){
  const status = getDayStatus(dateStr);
  const d = new Date(`${dateStr}T00:00:00`);
  return {
    md: `${d.getMonth()+1}/${d.getDate()}`,
    weekday: status.weekday,
  };
}

export function buildCalAlertWhenPill(md, weekday, slotLabel){
  const wd = weekday ? `<span class="cal-alert-when-wd">（${weekday}）</span>` : '';
  return `<span class="cal-alert-when-pill">${md}${wd} ${slotLabel}</span>`;
}

export function buildCalAlertPersonHead(name, grade){
  const gradeHtml = grade ? `<span class="cal-alert-grade">（${grade}）</span>` : '';
  return `<span class="cal-alert-row-head">${name}${gradeHtml}</span>`;
}

export function buildCalAlertPersonInline(name, grade){
  return `<span class="cal-alert-person-inline">${name}（${grade}）</span>`;
}

export function buildCalAlertSubjectTag(subjectColor, level, subject){
  const c = subjectColor(level, subject);
  return `<span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${subject}</span>`;
}

export function buildCalAlertRowBody(parts){
  return `<div class="cal-alert-row-body">${parts.join('')}</div>`;
}

export function buildShortageAlertRowHtml({ whenPill, personHead, subjectTag, badgeHtml, dataAttrs = '' }){
  return `<button type="button" class="approval-item approval-item-btn cal-alert-row-c4"${dataAttrs}>
    ${buildCalAlertRowBody([whenPill, personHead, subjectTag])}
    ${badgeHtml}
  </button>`;
}

export function buildApprovalAlertRowHtml({ whenPill, teacherHead, personInline, subjectTag, badgeHtml, rowCls = '', dataAttrs = '', tag = 'button' }){
  const cls = `approval-item cal-alert-row-c4${rowCls}${tag === 'button' ? ' approval-item-btn' : ''}`;
  const inner = `${buildCalAlertRowBody([whenPill, teacherHead, personInline, subjectTag])}${badgeHtml}`;
  if(tag === 'button'){
    return `<button type="button" class="${cls}"${dataAttrs}>${inner}</button>`;
  }
  return `<div class="${cls}">${inner}</div>`;
}

/** カレンダー上部ステータスバーの見出し（件数バッジ） */
export function buildCalStatusSummaryHtml(chips, okLabel = '✓ すべて確定です'){
  if(!chips.length){
    return `<span class="cal-status-chip is-ok">${okLabel}</span>`;
  }
  return chips.map(chip=> `<span class="cal-status-chip is-${chip.kind}">${chip.text}</span>`).join('');
}
