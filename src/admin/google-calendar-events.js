import { SLOTS } from '../shared/constants.js';
import { pad2, toDateStr } from '../shared/date-utils.js';

export const OWNER_CALENDAR_TEACHER_ID = '__owner__';

export function parseSlotClockTimes(timeLabel){
  const m = String(timeLabel || '').match(/(\d{1,2}):(\d{2})\s*[〜~～\-]\s*(\d{1,2}):(\d{2})/);
  if(!m) return null;
  return {
    start: `${pad2(Number(m[1]))}:${m[2]}:00`,
    end: `${pad2(Number(m[3]))}:${m[4]}:00`,
  };
}

/** 今月から先2ヶ月（当月含む3ヶ月） */
export function googleCalendarSyncRange(now = new Date()){
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 3, 0);
  return {
    startStr: toDateStr(start.getFullYear(), start.getMonth(), start.getDate()),
    endStr: toDateStr(end.getFullYear(), end.getMonth(), end.getDate()),
  };
}

export function eachDateStr(startStr, endStr){
  const dates = [];
  const [sy, sm, sd] = startStr.split('-').map(Number);
  const cur = new Date(sy, sm - 1, sd);
  const [ey, em, ed] = endStr.split('-').map(Number);
  const end = new Date(ey, em - 1, ed);
  while(cur <= end){
    dates.push(toDateStr(cur.getFullYear(), cur.getMonth(), cur.getDate()));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

export function keepForGoogleCalendar(entry, scope){
  if(!entry) return false;
  if(entry.pending || entry.draft || entry.teacherAbsent) return false;
  if(scope === 'owner' && entry.teacherId !== OWNER_CALENDAR_TEACHER_ID) return false;
  return true;
}

export function googleCalendarEventKey(dateStr, entry){
  const slotId = Number(entry.slot);
  const studentId = entry.studentId || '';
  const courseIds = (entry.courseIds && entry.courseIds.length)
    ? [...entry.courseIds]
    : [entry.courseId].filter(Boolean);
  courseIds.sort();
  return `${dateStr}|${slotId}|${studentId}|${courseIds.join(',')}`;
}

export function googleCalendarEventSummary(entry, slot, studentName, teacherName){
  const subject = entry.isDual && entry.subjects?.length
    ? entry.subjects.filter(Boolean).join('・')
    : (entry.subject || '');
  const student = studentName || '';
  const teacher = teacherName || '';
  return `${slot.label} ${subject} ${student} / ${teacher}`.replace(/\s+/g, ' ').trim();
}

export function buildGoogleCalendarEvent(dateStr, entry, studentName, teacherName){
  const slot = SLOTS.find(s=> Number(s.id) === Number(entry.slot));
  if(!slot) return null;
  const clocks = parseSlotClockTimes(slot.time);
  if(!clocks) return null;
  return {
    key: googleCalendarEventKey(dateStr, entry),
    dateStr,
    slotId: Number(slot.id),
    summary: googleCalendarEventSummary(entry, slot, studentName, teacherName),
    start: `${dateStr}T${clocks.start}`,
    end: `${dateStr}T${clocks.end}`,
  };
}

export function normalizeGoogleDateTime(dateTime){
  if(!dateTime) return '';
  const d = new Date(dateTime);
  if(Number.isNaN(d.getTime())){
    return String(dateTime).slice(0, 19);
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = type => parts.find(p=> p.type === type)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`;
}

export function diffCalendarEvents(desired, existingByKey){
  const inserts = [];
  const updates = [];
  const deletes = [];
  const desiredKeys = new Set(desired.map(e=> e.key));
  desired.forEach(ev=>{
    const found = existingByKey.get(ev.key);
    if(!found){
      inserts.push(ev);
      return;
    }
    if(found.summary !== ev.summary || found.start !== ev.start || found.end !== ev.end){
      updates.push({ ...ev, googleEventId: found.googleEventId });
    }
  });
  existingByKey.forEach((found, key)=>{
    if(!desiredKeys.has(key)) deletes.push(found);
  });
  return { inserts, updates, deletes };
}

export function isGoogleCalendarConnected(gc){
  return !!(gc && gc.calendarId);
}

export function googleCalendarHeaderLabel(gc){
  return isGoogleCalendarConnected(gc) ? 'カレンダーに送る' : 'カレンダーにつなぐ';
}

export function formatGoogleCalendarStatus(gc){
  if(!isGoogleCalendarConnected(gc)){
    return 'まだつながっていません。右上の「カレンダーにつなぐ」を押してください。';
  }
  if(!gc?.lastSyncedAt) return 'まだ送っていません。';
  const d = new Date(gc.lastSyncedAt);
  if(Number.isNaN(d.getTime())) return 'まだ送っていません。';
  const scopeLabel = gc.lastSyncedScope === 'owner' ? '自分の担当だけ' : '教室全体';
  const n = Number(gc.lastSyncedCount) || 0;
  return `最終送信: ${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad2(d.getHours())}:${pad2(d.getMinutes())}（${scopeLabel}・${n}件）`;
}

export function emptyGoogleCalendarState(){
  return {
    scope: 'all',
    calendarId: '',
    lastSyncedAt: null,
    lastSyncedCount: 0,
    lastSyncedScope: null,
  };
}

export function normalizeGoogleCalendarState(raw){
  const base = emptyGoogleCalendarState();
  if(!raw || typeof raw !== 'object') return base;
  return {
    scope: raw.scope === 'owner' ? 'owner' : 'all',
    calendarId: typeof raw.calendarId === 'string' ? raw.calendarId : '',
    lastSyncedAt: raw.lastSyncedAt || null,
    lastSyncedCount: Number(raw.lastSyncedCount) || 0,
    lastSyncedScope: raw.lastSyncedScope === 'owner' ? 'owner' : (raw.lastSyncedScope === 'all' ? 'all' : null),
  };
}
