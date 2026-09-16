import { GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_NAME, GOOGLE_CALENDAR_SCOPE } from '../shared/google-calendar-config.js';
import { getEffectiveDayAssignments } from './absences.js';
import { collapseDualAssignmentDisplayRows } from './dual-subject.js';
import { shortName } from './calendar.js';
import { findTeacher } from './owner-teacher.js';
import { S } from './state.js';
import { scheduleSave } from './students-persistence.js';
import { showAppNoticeDialog } from '../shared/app-confirm-dialog.js';
import {
  buildGoogleCalendarEvent,
  diffCalendarEvents,
  eachDateStr,
  formatGoogleCalendarStatus,
  googleCalendarHeaderLabel,
  googleCalendarSyncRange,
  keepForGoogleCalendar,
  normalizeGoogleCalendarState,
  normalizeGoogleDateTime,
} from './google-calendar-events.js';

function studentDisplayName(entry){
  const student = S.students.find(s=> s.id === entry.studentId);
  if(!student) return '(削除された生徒)';
  return shortName(student.name);
}

function teacherDisplayName(entry){
  const teacher = findTeacher(entry.teacherId);
  if(!teacher) return '?';
  return shortName(teacher.name);
}

export function collectConfirmedCalendarEvents(scope, now = new Date()){
  const { startStr, endStr } = googleCalendarSyncRange(now);
  const events = [];
  eachDateStr(startStr, endStr).forEach(dateStr=>{
    const raw = getEffectiveDayAssignments(dateStr).filter(a=> keepForGoogleCalendar(a, scope));
    collapseDualAssignmentDisplayRows(raw).forEach(entry=>{
      const ev = buildGoogleCalendarEvent(
        dateStr,
        entry,
        studentDisplayName(entry),
        teacherDisplayName(entry),
      );
      if(ev) events.push(ev);
    });
  });
  return events;
}

function selectedScopeFromUi(){
  const checked = document.querySelector('#gcalScopeRow input[name="gcalScope"]:checked');
  if(checked?.value === 'owner') return 'owner';
  if(checked?.value === 'all') return 'all';
  return S.googleCalendar.scope === 'owner' ? 'owner' : 'all';
}

function renderGoogleCalendarHeader(){
  const btn = document.getElementById('gcalHeaderBtn');
  if(!btn) return;
  btn.textContent = googleCalendarHeaderLabel(S.googleCalendar);
}

function renderGoogleCalendarSettings(){
  S.googleCalendar = normalizeGoogleCalendarState(S.googleCalendar);
  const statusEl = document.getElementById('gcalSyncStatus');
  if(statusEl) statusEl.textContent = formatGoogleCalendarStatus(S.googleCalendar);
  document.querySelectorAll('#gcalScopeRow input[name="gcalScope"]').forEach(input=>{
    input.checked = input.value === S.googleCalendar.scope;
  });
  renderGoogleCalendarHeader();
}

async function waitForGoogleIdentity(){
  if(window.google?.accounts?.oauth2) return;
  await new Promise((resolve, reject)=>{
    const started = Date.now();
    const timer = setInterval(()=>{
      if(window.google?.accounts?.oauth2){
        clearInterval(timer);
        resolve();
        return;
      }
      if(Date.now() - started > 8000){
        clearInterval(timer);
        reject(new Error('Googleの読み込みに失敗しました。ページを開き直してください。'));
      }
    }, 50);
  });
}

function requestGoogleAccessToken(){
  return new Promise((resolve, reject)=>{
    if(!GOOGLE_CALENDAR_CLIENT_ID){
      reject(new Error('Googleカレンダー連携の準備がまだ終わっていません。'));
      return;
    }
    const prompt = S.googleCalendar.calendarId ? '' : 'consent';
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CALENDAR_CLIENT_ID,
      scope: GOOGLE_CALENDAR_SCOPE,
      callback: (resp)=>{
        if(resp?.error){
          reject(new Error(googleAuthErrorMessage(resp.error)));
          return;
        }
        if(!resp?.access_token){
          reject(new Error('Googleの許可を取得できませんでした。'));
          return;
        }
        resolve(resp.access_token);
      },
      error_callback: (err)=>{
        const msg = err?.type === 'popup_closed' || err?.message === 'popup_closed_by_user'
          ? 'Googleの許可画面を閉じました。'
          : googleAuthErrorMessage(err?.type || err?.message);
        reject(new Error(msg));
      },
    });
    client.requestAccessToken({ prompt });
  });
}

