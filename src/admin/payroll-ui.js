import { S } from './state.js';
import { mountInlineConfirm, showInlineNotice } from '../shared/inline-confirm.js';
import {
  buildPayrollViewModel,
  downloadPayrollCsv,
  ensurePayrollMonth,
  lockPayrollMonth,
  parseOfficeHours,
  setOfficeHours,
  sumPayrollRows,
  teachersMissingEmployeeNumber,
  unlockPayrollMonth,
} from './payroll.js';

function yen(n){
  return `¥${(n || 0).toLocaleString()}`;
}

function hoursLabel(n){
  if(!n) return '0';
  return String(n);
}

function escapeHtml(value){
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPayrollRow(row, locked, missingEmp){
  const hoursValue = row.officeHours ? String(row.officeHours) : '';
  const statusHtml = missingEmp
    ? '<span class="student-row-status is-pending">従業員番号なし</span>'
    : '';
  const empHtml = row.employeeNumber
    ? `<span class="student-row-pref">従業員番号 ${escapeHtml(row.employeeNumber)}</span>`
    : '';
  const hoursInputHtml = locked
    ? `<span class="student-row-pref">事務時間 ${escapeHtml(hoursLabel(row.officeHours))}時間</span>`
    : `<label class="student-row-pref" for="pay-hours-${escapeHtml(row.teacherId)}">事務時間
        <input type="text" inputmode="decimal" id="pay-hours-${escapeHtml(row.teacherId)}" class="payroll-hours-input" data-teacher-id="${escapeHtml(row.teacherId)}" value="${escapeHtml(hoursValue)}" aria-label="${escapeHtml(row.teacherName)}の事務時間">
        時間
      </label>`;
  return `<div class="student-row${missingEmp ? ' needs-action' : ''}" data-teacher-id="${escapeHtml(row.teacherId)}">
    ${statusHtml}
    <div class="student-row-main">
      <div class="student-row-head">
        <span class="student-row-name">${escapeHtml(row.teacherName)}</span>
        ${empHtml}
      </div>
      <div class="student-row-course">
        <span class="student-row-pref">コマ ${row.lessonCount || 0}</span>
        <span class="student-row-pref">出勤 ${row.workDays || 0}日</span>
        <span class="student-row-pref">授業給 ${yen(row.lessonPay)}</span>
        <span class="student-row-pref">交通費 ${yen(row.transportPay)}</span>
        ${hoursInputHtml}
        <span class="student-row-pref">事務給 ${yen(row.officePay)}</span>
        <span class="student-row-pref">合計 ${yen(row.total)}</span>
      </div>
    </div>
  </div>`;
}

export function renderPayroll(){
  ensurePayrollMonth();
  const title = document.getElementById('payTitle');
  const badge = document.getElementById('payMonthBadge');
  const summary = document.getElementById('payMonthSummary');
  const list = document.getElementById('payTeacherList');
  const actions = document.getElementById('payrollActionCard');
  if(!title || !list) return;

  if(!S.dataReady){
    list.innerHTML = '<div class="loading">読み込み中…</div>';
    return;
  }

  const model = buildPayrollViewModel(S.payYear, S.payMonth);
  title.textContent = `${S.payYear}年${S.payMonth + 1}月`;
  if(badge){
    badge.textContent = model.locked ? '確定済み' : '未確定';
    badge.className = `match-status-badge ${model.locked ? 'is-ready' : 'is-pending'}`;
  }

  const totals = sumPayrollRows(model.rows);
  if(summary){
    summary.innerHTML = `
      <div class="fin-summary-item">
        <div class="fin-label">授業給</div>
        <div class="fin-value">${yen(totals.lessonPay)}</div>
      </div>
      <div class="fin-summary-item">
        <div class="fin-label">交通費</div>
        <div class="fin-value">${yen(totals.transportPay)}</div>
      </div>
      <div class="fin-summary-item">
        <div class="fin-label">事務給</div>
        <div class="fin-value">${yen(totals.officePay)}</div>
      </div>
      <div class="fin-summary-item">
        <div class="fin-label">合計</div>
        <div class="fin-value">${yen(totals.total)}</div>
      </div>
    `;
  }

  if(!S.teachers.length){
    list.innerHTML = '<div class="empty-note">まだ講師が登録されていません。講師登録タブから登録してください。</div>';
  }else{
    const missingIds = new Set(teachersMissingEmployeeNumber(model.rows).map(r=> r.teacherId));
    list.innerHTML = model.rows.map(row=> renderPayrollRow(row, model.locked, missingIds.has(row.teacherId))).join('');
  }

  const missing = teachersMissingEmployeeNumber(model.rows);
  const notice = document.getElementById('payrollNotice');
  if(notice) notice.innerHTML = '';
  if(!model.locked && missing.length && notice){
    showInlineNotice(notice, `従業員番号が未登録です：${missing.map(r=> r.teacherName).join('、')}。講師登録から番号を入れてください。`, { variant: 'warn' });
  }

  if(actions){
    if(model.locked){
      actions.innerHTML = `
        <div class="form-actions">
          <button type="button" class="confirm-btn" id="payDownloadBtn">CSVをダウンロード</button>
          <button type="button" class="unconfirm-btn" id="payUnlockBtn">確定を取り消す</button>
        </div>
      `;
      actions.querySelector('#payDownloadBtn').addEventListener('click', ()=>{
        downloadPayrollCsv(S.payYear, S.payMonth, model.rows);
        if(notice) showInlineNotice(notice, 'CSVを保存しました。', { variant: 'ok' });
      });
      actions.querySelector('#payUnlockBtn').addEventListener('click', (e)=>{
        mountInlineConfirm(actions, e.currentTarget, {
          message: 'この月の確定を取り消しますか。カレンダーのいまの内容から、もう一度計算できます。',
          confirmLabel: '取り消す',
          cancelLabel: 'やめる',
          variant: 'danger',
          mountSelector: '#payrollActionCard',
          onConfirm: ()=>{
            unlockPayrollMonth(model.yearMonth);
            renderPayroll();
          },
        });
      });
    }else{
      actions.innerHTML = `
        <div class="form-actions">
          <button type="button" class="confirm-btn" id="payLockBtn"${missing.length ? ' disabled' : ''}>今月を確定する</button>
        </div>
      `;
      actions.querySelector('#payLockBtn')?.addEventListener('click', ()=>{
        const result = lockPayrollMonth(S.payYear, S.payMonth);
        renderPayroll();
        const afterNotice = document.getElementById('payrollNotice');
        if(result.ok){
          showInlineNotice(afterNotice, '今月を確定しました。CSVは「CSVをダウンロード」から保存できます。', { variant: 'ok' });
        }else if(afterNotice){
          showInlineNotice(afterNotice, result.msg, { variant: 'warn' });
        }
      });
    }
  }

  list.querySelectorAll('.payroll-hours-input').forEach(input=>{
    input.addEventListener('change', ()=>{
      const parsed = parseOfficeHours(input.value);
      if(parsed == null){
        input.value = hoursLabel(getHoursFallback(input.dataset.teacherId));
        if(notice) showInlineNotice(notice, '事務時間は0以上の数字で入力してください。', { variant: 'warn' });
        return;
      }
      setOfficeHours(model.yearMonth, input.dataset.teacherId, parsed);
      renderPayroll();
    });
  });
}

function getHoursFallback(teacherId){
  const model = buildPayrollViewModel(S.payYear, S.payMonth);
  const row = model.rows.find(r=> r.teacherId === teacherId);
  return row?.officeHours || 0;
}

export function bindPayrollUi(){
  document.getElementById('payPrevBtn')?.addEventListener('click', ()=>{
    ensurePayrollMonth();
    S.payMonth--;
    if(S.payMonth < 0){ S.payMonth = 11; S.payYear--; }
    renderPayroll();
  });
  document.getElementById('payNextBtn')?.addEventListener('click', ()=>{
    ensurePayrollMonth();
    S.payMonth++;
    if(S.payMonth > 11){ S.payMonth = 0; S.payYear++; }
    renderPayroll();
  });
  document.getElementById('payTodayBtn')?.addEventListener('click', ()=>{
    const t = new Date();
    S.payYear = t.getFullYear();
    S.payMonth = t.getMonth();
    renderPayroll();
  });
}
