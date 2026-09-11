import { mountInlineConfirm, showInlineNotice } from '../src/shared/inline-confirm.js';

const OFFICE_RATE = 1300;
const CSV_HEADERS = [
  'Version', '従業員識別子', '従業員番号', '姓', '名',
  '基本給(月給)', '通勤手当/非課(月給)', '事務手当',
];

const state = {
  year: 2026,
  month: 8,
  locked: false,
  rows: [
    { teacherId: 't1', teacherName: '白澤 慶斗', employeeNumber: '001', lessonCount: 12, workDays: 8, lessonPay: 26400, transportPay: 3200, officeHours: 0 },
    { teacherId: 't2', teacherName: '山田 花子', employeeNumber: '002', lessonCount: 8, workDays: 6, lessonPay: 17600, transportPay: 2400, officeHours: 1.5 },
    { teacherId: 't3', teacherName: '佐藤 太郎', employeeNumber: '003', lessonCount: 4, workDays: 3, lessonPay: 8800, transportPay: 1500, officeHours: 0 },
  ],
};

function yen(n){
  return `¥${(n || 0).toLocaleString()}`;
}

function withPay(row){
  const officePay = Math.round((row.officeHours || 0) * OFFICE_RATE);
  return { ...row, officePay, total: row.lessonPay + row.transportPay + officePay };
}

function rows(){
  return state.rows.map(withPay);
}

function hasAmount(row){
  return row.lessonPay > 0 || row.transportPay > 0 || row.officePay > 0;
}

function missingEmp(){
  return rows().filter(r=> hasAmount(r) && !r.employeeNumber);
}

function csvCell(value){
  return `"${String(value ?? '').replace(/"/g, '""')}"`;
}

