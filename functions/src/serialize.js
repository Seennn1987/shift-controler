import { Timestamp, DocumentReference, GeoPoint } from 'firebase-admin/firestore';

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** 2026-09-28T17:30:00+09:00 形式 */
export function toJstIso(date){
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);
  return shifted.toISOString().replace(/\.\d{3}Z$/, '+09:00');
}

/** ログイン情報・連絡先・給与・生徒の備考や割引は、APIキーが漏れても読めないように返さない */
const HIDDEN_KEYS = new Set([
  'loginEmail', 'email', 'retiredTeacherLogins',
  'employeeNumber', 'perLessonRate', 'dailyTransport', 'earlyLessonException', 'raiseSchedule',
  'notes', 'targetSchool', 'examType', 'discounts',
]);
const HIDDEN_PATTERN = /password|passwd|token|secret|apikey/i;

export function isHiddenKey(key){
  return HIDDEN_KEYS.has(key) || HIDDEN_PATTERN.test(key);
}

export function isHiddenFieldPath(dotted){
  return String(dotted || '').split('.').some(k=> isHiddenKey(k.trim()));
}

export function serializeValue(value){
  if(value === null || value === undefined) return value ?? null;
  if(value instanceof Timestamp) return toJstIso(value.toDate());
  if(value instanceof Date) return toJstIso(value);
  if(value instanceof DocumentReference) return value.path;
  if(value instanceof GeoPoint) return { latitude: value.latitude, longitude: value.longitude };
  if(Buffer.isBuffer(value) || value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  if(Array.isArray(value)) return value.map(serializeValue);
  if(typeof value === 'object'){
    const out = {};
    Object.keys(value).forEach(k=>{
      if(isHiddenKey(k)) return;
      out[k] = serializeValue(value[k]);
    });
    return out;
  }
  return value;
}

export function serializeDoc(snap){
  return { _id: snap.id, _path: snap.ref.path, ...serializeValue(snap.data() || {}) };
}