function googleAuthErrorMessage(code){
  if(code === 'access_denied' || code === 'popup_closed' || code === 'popup_closed_by_user'){
    return 'Googleの許可画面を閉じました。';
  }
  if(code === 'idpiframe_initialization_failed'){
    return 'この画面からGoogleへ送れません。ページを開き直してください。';
  }
  return 'Googleの許可が取れませんでした。';
}

function googleCalendarApiErrorMessage(data, status){
  const message = String(data?.error?.message || '');
  const reason = String(data?.error?.status || data?.error?.errors?.[0]?.reason || '');
  const blob = `${message} ${reason}`;
  if(/has not been used|SERVICE_DISABLED|accessNotConfigured|disabled/i.test(blob)){
    return 'Googleカレンダーの利用開始がまだです。';
  }
  if(status === 401 || /insufficient|ACCESS_TOKEN_SCOPE/i.test(blob)){
    return 'Googleカレンダーへの許可が足りません。もう一度右上のボタンを押して、許可してください。';
  }
  if(status === 403) return 'Googleカレンダーへのアクセスが拒否されました。';
  return message || `Googleカレンダーの通信に失敗しました（${status}）`;
}

async function gcalFetch(token, path, options = {}){
  const url = path.startsWith('http') ? path : `https://www.googleapis.com/calendar/v3${path}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    ...(options.headers || {}),
  };
  if(options.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(url, { ...options, headers });
  if(res.status === 204) return null;
  const data = await res.json().catch(()=> ({}));
  if(!res.ok){
    const err = new Error(googleCalendarApiErrorMessage(data, res.status));
    err.status = res.status;
    throw err;
  }
  return data;
}

async function ensurePitacomaCalendar(token){
  const storedId = S.googleCalendar.calendarId;
  if(storedId){
    try{
      await gcalFetch(token, `/calendars/${encodeURIComponent(storedId)}`);
      return storedId;
    }catch(err){
      if(err.status !== 404) throw err;
    }
  }
  const list = await gcalFetch(token, '/users/me/calendarList?maxResults=250');
  const found = (list.items || []).find(c=> c.summary === GOOGLE_CALENDAR_NAME);
  if(found?.id) return found.id;
  const created = await gcalFetch(token, '/calendars', {
    method: 'POST',
    body: JSON.stringify({ summary: GOOGLE_CALENDAR_NAME, timeZone: 'Asia/Tokyo' }),
  });
  return created.id;
}

async function listPitacomaEvents(token, calendarId){
  const map = new Map();
  let pageToken = '';
  do{
    const q = new URLSearchParams({
      privateExtendedProperty: 'pitacoma=1',
      maxResults: '2500',
      singleEvents: 'true',
      showDeleted: 'false',
    });
    if(pageToken) q.set('pageToken', pageToken);
    const data = await gcalFetch(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events?${q.toString()}`,
    );
    (data.items || []).forEach(item=>{
      const key = item.extendedProperties?.private?.pitacomaKey;
      if(!key || !item.id) return;
      map.set(key, {
        key,
        googleEventId: item.id,
        summary: item.summary || '',
        start: normalizeGoogleDateTime(item.start?.dateTime),
        end: normalizeGoogleDateTime(item.end?.dateTime),
      });
    });
    pageToken = data.nextPageToken || '';
  } while(pageToken);
  return map;
}

