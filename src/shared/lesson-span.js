/** 小学生の40分授業。講（90分）の前半・後半。無い half は90分。 */

export const SHORT_LESSON_MINUTES = 40;
export const SHORT_LESSON_LEVEL = '小学';
export const DEFAULT_SHORT_PAY_PERCENT = 50;

export function normalizeHalf(half){
  return half === 'early' || half === 'late' ? half : 'full';
}

export function isShortHalf(half){
  return normalizeHalf(half) !== 'full';
}

export function supportsShortLesson(level){
  return level === SHORT_LESSON_LEVEL;
}

export function shortLessonSubjectAllowed(subject){
  return !!subject && subject !== 'プログラミング';
}

export function halfLabel(half){
  const h = normalizeHalf(half);
  if(h === 'early') return '前半';
  if(h === 'late') return '後半';
  return '';
}

function parseRange(timeLabel){
  const m = String(timeLabel || '').match(/(\d{1,2}):(\d{2})\s*[〜~～\-]\s*(\d{1,2}):(\d{2})/);
  if(!m) return null;
  return {
    startMin: Number(m[1]) * 60 + Number(m[2]),
    endMin: Number(m[3]) * 60 + Number(m[4]),
  };
}

function formatClock(mins){
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

/** 講の開始から40分が前半。終了の40分前からが後半。あいだは10分。 */
export function slotSpanTimes(slot){
  const clocks = parseRange(slot?.time);
  if(!clocks) return null;
  const earlyEnd = clocks.startMin + SHORT_LESSON_MINUTES;
  const lateStart = clocks.endMin - SHORT_LESSON_MINUTES;
  return {
    full: `${formatClock(clocks.startMin)}〜${formatClock(clocks.endMin)}`,
    early: `${formatClock(clocks.startMin)}〜${formatClock(earlyEnd)}`,
    late: `${formatClock(lateStart)}〜${formatClock(clocks.endMin)}`,
  };
}

export function slotTimeForHalf(slot, half){
  const spans = slotSpanTimes(slot);
  if(!spans) return slot?.time || '';
  return spans[normalizeHalf(half)] || spans.full;
}

/** 90分の生徒は前半にも後半にもいる。40分は自分の半分だけ。 */
export function occupiesHalf(assignmentHalf, targetHalf){
  const a = normalizeHalf(assignmentHalf);
  const t = normalizeHalf(targetHalf);
  if(t === 'full') return a === 'full';
  return a === 'full' || a === t;
}

export function taughtHalves(assignments){
  const set = new Set();
  (assignments || []).forEach(a=>{
    const h = normalizeHalf(a?.half);
    if(h === 'full'){
      set.add('early');
      set.add('late');
    }else{
      set.add(h);
    }
  });
  return [...set];
}

export function hasFullLesson(assignments){
  return (assignments || []).some(a=> normalizeHalf(a?.half) === 'full');
}

/** 給与を掛ける回数。前半と後半の両方なら2。90分の生徒がいるときも2。 */
export function payBlocks(assignments){
  return taughtHalves(assignments).length;
}

/** 回数の数え方。90分が含まれる講は1コマ。40分だけなら教えた半分の数。 */
export function komaCountForTeacherSlot(assignments){
  if(!assignments || assignments.length === 0) return 0;
  if(hasFullLesson(assignments)) return 1;
  const n = taughtHalves(assignments).length;
  return n > 0 ? n : 0;
}

export function clampShortPayPercent(value){
  if(value == null || value === '') return DEFAULT_SHORT_PAY_PERCENT;
  const n = Number(value);
  if(!Number.isFinite(n) || n < 0) return DEFAULT_SHORT_PAY_PERCENT;
  if(n > 200) return 200;
  return Math.round(n);
}

/** その講の講師給。割合50%なら、90分（前半+後半）は今までどおり満額。 */
export function lessonPayForSlot(rate, percent, assignments){
  const blocks = payBlocks(assignments);
  if(blocks <= 0) return 0;
  const p = clampShortPayPercent(percent);
  return Math.round((Number(rate) || 0) * (p / 100) * blocks);
}