function downloadCsv(){
  const lines = [CSV_HEADERS.map(csvCell).join(',')];
  rows().filter(hasAmount).forEach(row=>{
    const [last, ...rest] = row.teacherName.split(/\s+/);
    lines.push([
      '3', '', row.employeeNumber, last, rest.join(' '),
      String(row.lessonPay), String(row.transportPay), String(row.officePay),
    ].map(csvCell).join(','));
  });
  const blob = new Blob([`${lines.join('\r\n')}\r\n`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `支給_控除_勤怠_${state.year}年${String(state.month + 1).padStart(2, '0')}月.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function render(){
  clearTimeout(previewRerenderTimer);
  const title = document.getElementById('payTitle');
  const badge = document.getElementById('payMonthBadge');
  const summary = document.getElementById('payMonthSummary');
  const list = document.getElementById('payTeacherList');
  const actions = document.getElementById('payrollActionCard');
  const notice = document.getElementById('payrollNotice');
  const viewRows = rows();
  const missing = missingEmp();
  const totals = viewRows.reduce((acc, row)=>{
    acc.lessonPay += row.lessonPay;
    acc.transportPay += row.transportPay;
    acc.officePay += row.officePay;
    acc.total += row.total;
    return acc;
  }, { lessonPay: 0, transportPay: 0, officePay: 0, total: 0 });

  title.textContent = `${state.year}年${state.month + 1}月`;
  badge.textContent = state.locked ? '確定済み' : '未確定';
  badge.className = `match-status-badge ${state.locked ? 'is-ready' : 'is-pending'}`;
  summary.innerHTML = `
    <div class="fin-summary-item"><div class="fin-label">授業給</div><div class="fin-value">${yen(totals.lessonPay)}</div></div>
    <div class="fin-summary-item"><div class="fin-label">交通費</div><div class="fin-value">${yen(totals.transportPay)}</div></div>
    <div class="fin-summary-item"><div class="fin-label">事務給</div><div class="fin-value">${yen(totals.officePay)}</div></div>
    <div class="fin-summary-item"><div class="fin-label">合計</div><div class="fin-value">${yen(totals.total)}</div></div>
  `;
  notice.innerHTML = '';
  list.innerHTML = viewRows.map(row=>{
    const missingRow = hasAmount(row) && !row.employeeNumber;
    const empHtml = row.employeeNumber
      ? `<span class="student-row-pref">従業員番号 ${row.employeeNumber}</span>`
      : '';
    const statusHtml = missingRow
      ? '<span class="student-row-status is-pending">従業員番号なし</span>'
      : '';
    const hoursInputHtml = state.locked
      ? `<span class="student-row-pref">事務時間 ${row.officeHours || 0}時間</span>`
      : `<label class="student-row-pref" for="pay-hours-${row.teacherId}">事務時間 <input type="text" inputmode="decimal" id="pay-hours-${row.teacherId}" class="payroll-hours-input" data-teacher-id="${row.teacherId}" value="${row.officeHours || ''}" aria-label="${row.teacherName}の事務時間"> 時間</label>`;
    return `<div class="student-row${missingRow ? ' needs-action' : ''}">
      ${statusHtml}
      <div class="student-row-main">
        <div class="student-row-head">
          <span class="student-row-name">${row.teacherName}</span>
          ${empHtml}
        </div>
        <div class="student-row-course">
          <span class="student-row-pref">コマ ${row.lessonCount}</span>
          <span class="student-row-pref">出勤 ${row.workDays}日</span>
          <span class="student-row-pref">授業給 ${yen(row.lessonPay)}</span>
          <span class="student-row-pref">交通費 ${yen(row.transportPay)}</span>
          ${hoursInputHtml}
          <span class="student-row-pref">事務給 ${yen(row.officePay)}</span>
          <span class="student-row-pref">合計 ${yen(row.total)}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  if(!state.locked && missing.length){
    showInlineNotice(notice, `従業員番号が未登録です：${missing.map(r=> r.teacherName).join('、')}。講師登録から番号を入れてください。`, { variant: 'warn' });
  }

  if(state.locked){
    actions.innerHTML = `<div class="form-actions">
      <button type="button" class="confirm-btn" id="payDownloadBtn">CSVをダウンロード</button>
      <button type="button" class="unconfirm-btn" id="payUnlockBtn">確定を取り消す</button>
    </div>`;
    actions.querySelector('#payDownloadBtn').addEventListener('click', ()=>{
      downloadCsv();
      showInlineNotice(notice, 'CSVを保存しました。', { variant: 'ok' });
    });
    actions.querySelector('#payUnlockBtn').addEventListener('click', (e)=>{
      mountInlineConfirm(actions, e.currentTarget, {
        message: 'この月の確定を取り消しますか。カレンダーのいまの内容から、もう一度計算できます。',
        confirmLabel: '取り消す',
        cancelLabel: 'やめる',
        variant: 'danger',
        mountSelector: '#payrollActionCard',
        onConfirm: ()=>{ state.locked = false; render(); },
      });
    });
  }else{
    actions.innerHTML = `<div class="form-actions">
      <button type="button" class="confirm-btn" id="payLockBtn"${missing.length ? ' disabled' : ''}>今月を確定する</button>
    </div>`;
    const lockBtn = actions.querySelector('#payLockBtn');
    lockBtn?.addEventListener('pointerdown', flushFocusedOfficeHours);
    lockBtn?.addEventListener('click', ()=>{
      flushFocusedOfficeHours();
      if(missingEmp().length) return;
      state.locked = true;
      render();
      showInlineNotice(document.getElementById('payrollNotice'), '今月を確定しました。CSVは「CSVをダウンロード」から保存できます。', { variant: 'ok' });
    });
  }

  list.querySelectorAll('.payroll-hours-input').forEach(input=>{
    input.addEventListener('change', ()=>{
      if(!applyOfficeHoursFromInput(input, notice)) return;
      schedulePreviewRerender();
    });
  });
}

let previewRerenderTimer = 0;

function schedulePreviewRerender(){
  clearTimeout(previewRerenderTimer);
  previewRerenderTimer = setTimeout(()=> render(), 0);
}

function applyOfficeHoursFromInput(input, notice){
  const n = Number(input.value);
  const row = state.rows.find(r=> r.teacherId === input.dataset.teacherId);
  if(!row || !Number.isFinite(n) || n < 0){
    input.value = row && row.officeHours ? String(row.officeHours) : '';
    showInlineNotice(notice, '事務時間は0以上の数字で入力してください。', { variant: 'warn' });
    return false;
  }
  row.officeHours = n;
  return true;
}

function flushFocusedOfficeHours(){
  const focused = document.activeElement;
  const notice = document.getElementById('payrollNotice');
  if(!(focused instanceof HTMLInputElement) || !focused.classList.contains('payroll-hours-input')) return;
  applyOfficeHoursFromInput(focused, notice);
}

document.getElementById('payPrevBtn').addEventListener('click', ()=>{
  state.month--;
  if(state.month < 0){ state.month = 11; state.year--; }
  render();
});
document.getElementById('payNextBtn').addEventListener('click', ()=>{
  state.month++;
  if(state.month > 11){ state.month = 0; state.year++; }
  render();
});
document.getElementById('payTodayBtn').addEventListener('click', ()=>{
  state.year = 2026;
  state.month = 8;
  render();
});

render();
