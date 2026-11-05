import { SUBJECT_MAP, SLOTS, WEEKDAY_JP, SUBJECT_ABBR } from '../shared/constants.js';
import { halfLabel, occupiesHalf, shortLessonSubjectAllowed, slotTimeForHalf, supportsShortLesson } from '../shared/lesson-span.js';
import { getTodayStr, isOnOrAfterDate } from '../shared/date-utils.js';
import { fbAuth, S } from './state.js';
import { isActivePerson } from './active-people.js';
import { findTeacher, isOwnerTeacher } from './owner-teacher.js';
import { teacherSeatCap } from './one-to-one.js';
import { studentShortTuitionRate, studentTuitionRate } from './tuition-rates.js';
import { mountInlineConfirm } from '../shared/inline-confirm.js';
import {
  countChangeBlock,
  extraSeatReleased,
  formatCountLine,
  normHalf,
  summarizeBooking,
} from './extra-lesson-count.mjs';

let ui = {
  studentId: null,
  mode: 'list',
  bookingId: null,
  scheduleMonth: '',
  picks: [],
  pickDate: '',
  showCancelled: false,
};
let deps = {};
let flash = '';
let panelFlash = '';

export function setExtraLessonDeps(nextDeps){
  if(nextDeps) deps = nextDeps;
  ensureArrays();
}

