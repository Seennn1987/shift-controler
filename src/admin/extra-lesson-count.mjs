/** 追加コマの数。画面や保存には触れない。 */

export function normHalf(half){
  return half === 'early' || half === 'late' ? half : 'full';
}

export function extraHoldFreesBecauseAbsent(hold, absences){
  if(!hold) return false;
  return (absences || []).some(ab =>
    ab.extraLineId === hold.extraLineId &&
    ab.date === hold.date &&
    Number(ab.slot) === Number(hold.slot) &&
    normHalf(ab.half) === normHalf(hold.half)
  );
}

/** 教室の人数に入れる、講師未定の席。欠席にした日は入れない。 */
export function liveExtraHolds(holds, absences, dateStr, slot, excludeStudentId){
  return (holds || []).filter(hold => {
    if(hold.date !== dateStr || Number(hold.slot) !== Number(slot)) return false;
    if(excludeStudentId && hold.studentId === excludeStudentId) return false;
    if(extraHoldFreesBecauseAbsent(hold, absences)) return false;
    return true;
  });
}

/** 追加コマの確定・仮決め・承認待ちで、欠席により席を空けるもの。毎週の授業は対象外。 */
export function extraSeatReleased(assignment, dateStr, absences){
  if(!assignment?.extraBookingId || !dateStr) return false;
  return (absences || []).some(ab =>
    ab.studentId === assignment.studentId &&
    ab.courseId === assignment.courseId &&
    ab.date === dateStr &&
    Number(ab.slot) === Number(assignment.slot) &&
    normHalf(ab.half) === normHalf(assignment.half)
  );
}

function slotKey(date, slot, half){
  return `${date}|${Number(slot)}|${normHalf(half)}`;
}

const PLACED_ROLES = [
  ['hold', '講師未定'],
  ['draft', '仮決め'],
  ['pending', '承認待ち'],
  ['confirmed', '確定'],
  ['waiting', '振替待ち'],
  ['teacherAbsent', '講師休み'],
];

/** 1科目分。申込数 = 未配置 + 配置済み + 実施済み + 消化 */
export function summarizeLine(line, ctx){
  const today = ctx.today;
  const holds = (ctx.holds || []).filter(h => h.extraLineId === line.id);
  const assignments = (ctx.assignments || []).filter(a => a.extraLineId === line.id);
  const absences = (ctx.absences || []).filter(a => a.extraLineId === line.id);
  const suppressed = new Set();
  const items = [];

  absences.forEach(ab => {
    suppressed.add(slotKey(ab.date, ab.slot, ab.half));
    if(ab.status === 'no-makeup'){
      items.push(item(line, 'consumed', '消化', ab.date, ab.slot, ab.half, { absenceId: ab.id }));
      return;
    }
    if(ab.status === 'pending'){
      items.push(item(line, 'waiting', '振替待ち', ab.date, ab.slot, ab.half, { absenceId: ab.id }));
    }
  });

  holds.forEach(hold => {
    if(suppressed.has(slotKey(hold.date, hold.slot, hold.half))) return;
    items.push(item(line, 'hold', '講師未定', hold.date, hold.slot, hold.half, { holdId: hold.id }));
  });

  assignments.forEach(assignment => {
    const date = assignment.oneTimeDate;
    if(!date) return;
    if(suppressed.has(slotKey(date, assignment.slot, assignment.half))) return;
    const teacherAbsent = ctx.isTeacherAbsent ? ctx.isTeacherAbsent(assignment) : false;
    let role = 'confirmed';
    let status = '確定';
    if(assignment.bucket === 'pending'){
      role = 'pending';
      status = '承認待ち';
    }else if(assignment.bucket === 'draft'){
      role = 'draft';
      status = '仮決め';
    }else if(teacherAbsent){
      role = 'teacherAbsent';
      status = '講師休み';
    }else if(date <= today){
      role = 'done';
      status = '実施済み';
    }
    items.push(item(line, role, status, date, assignment.slot, assignment.half, {
      assignmentId: assignment.id,
      teacherId: assignment.teacherId,
      bucket: assignment.bucket || 'confirmed',
    }));
  });

  const done = items.filter(row => row.role === 'done').length;
  const consumed = items.filter(row => row.role === 'consumed').length;
  const placedItems = items.filter(row => row.role !== 'done' && row.role !== 'consumed');
  const placed = placedItems.length;
  const requested = Number(line.count) || 0;
  const used = placed + done + consumed;
  return {
    requested,
    unplaced: Math.max(0, requested - used),
    placed,
    done,
    consumed,
    over: Math.max(0, used - requested),
    items,
    placedItems,
  };
}

function item(line, role, status, date, slot, half, extra){
  return {
    role,
    status,
    date,
    slot: Number(slot),
    half: normHalf(half),
    subject: line.subject,
    lineId: line.id,
    ...extra,
  };
}

export function summarizeBooking(booking, ctx){
  const lines = (booking.lines || []).map(line => ({ line, summary: summarizeLine(line, ctx) }));
  const sum = key => lines.reduce((total, row) => total + row.summary[key], 0);
  const placedItems = lines.flatMap(row => row.summary.placedItems);
  return {
    lines,
    requested: sum('requested'),
    unplaced: sum('unplaced'),
    placed: sum('placed'),
    done: sum('done'),
    consumed: sum('consumed'),
    over: sum('over'),
    placedItems,
  };
}

export function placedBreakdown(placedItems){
  const parts = [];
  PLACED_ROLES.forEach(([role, label]) => {
    const count = (placedItems || []).filter(row => row.role === role).length;
    if(count) parts.push(`${label} ${count}`);
  });
  return parts.join('、');
}

export function formatCountLine(summary){
  const breakdown = placedBreakdown(summary.placedItems);
  const placed = breakdown ? `配置済み ${summary.placed}（${breakdown}）` : `配置済み ${summary.placed}`;
  const consumed = summary.consumed ? `｜消化 ${summary.consumed}` : '';
  return `未配置 ${summary.unplaced}｜${placed}｜実施済み ${summary.done}${consumed}`;
}

/** 申込数をこの数に変えられるか。減らせない理由を返す。 */
export function countChangeBlock(summary, nextCount){
  const next = Number(nextCount) || 0;
  const kept = summary.done + summary.consumed;
  if(next < kept){
    return '実施済みと、振替なしにしたコマより少なくはできません。';
  }
  if(next < kept + summary.placed){
    return '先に日程を外してください。配置済みより少なくはできません。';
  }
  return '';
}
