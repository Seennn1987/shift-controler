import crypto from 'node:crypto';

function digest(value){
  return crypto.createHash('sha256').update(String(value), 'utf8').digest();
}

/** 長さの違いも含めて、比較にかかる時間から中身を推測されないように照合する */
export function isValidKey(provided, expected){
  if(typeof provided !== 'string' || provided === '') return false;
  if(typeof expected !== 'string' || expected === '') return false;
  return crypto.timingSafeEqual(digest(provided), digest(expected));
}

const WINDOW_MS = 60 * 1000;
const PER_CLIENT_LIMIT = 60;
const GLOBAL_LIMIT = 300;
const hits = new Map();
let globalHits = [];

function prune(list, now){
  return list.filter(t=> now - t < WINDOW_MS);
}

/** 1分あたりの回数制限（インスタンス内で数える簡易版。maxInstances:1 で運用する前提） */
export function checkRateLimit(clientId, now = Date.now()){
  globalHits = prune(globalHits, now);
  const mine = prune(hits.get(clientId) || [], now);
  if(globalHits.length >= GLOBAL_LIMIT || mine.length >= PER_CLIENT_LIMIT){
    hits.set(clientId, mine);
    const oldest = Math.min(...(mine.length >= PER_CLIENT_LIMIT ? mine : globalHits));
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((WINDOW_MS - (now - oldest)) / 1000)) };
  }
  mine.push(now);
  globalHits.push(now);
  hits.set(clientId, mine);
  if(hits.size > 1000){
    for(const [id, list] of hits){
      if(prune(list, now).length === 0) hits.delete(id);
    }
  }
  return { ok: true };
}