function esc(value){
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function yen(amount){
  return `${Number(amount).toLocaleString('ja-JP')}円`;
}

function newId(prefix){
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

function actorName(){
  const email = fbAuth.currentUser?.email || '';
  const name = email.split('@')[0];
  return name || '教室長';
}

function weekdayOf(dateStr){
  return WEEKDAY_JP[new Date(`${dateStr}T00:00:00`).getDay()];
}

function slotDef(slotId){
  return SLOTS.find(slot => Number(slot.id) === Number(slotId));
}

function slotText(slotId, half){
  const slot = slotDef(slotId);
  const label = slot ? slot.label : `${slotId}講`;
  const halfText = halfLabel(half);
  return halfText ? `${label} ${halfText}` : label;
}

function dateText(dateStr){
  if(!dateStr) return '未定';
  const [, month, day] = dateStr.split('-');
  return `${Number(month)}/${Number(day)}（${weekdayOf(dateStr)}）`;
}

function periodText(booking){
  if(booking.periodStart && booking.periodEnd) return `${dateText(booking.periodStart)}〜${dateText(booking.periodEnd)}`;
  if(booking.periodStart) return `${dateText(booking.periodStart)}〜`;
  if(booking.periodEnd) return `〜${dateText(booking.periodEnd)}`;
  return '期間未定';
}

function courseIdFor(studentId, subject){
  return `ex-${studentId}-${subject}`;
}

function pushHistory(booking, action, before, after){
  booking.history = Array.isArray(booking.history) ? booking.history : [];
  booking.history.unshift({
    at: new Date().toISOString(),
    by: actorName(),
    action,
    before: before || '',
    after: after || '',
  });
  if(booking.history.length > 40) booking.history.length = 40;
  booking.updatedAt = new Date().toISOString();
}

function taggedAssignments(){
  const rows = [];
  (S.assignments || []).forEach(row => rows.push({ ...row, bucket: 'confirmed' }));
  (S.pendingAssignments || []).forEach(row => rows.push({ ...row, bucket: 'pending' }));
  (S.draftAssignments || []).forEach(row => rows.push({ ...row, bucket: 'draft' }));
  return rows;
}

function summaryFor(booking){
  return summarizeBooking(booking, {
    today: getTodayStr(),
    holds: S.extraHolds || [],
    assignments: taggedAssignments(),
    absences: S.absences || [],
    isTeacherAbsent: assignment => deps.isTeacherAbsent
      ? deps.isTeacherAbsent(assignment.teacherId, assignment.oneTimeDate, assignment.slot, assignment.studentId)
      : false,
  });
}

function bookingsFor(studentId){
  return (S.extraBookings || []).filter(booking => booking.studentId === studentId);
}

function findBooking(id){
  return (S.extraBookings || []).find(booking => booking.id === id) || null;
}

function lineById(booking, lineId){
  return (booking?.lines || []).find(line => line.id === lineId) || null;
}

function subjectLine(booking){
  const parts = (booking.lines || []).map(line => `${line.subject}${line.count}`);
  return `${parts.join('・')}｜合計${(booking.lines || []).reduce((sum, line) => sum + (Number(line.count) || 0), 0)}コマ`;
}

function lineMinutes(line){
  if(line?.minutes === 40 || line?.minutes === 90) return line.minutes;
  return line?.half === 'early' || line?.half === 'late' ? 40 : 90;
}

function priceFor(student, subject, half, oneToOne){
  if(subject === 'プログラミング'){
    return { status: 'monthly', unitPrice: null, label: '月額に含む' };
  }
  const short = half === 'early' || half === 'late';
  if(short && (!supportsShortLesson(student?.level) || !shortLessonSubjectAllowed(subject))){
    return { status: 'unconfirmed', unitPrice: null, label: '要確認' };
  }
  let rate = 0;
  if(oneToOne && short) rate = studentShortTuitionRate(S.tuitionGradeRatesShortOne, student);
  else if(oneToOne) rate = studentTuitionRate(S.tuitionGradeRatesOne, student);
  else if(short) rate = studentShortTuitionRate(S.tuitionGradeRatesShort, student);
  else rate = studentTuitionRate(S.tuitionGradeRates, student);
  if(!student?.level || !rate) return { status: 'unconfirmed', unitPrice: null, label: '要確認' };
  return { status: 'estimated', unitPrice: rate, label: yen(rate) };
}

function priceSummary(lines){
  let known = 0;
  let unknown = false;
  let monthly = false;
  lines.forEach(line => {
    if(line.priceStatus === 'monthly') monthly = true;
    else if(line.priceStatus !== 'estimated' || line.unitPrice == null) unknown = true;
    else known += line.unitPrice * (Number(line.count) || 0);
  });
  const parts = [];
  if(known) parts.push(yen(known));
  if(unknown) parts.push('要確認');
  if(monthly) parts.push('月額に含む');
  return parts.join('・') || '要確認';
}

function priceNotes(student){
  const notes = [];
  if((student?.freeLessonCount || 0) > 0){
    notes.push(`最初の${student.freeLessonCount}コマを無料にする設定です。確定した授業から順に使われます。`);
  }
  const discounts = student?.discounts;
  if(discounts && (discounts.initial || discounts.annual || discounts.monthly)){
    notes.push('入会金などの割引は、この授業料には反映されません。');
  }
  notes.push('ここに出る金額は見込みです。売上と給与に入るのは、講師が決まって確定した授業の日だけです。');
  return notes;
}

function halfOverlaps(a, b){
  return occupiesHalf(a, 'early') && occupiesHalf(b, 'early')
    || occupiesHalf(a, 'late') && occupiesHalf(b, 'late');
}

function studentBusy(student, dateStr, slot, half, ignore){
  const weekday = weekdayOf(dateStr);
  const lists = []
    .concat(S.assignments || [], S.pendingAssignments || [], S.draftAssignments || []);
  const hit = lists.some(row => {
    if(ignore && ignore.assignmentId === row.id) return false;
    if(row.studentId !== student.id || Number(row.slot) !== Number(slot)) return false;
    if(!halfOverlaps(row.half, half)) return false;
    if(row.oneTimeDate){
      if(row.oneTimeDate !== dateStr) return false;
    }else if(row.day !== weekday || (row.skippedDates || []).includes(dateStr)){
      return false;
    }
    return !(S.absences || []).some(ab =>
      ab.studentId === row.studentId && ab.courseId === row.courseId && ab.date === dateStr && Number(ab.slot) === Number(slot)
    );
  });
  if(hit) return true;
  return (S.extraHolds || []).some(hold =>
    hold.studentId === student.id &&
    hold.date === dateStr &&
    Number(hold.slot) === Number(slot) &&
    halfOverlaps(hold.half, half) &&
    !(S.absences || []).some(ab => ab.extraLineId === hold.extraLineId && ab.date === dateStr)
  );
}

function addedOccupying(picks, dateStr, slot, half){
  return picks.filter(pick =>
    pick.date === dateStr && Number(pick.slot) === Number(slot) && halfOverlaps(pick.half, half)
  ).length;
}

function roomUsed(student, dateStr, slot, half, picks){
  const ask = half === 'full' ? [undefined] : [half];
  if(half === 'full'){
    const early = deps.countRoomSlotOnDate(dateStr, slot, student.id, 'early') + addedOccupying(picks, dateStr, slot, 'early');
    const late = deps.countRoomSlotOnDate(dateStr, slot, student.id, 'late') + addedOccupying(picks, dateStr, slot, 'late');
    return Math.max(early, late);
  }
  return deps.countRoomSlotOnDate(dateStr, slot, student.id, ask[0]) + addedOccupying(picks, dateStr, slot, half);
}

function ensureArrays(){
  if(!Array.isArray(S.extraBookings)) S.extraBookings = [];
  if(!Array.isArray(S.extraHolds)) S.extraHolds = [];
}

function resetUi(studentId){
  if(ui.studentId === studentId) return;
  ui = {
    studentId,
    mode: 'list',
    bookingId: null,
    scheduleMonth: '',
    picks: [],
    pickDate: '',
    showCancelled: false,
  };
}

export function focusExtraBooking(studentId, bookingId){
  ui.studentId = studentId;
  ui.mode = 'detail';
  ui.bookingId = bookingId;
  ui.picks = [];
  ui.pickDate = '';
}

export function renderExtraLessonSection(host, nextDeps){
  if(!host) return;
  deps = nextDeps || deps;
  ensureArrays();
  const studentId = S.editingStudentId;
  resetUi(studentId);
  if(!studentId){
    host.innerHTML = `<div class="extra-lesson-section">
      <div class="extra-lesson-head"><span class="field-label">追加コマ</span></div>
      <p class="field-hint">「基本情報を登録」を押すと、追加コマを登録できます。</p>
    </div>`;
    return;
  }
  const student = S.students.find(row => row.id === studentId);
  if(!student) return;
  host.innerHTML = `<div class="extra-lesson-section">${sectionHtml(student)}</div>`;
  if(flash){
    host.querySelector('.extra-lesson-section')?.insertAdjacentHTML('afterbegin', `<p class="form-msg" role="status">${esc(flash)}</p>`);
    flash = '';
  }
  bindSection(host, student);
}

function sectionHtml(student){
  if(ui.mode === 'form') return formHtml(student, findBooking(ui.bookingId));
  if(ui.mode === 'choose') return chooseHtml(student, findBooking(ui.bookingId));
  if(ui.mode === 'detail') return detailHtml(student, findBooking(ui.bookingId));
  return listHtml(student);
}

function listHtml(student){
  const rows = bookingsFor(student.id);
  const active = rows.filter(row => !row.cancelledAt);
  const cancelled = rows.filter(row => row.cancelledAt);
  const cards = active.length
    ? active.map(booking => bookingCardHtml(booking)).join('')
    : '<p class="field-hint">追加コマはまだありません。通常の授業とは別に、必要なコマ数を先に登録できます。</p>';
  const cancelledHtml = cancelled.length ? `<div class="extra-lesson-cancelled">
      <button type="button" class="confirm-btn" data-action="toggle-cancelled">${ui.showCancelled ? '取り消した申込みを閉じる' : `取り消した申込み ${cancelled.length}`}</button>
      ${ui.showCancelled ? cancelled.map(booking => `<div class="extra-lesson-card is-cancelled">
        <div class="extra-lesson-title">${esc(booking.purposeLabel)}｜${esc(subjectLine(booking))}</div>
        <p class="field-hint">取り消した申込みです。配置済みの授業には戻していません。</p>
      </div>`).join('') : ''}
    </div>` : '';
  return `<div class="extra-lesson-head">
      <span class="field-label">追加コマ</span>
      <button type="button" class="confirm-btn" data-action="add">追加コマを登録</button>
    </div>
    ${cards}
    ${cancelledHtml}`;
}

function countHtml(summary){
  return formatCountLine(summary)
    .split('｜')
    .map(part => `<span class="extra-count-part">${esc(part)}</span>`)
    .join('<span class="extra-count-sep">｜</span>');
}

function bookingCardHtml(booking){
  const summary = summaryFor(booking);
  return `<div class="extra-lesson-card">
    <div class="extra-lesson-title">${esc(booking.purposeLabel)}｜${esc(subjectLine(booking))}</div>
    <p class="extra-lesson-count">${countHtml(summary)}</p>
    <p class="field-hint">${esc(periodText(booking))}｜見込み ${esc(priceSummary(booking.lines || []))}</p>
    <div class="extra-lesson-actions">
      <button type="button" class="confirm-btn" data-action="schedule" data-id="${esc(booking.id)}">日程を決める</button>
      <button type="button" class="confirm-btn" data-action="detail" data-id="${esc(booking.id)}">詳細・変更</button>
    </div>
  </div>`;
}

function formHtml(student, booking){
  const level = student.level;
  const subjects = SUBJECT_MAP[level] || [];
  const enrolled = new Set((student.courses || []).map(course => course.subject));
  const existing = new Map((booking?.lines || []).map(line => [line.subject, line]));
  const shortDefault = (student.courses || []).some(course =>
    (course.desiredSlots || []).some(slot => slot.half === 'early' || slot.half === 'late')
  );
  const oneDefault = booking
    ? (booking.lines || []).some(line => line.oneToOne)
    : (student.courses || []).some(course => course.oneToOne);
  const minutes = booking
    ? ((booking.lines || []).some(line => lineMinutes(line) === 40) ? 40 : 90)
    : (shortDefault ? 40 : 90);
  const purpose = booking?.purpose || 'extra';
  const rows = subjects.map(subject => {
    const count = existing.get(subject)?.count || '';
    const mark = enrolled.has(subject) ? '' : ' <span class="field-hint">毎週は未受講</span>';
    return `<label class="extra-subject-row"><span>${esc(subject)}${mark}</span>
      <input type="text" inputmode="numeric" class="extra-count" data-subject="${esc(subject)}" value="${esc(count)}" placeholder="0" aria-label="${esc(subject)}のコマ数">
    </label>`;
  }).join('');
  const terms = (S.terms || []).map(term =>
    `<option value="${esc(term.id)}" ${booking?.termId === term.id ? 'selected' : ''}>${esc(term.name)}</option>`
  ).join('');
  return `<div class="extra-lesson-head"><span class="field-label">${booking ? '追加コマを変更' : '追加コマを登録'}</span></div>
    <p class="field-hint">目的と科目のコマ数だけでも保存できます。日程と講師はあとから決められます。</p>
    <div class="field-label">追加の目的・名称</div>
    <div class="chip-row">
      ${purposeChoice('extra', '通常の追加授業', purpose)}
      ${purposeChoice('seasonal', '季節講習', purpose)}
      ${purposeChoice('custom', '自由記入', purpose)}
    </div>
    <div data-panel="seasonal" ${purpose === 'seasonal' ? '' : 'hidden'}>
      <label class="field-label" for="extraTerm">講習</label>
      <select id="extraTerm">${terms || '<option value="">講習期間はまだありません</option>'}</select>
    </div>
    <div data-panel="custom" ${purpose === 'custom' ? '' : 'hidden'}>
      <label class="field-label" for="extraCustom">名称</label>
      <input type="text" id="extraCustom" value="${esc(booking?.purpose === 'custom' ? booking.purposeLabel : '')}" placeholder="例：テスト前の追加">
    </div>
    <div class="field-label">科目とコマ数</div>
    <div class="extra-subject-list">${rows}</div>
    <p class="extra-lesson-count" id="extraTotal">合計 0コマ</p>
    <div class="field-label">授業時間・形式</div>
    <div class="chip-row">
      ${radio('extraMinutes', '90', '90分', minutes === 90)}
      ${supportsShortLesson(level) ? radio('extraMinutes', '40', '40分', minutes === 40) : ''}
      ${radio('extraFormat', 'pair', '1対2', !oneDefault)}
      ${radio('extraFormat', 'one', '1対1', oneDefault)}
    </div>
    <p class="field-hint">この申込みの科目に同じ時間と形式を使います。プログラミングは90分のままです。40分は小学だけです。</p>
    <div class="field-label">対象期間</div>
    <div class="extra-period">
      <input type="date" id="extraStart" value="${esc(booking?.periodStart || '')}" aria-label="開始日">
      <span>〜</span>
      <input type="date" id="extraEnd" value="${esc(booking?.periodEnd || '')}" aria-label="終了日">
    </div>
    <p class="field-hint">未定のまま保存できます。</p>
    <div class="field-label">料金の見込み</div>
    <div id="extraPriceBox" class="extra-lesson-card"></div>
    <div class="extra-lesson-actions">
      <button type="button" class="confirm-btn" data-action="save-form">${booking ? '変更を保存' : '登録する'}</button>
      <button type="button" class="confirm-btn" data-action="back">やめる</button>
    </div>
    <p class="form-msg" id="extraFormMsg" role="status"></p>`;
}

function purposeChoice(value, label, current){
  return `<label class="chip"><input type="radio" name="extraPurpose" value="${value}" ${current === value ? 'checked' : ''}><span>${label}</span></label>`;
}

function radio(name, value, label, checked){
  return `<label class="chip"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
}

function chooseHtml(student, booking){
  if(!booking) return listHtml(student);
  return `<div class="extra-lesson-card">
    <div class="extra-lesson-title">${esc(booking.purposeLabel)}を登録しました</div>
    <p class="extra-lesson-count">${esc(subjectLine(booking))}</p>
    <p class="field-hint">日程は、いつもの月カレンダーで日を押して決めます。</p>
    <div class="extra-lesson-actions">
      <button type="button" class="confirm-btn" data-action="schedule" data-id="${esc(booking.id)}">今すぐ日程を決める</button>
      <button type="button" class="confirm-btn" data-action="back">あとで決める</button>
    </div>
  </div>`;
}

function openLines(booking){
  const summary = summaryFor(booking);
  return summary.lines
    .map(row => ({ line: row.line, summary: row.summary, left: row.summary.unplaced }))
    .filter(row => row.left > 0);
}

export function slotChoicesForLines(lines){
  const has40 = (lines || []).some(row => lineMinutes(row.line || row) === 40);
  const has90 = (lines || []).some(row => lineMinutes(row.line || row) !== 40);
  const choices = [];
  if(has90 || !has40) choices.push('full');
  if(has40) choices.push('early', 'late');
  return choices;
}

export function extraDayPanelHtml(student, dateStr){
  if(!student || !dateStr || !deps.getDayStatus) return '';
  if(deps.getDayStatus(dateStr).type !== 'open') return '';
  const note = panelFlash ? `<p class="form-msg" role="status">${esc(panelFlash)}</p>` : '';
  panelFlash = '';
  const blocks = bookingsFor(student.id).filter(booking => !booking.cancelledAt).map(booking => {
    const lines = openLines(booking);
    if(!lines.length) return '';
    const choices = slotChoicesForLines(lines);
    const cards = SLOTS.map(slot => choices.map(half => extraSlotCard(student, booking, lines, dateStr, slot, half)).join('')).join('');
    return `<div class="cal-day-note">${esc(booking.purposeLabel)}の残りを、この日に入れられます。</div>${cards}`;
  }).join('');
  return blocks ? `${note}${blocks}` : note;
}

function extraSlotCard(student, booking, lines, dateStr, slot, half){
  const fitting = lines.filter(row => lineMinutes(row.line) === 40 ? half !== 'full' : half === 'full');
  if(!fitting.length) return '';
  const used = roomUsed(student, dateStr, slot.id, half, []);
  const full = used >= S.roomCapacity;
  const when = half === 'full' ? '' : ` ${halfLabel(half)}`;
  const time = half === 'full' ? slot.time : slotTimeForHalf(slot, half);
  const subjects = fitting.map(row => {
    const reason = holdBlock(student, row.line, dateStr, slot.id, half, [], booking);
    return `<button type="button" class="confirm-btn" data-extra-subject="1" data-extra-booking="${esc(booking.id)}" data-extra-line="${esc(row.line.id)}" data-extra-date="${esc(dateStr)}" data-extra-slot="${slot.id}" data-extra-half="${esc(half)}" ${reason ? 'disabled' : ''}>${esc(row.line.subject)} 残り${row.left}${reason ? ` ${esc(reason)}` : ''}</button>`;
  }).join('');
  return `<div class="match-slot mp-slot-card">
    <div class="ms-slot-label">${esc(slot.label)}${esc(when)}（${esc(time)}）<span class="mp-slot-meta">教室 ${used}/${S.roomCapacity}${full ? ' 満席' : ''}</span></div>
    <div class="extra-lesson-actions">${subjects}</div>
    <div class="extra-teacher-mount"></div>
  </div>`;
}

export function bindExtraDayPanel(root, student, onPlaced){
  if(!root || !student) return;
  root.querySelectorAll('[data-extra-subject]').forEach(btn => btn.addEventListener('click', () => {
    const booking = findBooking(btn.dataset.extraBooking);
    const line = lineById(booking, btn.dataset.extraLine);
    const mount = btn.closest('.mp-slot-card')?.querySelector('.extra-teacher-mount');
    if(!booking || !line || !mount) return;
    const date = btn.dataset.extraDate;
    const slot = Number(btn.dataset.extraSlot);
    const half = lineMinutes(line) === 40 ? btn.dataset.extraHalf : 'full';
    mount.innerHTML = extraTeacherRows(student, booking, line, date, slot, half);
    mount.querySelectorAll('[data-extra-teacher]').forEach(teacherBtn => teacherBtn.addEventListener('click', async () => {
      const result = await placeExtraLesson(student, {
        bookingId: booking.id,
        lineId: line.id,
        date,
        slot,
        half,
        teacherId: teacherBtn.dataset.extraTeacher || '',
      });
      panelFlash = result.msg || '';
      if(onPlaced) onPlaced();
    }));
  }));
}

function extraTeacherRows(student, booking, line, date, slot, half){
  const rows = (S.teachers || []).filter(isActivePerson).map((teacher, index) => {
    const reason = teacherBlock(student, line, teacher, date, slot, half, [], booking);
    return `<div class="match-cand-row">
      <span class="match-cand-rank">${index + 1}</span>
      <div class="match-cand-main">
        <div class="match-cand-head">
          <span class="match-cand-name">${esc(teacher.name)}</span>
          <div class="match-cand-actions"><button type="button" class="confirm-btn" data-extra-teacher="${esc(teacher.id)}" ${reason ? 'disabled' : ''}>この日に入れる${reason ? ` ${esc(reason)}` : ''}</button></div>
        </div>
      </div>
    </div>`;
  }).join('');
  const holdReason = holdBlock(student, line, date, slot, half, [], booking);
  return `<div class="match-slot-rows">${rows}
    <div class="match-cand-row">
      <span class="match-cand-rank"></span>
      <div class="match-cand-main">
        <div class="match-cand-head">
          <span class="match-cand-name">講師はあとで</span>
          <div class="match-cand-actions"><button type="button" class="confirm-btn" data-extra-teacher="" ${holdReason ? 'disabled' : ''}>講師はあとで${holdReason ? ` ${esc(holdReason)}` : ''}</button></div>
        </div>
      </div>
    </div>
  </div>`;
}

function detailHtml(student, booking){
  if(!booking) return listHtml(student);
  const summary = summaryFor(booking);
  const lineEditors = summary.lines.map(row => `<label class="extra-subject-row"><span>${esc(row.line.subject)}</span>
    <input type="text" inputmode="numeric" class="extra-count" data-line="${esc(row.line.id)}" value="${esc(row.line.count)}" aria-label="${esc(row.line.subject)}の申込数">
  </label>`).join('');
  const items = summary.lines.flatMap(row => row.summary.items.map(itemRow => itemHtml(student, booking, itemRow)));
  const history = (booking.history || []).slice(0, 8).map(row =>
    `<li>${esc(historyWhen(row.at))} ${esc(row.by)} ${esc(row.action)}${row.before || row.after ? `（${esc(row.before)} → ${esc(row.after)}）` : ''}</li>`
  ).join('');
  const draftCount = draftIdsOf(summary).size;
  return `<div class="extra-lesson-head"><span class="field-label">詳細・変更</span></div>
    <div class="extra-lesson-card" id="extraDetailCard">
      <div class="extra-lesson-title">${esc(booking.purposeLabel)}｜${esc(subjectLine(booking))}</div>
      <p class="extra-lesson-count">${countHtml(summary)}</p>
      <p class="field-hint">${esc(periodText(booking))}｜見込み ${esc(priceSummary(booking.lines || []))}</p>
      <div class="field-label">各回</div>
      ${items.length ? items.join('') : '<p class="field-hint">まだ日程はありません。</p>'}
      <div class="field-label">申込数</div>
      <div class="extra-subject-list">${lineEditors}</div>
      <div class="extra-lesson-actions">
        <button type="button" class="confirm-btn" data-action="save-counts">申込数を保存</button>
        <button type="button" class="confirm-btn" data-action="edit">名称・期間を変更</button>
        <button type="button" class="confirm-btn" data-action="schedule" data-id="${esc(booking.id)}">日程を決める</button>
        ${draftCount ? '<button type="button" class="confirm-btn" data-action="send-drafts">講師にスケジュールを送信</button>' : ''}
        <button type="button" class="danger-ghost" data-action="cancel-booking">申込みを取り消す</button>
        <button type="button" class="confirm-btn" data-action="back">一覧へ戻る</button>
      </div>
      ${history ? `<div class="field-label">変更の履歴</div><ul class="extra-history">${history}</ul>` : ''}
      <p class="form-msg" id="extraFormMsg" role="status"></p>
    </div>`;
}

function itemHtml(student, booking, row){
  const teacher = row.teacherId ? findTeacher(row.teacherId) : null;
  const who = row.role === 'hold' ? '講師未定' : (teacher ? teacher.name : '講師未定');
  const actions = [];
  if(row.role !== 'done' && row.role !== 'consumed'){
    actions.push(`<button type="button" class="confirm-btn" data-action="unplace" data-role="${esc(row.role)}" data-id="${esc(row.holdId || row.assignmentId || row.absenceId || '')}">日程を外す</button>`);
  }
  if(row.role === 'hold' || row.role === 'draft' || row.role === 'pending' || row.role === 'confirmed' || row.role === 'teacherAbsent'){
    actions.push(`<button type="button" class="confirm-btn" data-action="absent" data-id="${esc(row.holdId || row.assignmentId || '')}" data-role="${esc(row.role)}">欠席にする</button>`);
  }
  if(row.role === 'waiting'){
    actions.push(`<button type="button" class="confirm-btn" data-action="makeup" data-id="${esc(row.absenceId)}">振替先を選ぶ</button>`);
    actions.push(`<button type="button" class="confirm-btn" data-action="no-makeup" data-id="${esc(row.absenceId)}">振替なし</button>`);
    actions.push(`<button type="button" class="confirm-btn" data-action="undo-absence" data-id="${esc(row.absenceId)}">欠席を取り消す</button>`);
  }
  return `<div class="extra-item">
    <span class="match-status-badge ${badgeClass(row.role)}">${esc(row.status)}</span>
    <span>${esc(row.subject)}｜${esc(dateText(row.date))} ${esc(slotText(row.slot, row.half))}｜${esc(who)}</span>
    <span class="extra-lesson-actions">${actions.join('')}</span>
  </div>`;
}

function badgeClass(role){
  if(role === 'done' || role === 'confirmed') return 'is-ready';
  if(role === 'pending' || role === 'waiting' || role === 'hold') return 'is-priority';
  if(role === 'consumed' || role === 'teacherAbsent') return 'is-no-capable';
  return 'is-no-shift';
}

function historyWhen(iso){
  if(!iso) return '';
  const date = new Date(iso);
  if(Number.isNaN(date.getTime())) return iso;
  return `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function bindSection(host, student){
  host.querySelectorAll('[data-action="add"]').forEach(btn => btn.addEventListener('click', () => {
    ui.mode = 'form';
    ui.bookingId = null;
    deps.refresh();
  }));
  host.querySelectorAll('[data-action="back"]').forEach(btn => btn.addEventListener('click', () => {
    ui.mode = 'list';
    ui.picks = [];
    ui.pickDate = '';
    deps.refresh();
  }));
  host.querySelectorAll('[data-action="detail"]').forEach(btn => btn.addEventListener('click', () => {
    ui.mode = 'detail';
    ui.bookingId = btn.dataset.id || ui.bookingId;
    ui.picks = [];
    deps.refresh();
  }));
  host.querySelectorAll('[data-action="schedule"]').forEach(btn => btn.addEventListener('click', () => {
    const booking = findBooking(btn.dataset.id || ui.bookingId);
    if(booking && deps.openCalendar) deps.openCalendar(booking);
  }));
  host.querySelectorAll('[data-action="edit"]').forEach(btn => btn.addEventListener('click', () => {
    ui.mode = 'form';
    deps.refresh();
  }));
  host.querySelectorAll('[data-action="toggle-cancelled"]').forEach(btn => btn.addEventListener('click', () => {
    ui.showCancelled = !ui.showCancelled;
    deps.refresh();
  }));
  host.querySelectorAll('[name="extraPurpose"]').forEach(input => input.addEventListener('change', () => {
    host.querySelector('[data-panel="seasonal"]').hidden = input.value !== 'seasonal' || !input.checked;
    host.querySelector('[data-panel="custom"]').hidden = host.querySelector('[name="extraPurpose"]:checked')?.value !== 'custom';
    const seasonal = host.querySelector('[name="extraPurpose"]:checked')?.value === 'seasonal';
    host.querySelector('[data-panel="seasonal"]').hidden = !seasonal;
    if(seasonal) applyTermDates(host);
  }));
  const term = host.querySelector('#extraTerm');
  term?.addEventListener('change', () => applyTermDates(host));
  host.querySelectorAll('input').forEach(input => input.addEventListener('input', () => paintPrice(host, student)));
  paintPrice(host, student);
  host.querySelector('[data-action="save-form"]')?.addEventListener('click', () => saveForm(host, student));
  host.querySelector('[data-action="save-counts"]')?.addEventListener('click', () => saveCounts(host, student));
  host.querySelector('[data-action="send-drafts"]')?.addEventListener('click', event => {
    const booking = findBooking(ui.bookingId);
    if(!booking) return;
    mountInlineConfirm(host, event.currentTarget, {
      message: sendConfirmText(booking),
      confirmLabel: '送信する',
      cancelLabel: 'やめる',
      variant: 'primary',
      mountSelector: '.extra-lesson-card',
      onConfirm: () => sendBookingDrafts(booking),
    });
  });
  host.querySelector('[data-action="cancel-booking"]')?.addEventListener('click', event => {
    mountInlineConfirm(host, event.currentTarget, {
      message: 'この申込みを取り消しますか？実施済みがある場合は取り消せません。',
      confirmLabel: '取り消す',
      cancelLabel: 'やめる',
      variant: 'danger',
      mountSelector: '.extra-lesson-card',
      onConfirm: () => cancelBooking(student),
    });
  });
  host.querySelectorAll('[data-action="unplace"]').forEach(btn => btn.addEventListener('click', event => {
    mountInlineConfirm(host, event.currentTarget, {
      message: 'この日程を外して、未配置に戻しますか？',
      confirmLabel: '外す',
      cancelLabel: 'やめる',
      variant: 'danger',
      mountSelector: '.extra-lesson-card',
      onConfirm: () => unplace(student, btn.dataset.role, btn.dataset.id),
    });
  }));
  host.querySelectorAll('[data-action="absent"]').forEach(btn => btn.addEventListener('click', event => {
    mountInlineConfirm(host, event.currentTarget, {
      message: 'この日を欠席にしますか？授業料には入らず、振替先が決まるまで残します。',
      confirmLabel: '欠席にする',
      cancelLabel: 'やめる',
      variant: 'primary',
      mountSelector: '.extra-lesson-card',
      onConfirm: () => markAbsent(student, btn.dataset.role, btn.dataset.id),
    });
  }));
  host.querySelectorAll('[data-action="no-makeup"]').forEach(btn => btn.addEventListener('click', event => {
    mountInlineConfirm(host, event.currentTarget, {
      message: '振替なしにしますか？この1コマは消化になり、もう一度は使えません。',
      confirmLabel: '振替なしにする',
      cancelLabel: 'やめる',
      variant: 'danger',
      mountSelector: '.extra-lesson-card',
      onConfirm: () => {
        deps.markNoMakeup(btn.dataset.id);
        const booking = findBooking(ui.bookingId);
        if(booking) pushHistory(booking, '振替なし', '', '消化');
        return saved('振替なしにしました。');
      },
    });
  }));
  host.querySelectorAll('[data-action="undo-absence"]').forEach(btn => btn.addEventListener('click', () => {
    undoAbsence(student, btn.dataset.id);
  }));
  host.querySelectorAll('[data-action="makeup"]').forEach(btn => btn.addEventListener('click', () => {
    deps.openMakeupCalendar(btn.dataset.id);
  }));
}

function applyTermDates(host){
  const term = (S.terms || []).find(row => row.id === host.querySelector('#extraTerm')?.value);
  if(!term) return;
  const start = host.querySelector('#extraStart');
  const end = host.querySelector('#extraEnd');
  if(start && !start.value) start.value = term.startDate || '';
  if(end && !end.value) end.value = term.endDate || '';
}

function paintPrice(host, student){
  const total = host.querySelector('#extraTotal');
  const box = host.querySelector('#extraPriceBox');
  if(!total || !box) return;
  const draft = readForm(host, student);
  const count = draft.lines.reduce((sum, line) => sum + line.count, 0);
  total.textContent = `合計 ${count}コマ`;
  const rows = draft.lines.map(line => `<div>${esc(line.subject)} ${line.count}コマ × ${esc(line.priceLabel)}</div>`).join('');
  const notes = priceNotes(student).map(note => `<p class="field-hint">${esc(note)}</p>`).join('');
  box.innerHTML = `${rows || '<p class="field-hint">コマ数を入れると、見込み金額が出ます。</p>'}
    <p class="extra-lesson-count">合計 ${esc(priceSummary(draft.lines))}</p>${notes}`;
}

function readForm(host, student){
  const purpose = host.querySelector('[name="extraPurpose"]:checked')?.value || 'extra';
  const minutes = host.querySelector('[name="extraMinutes"]:checked')?.value === '40' ? 40 : 90;
  const oneToOne = host.querySelector('[name="extraFormat"]:checked')?.value === 'one';
  const lines = [];
  host.querySelectorAll('[data-subject]').forEach(input => {
    const count = Math.min(99, Math.max(0, parseInt(input.value, 10) || 0));
    if(!count) return;
    const subject = input.dataset.subject;
    const lineMinutesValue = subject === 'プログラミング' || !supportsShortLesson(student.level) || !shortLessonSubjectAllowed(subject) ? 90 : minutes;
    const price = priceFor(student, subject, lineMinutesValue === 40 ? 'early' : 'full', oneToOne);
    lines.push({
      id: '',
      subject,
      courseId: courseIdFor(student.id, subject),
      count,
      oneToOne,
      minutes: lineMinutesValue,
      priceStatus: price.status,
      unitPrice: price.unitPrice,
      priceLabel: price.label,
    });
  });
  let purposeLabel = '通常の追加授業';
  let termId = '';
  if(purpose === 'seasonal'){
    const term = (S.terms || []).find(row => row.id === host.querySelector('#extraTerm')?.value);
    purposeLabel = term?.name || '季節講習';
    termId = term?.id || '';
  }else if(purpose === 'custom'){
    purposeLabel = host.querySelector('#extraCustom')?.value.trim() || '';
  }
  return {
    purpose,
    purposeLabel,
    termId,
    periodStart: host.querySelector('#extraStart')?.value || '',
    periodEnd: host.querySelector('#extraEnd')?.value || '',
    lines,
  };
}

function saveForm(host, student){
  const msg = host.querySelector('#extraFormMsg');
  const draft = readForm(host, student);
  if(draft.purpose === 'custom' && !draft.purposeLabel){
    msg.textContent = '名称を入力してください。';
    return;
  }
  if(!draft.lines.length){
    msg.textContent = '科目のコマ数を1以上にしてください。';
    return;
  }
  if(draft.periodStart && draft.periodEnd && draft.periodStart > draft.periodEnd){
    msg.textContent = '期間の終わりは、開始より前にできません。';
    return;
  }
  ensureArrays();
  const existing = findBooking(ui.bookingId);
  if(existing){
    const current = summaryFor(existing);
    for(const line of draft.lines){
      const prev = (existing.lines || []).find(row => row.subject === line.subject);
      const summary = current.lines.find(row => row.line.id === prev?.id)?.summary;
      if(summary){
        const block = countChangeBlock(summary, line.count);
        if(block){
          msg.textContent = `${line.subject}：${block}`;
          return;
        }
      }
    }
    const removed = (existing.lines || []).filter(line => !draft.lines.some(row => row.subject === line.subject));
    for(const line of removed){
      const summary = current.lines.find(row => row.line.id === line.id)?.summary;
      if(summary && (summary.placed || summary.done || summary.consumed)){
        msg.textContent = `${line.subject}は日程があるので、コマ数を0にはできません。先に日程を外してください。`;
        return;
      }
    }
    const before = subjectLine(existing);
    existing.purpose = draft.purpose;
    existing.purposeLabel = draft.purposeLabel;
    existing.termId = draft.termId;
    existing.periodStart = draft.periodStart;
    existing.periodEnd = draft.periodEnd;
    existing.lines = draft.lines.map(line => {
      const prev = (existing.lines || []).find(row => row.subject === line.subject);
      const { priceLabel, ...rest } = line;
      return { ...rest, id: prev?.id || newId('exl') };
    });
    pushHistory(existing, '申込みを変更', before, subjectLine(existing));
    ui.mode = 'detail';
    ui.bookingId = existing.id;
  }else{
    const booking = {
      id: newId('exb'),
      studentId: student.id,
      purpose: draft.purpose,
      purposeLabel: draft.purposeLabel,
      termId: draft.termId,
      periodStart: draft.periodStart,
      periodEnd: draft.periodEnd,
      lines: draft.lines.map(line => {
        const { priceLabel, ...rest } = line;
        return { ...rest, id: newId('exl') };
      }),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cancelledAt: '',
      history: [],
    };
    pushHistory(booking, '申込みを登録', '', subjectLine(booking));
    S.extraBookings.push(booking);
    ui.mode = 'choose';
    ui.bookingId = booking.id;
  }
  deps.scheduleSave();
  deps.refresh();
}

function saveCounts(host, student){
  const booking = findBooking(ui.bookingId);
  const msg = host.querySelector('#extraFormMsg');
  if(!booking) return;
  const summary = summaryFor(booking);
  const next = new Map();
  host.querySelectorAll('[data-line]').forEach(input => {
    next.set(input.dataset.line, Math.min(99, Math.max(0, parseInt(input.value, 10) || 0)));
  });
  for(const row of summary.lines){
    const count = next.get(row.line.id);
    const block = countChangeBlock(row.summary, count);
    if(block){
      msg.textContent = `${row.line.subject}：${block}`;
      return;
    }
  }
  const before = subjectLine(booking);
  booking.lines.forEach(line => {
    if(next.has(line.id)) line.count = next.get(line.id);
  });
  pushHistory(booking, '申込数を変更', before, subjectLine(booking));
  deps.scheduleSave();
  deps.refresh();
}

function holdBlock(student, line, dateStr, slot, half, picks, booking){
  const target = booking || findBooking(ui.bookingId);
  const status = deps.getDayStatus(dateStr);
  if(status.type !== 'open') return '休みの日です。';
  if(deps.isPayrollLocked(dateStr.slice(0, 7))) return 'この月の給与は確定済みです。';
  if(student.courseStartDate && !isOnOrAfterDate(dateStr, student.courseStartDate)) return '受講開始日より前です。';
  if(studentBusy(student, dateStr, slot, half) || picks.some(pick => pick.date === dateStr && Number(pick.slot) === Number(slot) && halfOverlaps(pick.half, half))){
    return 'この生徒の別の授業と重なります。';
  }
  const summary = summaryFor(target);
  const row = summary.lines.find(item => item.line.id === line.id);
  const picked = picks.filter(pick => pick.lineId === line.id).length;
  if(!row || picked >= row.summary.unplaced) return '未配置より多くは選べません。';
  if(roomUsed(student, dateStr, slot, half, picks) >= S.roomCapacity) return '教室が満席です。';
  return '';
}

function teacherBlock(student, line, teacher, dateStr, slot, half, picks, booking){
  const common = holdBlock(student, line, dateStr, slot, half, picks, booking);
  if(common) return common;
  if(isOwnerTeacher(teacher)) return '';
  const teaches = (teacher.subjects || []).some(row => row.level === student.level && row.subject === line.subject);
  if(!teaches) return 'この科目は教えられません。';
  if(!deps.isTeacherAvailableOnDate(teacher.id, dateStr, slot)) return 'この日のシフトがありません。';
  const capHalf = half === 'full' ? undefined : half;
  const used = deps.countTeacherSlotOnDate(teacher.id, dateStr, slot, student.id, capHalf)
    + picks.filter(pick => pick.teacherId === teacher.id && pick.date === dateStr && Number(pick.slot) === Number(slot) && halfOverlaps(pick.half, half)).length;
  const occupied = deps.teacherSlotHasOneToOneOnDate(teacher.id, dateStr, slot, student.id, capHalf)
    || picks.some(pick => pick.teacherId === teacher.id && pick.date === dateStr && Number(pick.slot) === Number(slot) && halfOverlaps(pick.half, half) && line.oneToOne);
  const cap = teacherSeatCap(occupied, line.oneToOne);
  if(used >= cap) return line.oneToOne ? '1対1の枠が埋まっています。' : 'この講師の人数が埋まっています。';
  return '';
}

export async function placeExtraLesson(student, pick){
  const booking = findBooking(pick.bookingId);
  const line = lineById(booking, pick.lineId);
  if(!booking || !line) return { ok: false, msg: '申込みが見つかりません。' };
  const teacher = pick.teacherId ? findTeacher(pick.teacherId) : null;
  const reason = pick.teacherId
    ? teacherBlock(student, line, teacher, pick.date, pick.slot, pick.half, [], booking)
    : holdBlock(student, line, pick.date, pick.slot, pick.half, [], booking);
  if(reason) return { ok: false, msg: reason };
  if(!pick.teacherId){
    ensureArrays();
    S.extraHolds.push({
      id: newId('exh'),
      extraBookingId: booking.id,
      extraLineId: line.id,
      studentId: student.id,
      courseId: line.courseId,
      subject: line.subject,
      date: pick.date,
      day: weekdayOf(pick.date),
      slot: pick.slot,
      half: normHalf(pick.half),
      oneToOne: !!line.oneToOne,
    });
  }else{
    const result = await deps.confirmAssignment(
      student.id,
      line.courseId,
      line.subject,
      weekdayOf(pick.date),
      pick.slot,
      pick.teacherId,
      'extra',
      {
        dateStr: pick.date,
        half: lineMinutes(line) === 40 ? pick.half : 'full',
        oneToOne: !!line.oneToOne,
        extraBookingId: booking.id,
        extraLineId: line.id,
      },
    );
    if(!result?.ok) return { ok: false, msg: result?.msg || '登録できませんでした。' };
  }
  const who = teacher ? teacher.name : '講師未定';
  const text = `${line.subject} ${dateText(pick.date)} ${slotText(pick.slot, pick.half)} ${who}`;
  pushHistory(booking, '日程を登録', '', text);
  deps.scheduleSave();
  deps.refresh();
  return { ok: true, msg: `${line.subject}を${dateText(pick.date)}の${slotText(pick.slot, pick.half)}に入れました。${who}です。` };
}

async function saved(message){
  deps.scheduleSave();
  deps.refresh();
  return { ok: true, msg: message };
}

function draftIdsOf(summary){
  return new Set(summary.placedItems.filter(row => row.role === 'draft').map(row => row.assignmentId));
}

function noLoginNames(ids){
  return [...new Set((S.draftAssignments || [])
    .filter(row => ids.has(row.id))
    .map(row => findTeacher(row.teacherId))
    .filter(teacher => teacher && !teacher.loginUid)
    .map(teacher => teacher.name))];
}

function sendConfirmText(booking){
  const ids = draftIdsOf(summaryFor(booking));
  let text = `仮決め ${ids.size}件を講師に依頼します。講師がOKするまで承認待ち（講師の返事待ち）です。`;
  const names = noLoginNames(ids);
  if(names.length) text += `${names.join('、')} はまだログインできないため、依頼できません。「講師管理」でログインを用意してください。`;
  return text;
}

async function sendBookingDrafts(booking){
  const ids = draftIdsOf(summaryFor(booking));
  if(!ids.size) return { ok: false, msg: '送信する仮決めがありません。' };
  const result = await deps.sendDraftAssignments({ only: row => ids.has(row.id) });
  if(!result.saved) return { ok: false, msg: '保存できませんでした。仮決めはそのままです。' };
  const names = result.noLoginTeachers.join('、');
  if(result.sent === 0) return { ok: false, msg: `送れませんでした。${names} のログインを「講師管理」で用意してください。` };
  pushHistory(booking, '講師に送信', `仮決め ${result.sent}件`, '承認待ち');
  flash = result.skippedNoLogin
    ? `✓ ${result.sent}件を依頼しました。${names} 分はログインがないため仮決めのままです。`
    : `✓ ${result.sent}件を講師に依頼しました（講師の返事待ち）。`;
  deps.afterSend();
  deps.refresh();
  return { ok: true };
}

async function cancelBooking(student){
  const booking = findBooking(ui.bookingId);
  if(!booking) return { ok: false, msg: '申込みが見つかりません。' };
  const summary = summaryFor(booking);
  if(summary.done || summary.consumed){
    return { ok: false, msg: '実施済みがある申込みは取り消せません。' };
  }
  for(const row of summary.placedItems){
    const block = unplaceBlock(row);
    if(block) return { ok: false, msg: block };
  }
  const absences = (S.absences || []).filter(row => row.extraBookingId === booking.id);
  for(const absence of absences) await deps.cancelAbsenceRecord(absence.id);
  for(const row of summary.placedItems){
    const result = await removePlacement(student, booking, row);
    if(result?.ok === false) return result;
  }
  const leftovers = []
    .concat(S.assignments || [], S.pendingAssignments || [], S.draftAssignments || [])
    .filter(item => item.extraBookingId === booking.id);
  for(const assignment of leftovers){
    const result = await removePlacement(student, booking, {
      lineId: assignment.extraLineId,
      date: assignment.oneTimeDate,
      slot: assignment.slot,
      half: assignment.half,
      assignmentId: assignment.id,
      subject: assignment.subject,
    });
    if(result?.ok === false) return result;
  }
  S.extraHolds = (S.extraHolds || []).filter(hold => hold.extraBookingId !== booking.id);
  booking.cancelledAt = new Date().toISOString();
  pushHistory(booking, '申込みを取消', subjectLine(booking), '取消');
  ui.mode = 'list';
  return saved('申込みを取り消しました。');
}

function unplaceBlock(row){
  if(row.role === 'done') return '実施済みの授業は、ここから取り消せません。';
  if(row.bucket === 'confirmed' && row.date && deps.isPayrollLocked(row.date.slice(0, 7))){
    return 'この月の給与は確定済みです。日程は外せません。';
  }
  return '';
}

async function unplace(student, role, id){
  const booking = findBooking(ui.bookingId);
  if(!booking) return { ok: false, msg: '申込みが見つかりません。' };
  const summary = summaryFor(booking);
  const row = summary.lines.flatMap(line => line.summary.items).find(item =>
    item.holdId === id || item.assignmentId === id || item.absenceId === id
  );
  if(!row) return { ok: false, msg: '日程が見つかりません。' };
  const block = unplaceBlock(row);
  if(block) return { ok: false, msg: block };
  if(row.role === 'waiting' || row.role === 'consumed'){
    await deps.cancelAbsenceRecord(row.absenceId);
  }
  const result = await removePlacement(student, booking, row);
  if(result?.ok === false) return result;
  pushHistory(booking, '日程を外した', `${row.subject} ${dateText(row.date)}`, '未配置');
  return saved('未配置に戻しました。');
}

function sameExtraSlot(item, row, dateField){
  return item.extraLineId === row.lineId &&
    item[dateField] === row.date &&
    Number(item.slot) === Number(row.slot) &&
    normHalf(item.half) === normHalf(row.half);
}

async function removePlacement(student, booking, row){
  const hold = (S.extraHolds || []).find(item => item.id && item.id === row.holdId)
    || (S.extraHolds || []).find(item => sameExtraSlot(item, row, 'date'));
  if(hold) S.extraHolds = S.extraHolds.filter(item => item.id !== hold.id);
  const groups = [
    ['pending', S.pendingAssignments],
    ['draft', S.draftAssignments],
    ['confirmed', S.assignments],
  ];
  let assignment = null;
  let bucket = '';
  for(const [name, list] of groups){
    const found = (list || []).find(item => item.id && item.id === row.assignmentId)
      || (list || []).find(item => sameExtraSlot(item, row, 'oneTimeDate'));
    if(found){
      assignment = found;
      bucket = name;
      break;
    }
  }
  if(!assignment) return { ok: true };
  const removed = await deps.cancelAssignment(
    student.id,
    assignment.courseId,
    assignment.day,
    assignment.slot,
    assignment.oneTimeDate,
    assignment.half || 'full',
  );
  if(!removed) return { ok: false, msg: '保存できませんでした。もう一度押してください。' };
  if(bucket === 'pending'){
    await deps.revokePendingApprovalTicket(
      student,
      { subject: assignment.subject },
      assignment.day,
      assignment.slot,
      assignment.oneTimeDate,
      assignment.teacherId,
    );
  }
  return { ok: true };
}

async function markAbsent(student, role, id){
  const booking = findBooking(ui.bookingId);
  const summary = summaryFor(booking);
  const row = summary.lines.flatMap(line => line.summary.items).find(item => item.holdId === id || item.assignmentId === id);
  if(!row) return { ok: false, msg: '日程が見つかりません。' };
  const line = lineById(booking, row.lineId);
  deps.recordStudentSlotAbsence(
    student.id,
    line.courseId,
    line.subject,
    weekdayOf(row.date),
    row.slot,
    row.date,
    row.half,
  );
  pushHistory(booking, '欠席', `${row.subject} ${dateText(row.date)}`, '振替待ち');
  return saved('欠席にしました。振替先はあとから選べます。');
}

async function undoAbsence(student, absenceId){
  await deps.cancelAbsenceRecord(absenceId);
  const booking = findBooking(ui.bookingId);
  if(booking) pushHistory(booking, '欠席を取り消した', '', '');
  await saved('欠席を取り消しました。');
}

function shortLabel(name){
  return String(name || '').split(/\s+/)[0];
}

function calendarLine(student, subject, suffix, role, bookingId, slot){
  const abbr = SUBJECT_ABBR[subject] || String(subject || '').slice(0, 1);
  const cls = role === 'draft' ? 'draft' : (role === 'confirmed' || role === 'done' ? 'confirmed' : 'pending');
  return {
    text: `${abbr}:${shortLabel(student?.name)} ${suffix}`,
    cls,
    extraBookingId: bookingId,
    studentId: student?.id || '',
    slot: Number(slot),
  };
}

export function extraHoldCalendarLines(dateStr, studentId){
  return (S.extraHolds || []).filter(hold => hold.date === dateStr && (!studentId || hold.studentId === studentId)).filter(hold =>
    !(S.absences || []).some(ab => ab.extraLineId === hold.extraLineId && ab.date === dateStr && Number(ab.slot) === Number(hold.slot))
  ).map(hold => {
    const student = S.students.find(row => row.id === hold.studentId);
    return calendarLine(student, hold.subject, '追加・講師未定', 'hold', hold.extraBookingId, hold.slot);
  });
}

export function extraAssignmentCalendarLines(dateStr, studentId){
  return taggedAssignments().filter(row =>
    row.extraBookingId && row.oneTimeDate === dateStr && (!studentId || row.studentId === studentId) &&
    !extraSeatReleased(row, dateStr, S.absences)
  ).map(row => {
    const student = S.students.find(item => item.id === row.studentId);
    const teacher = findTeacher(row.teacherId);
    const suffix = row.bucket === 'pending' ? '追加・承認待ち' : (row.bucket === 'draft' ? '追加・仮決め' : '追加');
    return calendarLine(student, row.subject, teacher ? `${suffix}` : suffix, row.bucket, row.extraBookingId, row.slot);
  });
}