function toGoogleEventBody(ev){
  return {
    summary: ev.summary,
    description: 'ピタコマの確定授業です。変更したあとは、右上の「カレンダーに送る」でもう一度送ってください。',
    start: { dateTime: ev.start, timeZone: 'Asia/Tokyo' },
    end: { dateTime: ev.end, timeZone: 'Asia/Tokyo' },
    extendedProperties: {
      private: {
        pitacoma: '1',
        pitacomaKey: ev.key,
      },
    },
  };
}

export async function syncGoogleCalendar(scope){
  await waitForGoogleIdentity();
  const token = await requestGoogleAccessToken();
  const desired = collectConfirmedCalendarEvents(scope);
  const calendarId = await ensurePitacomaCalendar(token);
  const existing = await listPitacomaEvents(token, calendarId);
  const { inserts, updates, deletes } = diffCalendarEvents(desired, existing);
  const calPath = `/calendars/${encodeURIComponent(calendarId)}/events`;
  for(const ev of inserts){
    await gcalFetch(token, calPath, {
      method: 'POST',
      body: JSON.stringify(toGoogleEventBody(ev)),
    });
  }
  for(const ev of updates){
    await gcalFetch(token, `${calPath}/${encodeURIComponent(ev.googleEventId)}`, {
      method: 'PATCH',
      body: JSON.stringify(toGoogleEventBody(ev)),
    });
  }
  for(const ev of deletes){
    await gcalFetch(token, `${calPath}/${encodeURIComponent(ev.googleEventId)}`, {
      method: 'DELETE',
    });
  }
  S.googleCalendar.scope = scope;
  S.googleCalendar.calendarId = calendarId;
  S.googleCalendar.lastSyncedAt = new Date().toISOString();
  S.googleCalendar.lastSyncedCount = desired.length;
  S.googleCalendar.lastSyncedScope = scope;
  scheduleSave();
  return { count: desired.length, inserts: inserts.length, updates: updates.length, deletes: deletes.length };
}

async function handleGoogleCalendarSync(){
  const btn = document.getElementById('gcalHeaderBtn');
  const statusEl = document.getElementById('gcalSyncStatus');
  const wasConnected = !!S.googleCalendar.calendarId;
  const scope = selectedScopeFromUi();
  S.googleCalendar.scope = scope;
  if(btn){
    btn.disabled = true;
    btn.textContent = wasConnected ? '送っています…' : 'つないでいます…';
  }
  if(statusEl) statusEl.textContent = wasConnected ? 'Googleカレンダーに送っています…' : 'Googleにつないでいます…';
  try{
    const result = await syncGoogleCalendar(scope);
    renderGoogleCalendarSettings();
    const scopeLabel = scope === 'owner' ? '自分の担当だけ' : '教室全体';
    const title = wasConnected ? 'カレンダーに送りました' : 'カレンダーにつながりました';
    const message = wasConnected
      ? `${scopeLabel}の確定授業 ${result.count}件を送りました。`
      : `つながりました。${scopeLabel}の確定授業 ${result.count}件を送りました。`;
    await showAppNoticeDialog({
      title,
      message,
      confirmLabel: '閉じる',
    });
  }catch(err){
    console.error('Googleカレンダー送信エラー:', err);
    renderGoogleCalendarSettings();
    await showAppNoticeDialog({
      title: 'カレンダーに送れませんでした',
      message: err?.message || 'Googleカレンダーに送れませんでした。',
      confirmLabel: '閉じる',
    });
  }finally{
    if(btn) btn.disabled = false;
    renderGoogleCalendarHeader();
  }
}

export function initGoogleCalendarSettings(){
  S.googleCalendar = normalizeGoogleCalendarState(S.googleCalendar);
  renderGoogleCalendarSettings();
  const row = document.getElementById('gcalScopeRow');
  if(row && !row.dataset.wired){
    row.dataset.wired = '1';
    row.addEventListener('change', ()=>{
      S.googleCalendar.scope = selectedScopeFromUi();
      scheduleSave();
    });
  }
  const btn = document.getElementById('gcalHeaderBtn');
  if(btn && !btn.dataset.wired){
    btn.dataset.wired = '1';
    btn.addEventListener('click', ()=>{ handleGoogleCalendarSync(); });
  }
}
