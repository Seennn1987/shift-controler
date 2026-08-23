/** カレンダー上部アラート行（案C4）— 講師なし・承認待ち共通 */

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

export function buildCalAlertRowBody(parts, layout = 'full'){
  const layoutCls = layout === 'person' ? ' cal-alert-row-body--person' : ' cal-alert-row-body--full';
  return `<div class="cal-alert-row-body${layoutCls}">${parts.join('')}</div>`;
}

export function buildShortageAlertRowHtml({ whenPill, personHead, subjectTag, badgeHtml = '', dataAttrs = '' }){
  return `<button type="button" class="approval-item approval-item-btn cal-alert-row-c4"${dataAttrs}>
    ${buildCalAlertRowBody([whenPill, personHead, subjectTag], 'person')}${badgeHtml}
  </button>`;
}

export function buildApprovalAlertRowHtml({ whenPill, teacherHead, personInline, subjectTag, badgeHtml = '', rowCls = '', dataAttrs = '', tag = 'button' }){
  const cls = `approval-item cal-alert-row-c4${rowCls}${tag === 'button' ? ' approval-item-btn' : ''}`;
  const inner = `${buildCalAlertRowBody([whenPill, teacherHead, personInline, subjectTag], 'full')}${badgeHtml}`;
  if(tag === 'button'){
    return `<button type="button" class="${cls}"${dataAttrs}>${inner}</button>`;
  }
  return `<div class="${cls}">${inner}</div>`;
}

/** カレンダー上部ステータスバーの見出し（4段フロー＋件数KPI） */
function renderCalStatusKpiChip(chip){
  const count = chip.count ?? 0;
  const zeroCls = Number(count) === 0 ? ' is-zero' : '';
  return `<span class="cal-status-kpi is-${chip.kind}${zeroCls}">
    <span class="cal-status-kpi-label">${chip.label || ''}</span>
    <span class="cal-status-kpi-value"><span class="cal-status-kpi-num">${count}</span><span class="cal-status-kpi-unit">${chip.unit || ''}</span></span>
  </span>`;
}

export function buildCalWorkflowSummaryHtml(stages, extras = []){
  const flowParts = stages.map((chip, idx)=>{
    const arrow = idx < stages.length - 1
      ? '<span class="cal-status-flow-arrow" aria-hidden="true">→</span>'
      : '';
    return `${renderCalStatusKpiChip(chip)}${arrow}`;
  }).join('');
  const extrasHtml = extras.length
    ? `<span class="cal-status-kpi-extras">${extras.map(renderCalStatusKpiChip).join('')}</span>`
    : '';
  return `<span class="cal-status-flow">${flowParts}</span>${extrasHtml}`;
}

/** @deprecated 要対応バッジ型。フロー表示は buildCalWorkflowSummaryHtml を使う */
export function buildCalStatusSummaryHtml(chips, okLabel = '✓ すべて確定です'){
  if(!chips.length){
    return `<span class="cal-status-kpi is-ok"><span class="cal-status-kpi-label">${okLabel}</span></span>`;
  }
  const items = chips.map(chip=>{
    const label = chip.label || '';
    const count = chip.count ?? '';
    const unit = chip.unit || '';
    const note = chip.note ? `<span class="cal-status-kpi-note">${chip.note}</span>` : '';
    return `<span class="cal-status-kpi is-${chip.kind}">
      <span class="cal-status-kpi-label">${label}</span>
      <span class="cal-status-kpi-value"><span class="cal-status-kpi-num">${count}</span><span class="cal-status-kpi-unit">${unit}</span></span>
      ${note}
    </span>`;
  }).join('');
  return `<span class="cal-status-kpi-lead">要対応</span><span class="cal-status-kpi-group">${items}</span>`;
}
