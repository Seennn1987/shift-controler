import { S } from './state.js';

export const MATCHING_FACTOR_META = {
  prefPair: { label: '指定講師', field: 'prefPair' },
  courseSlotCoverage: { label: '希望コマ対応数', field: 'courseSlotCoverage', numeric: true },
  prefSubject: { label: '得意教科', field: 'prefSubject' },
  prefDay: { label: '講師希望コマ', field: 'prefDay' },
  fillBonus: { label: '同コマ担当中', field: 'fillBonus' },
  dayConsolidation: { label: '同日担当中', field: 'dayConsolidation' },
  lowRate: { label: 'コマ単価低い', field: null },
};

/** 旧設定 id（月内全コマ対応）からの移行用 */
const LEGACY_MATCHING_FACTOR_IDS = {
  monthFullCoverage: 'courseSlotCoverage',
};

export const DEFAULT_MATCHING_PRIORITY = [
  { id: 'prefPair', enabled: true },
  { id: 'courseSlotCoverage', enabled: true },
  { id: 'prefSubject', enabled: true },
  { id: 'prefDay', enabled: true },
  { id: 'fillBonus', enabled: true },
  { id: 'dayConsolidation', enabled: true },
  { id: 'lowRate', enabled: true },
];

export function normalizeMatchingPriority(raw){
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const result = [];
  list.forEach(item=>{
    if(!item || !item.id) return;
    const id = LEGACY_MATCHING_FACTOR_IDS[item.id] || item.id;
    if(!MATCHING_FACTOR_META[id] || seen.has(id)) return;
    seen.add(id);
    result.push({ id, enabled: item.enabled !== false });
  });
  DEFAULT_MATCHING_PRIORITY.forEach(def=>{
    if(seen.has(def.id)) return;
    result.push({ ...def });
  });
  return result;
}

export function getMatchingPriority(){
  return normalizeMatchingPriority(S.matchingPriority);
}

export function compareCandidateInfo(a, b){
  for(const item of getMatchingPriority()){
    if(!item.enabled) continue;
    if(item.id === 'lowRate'){
      const rateA = a.teacher.perLessonRate ?? Infinity;
      const rateB = b.teacher.perLessonRate ?? Infinity;
      if(rateA !== rateB) return rateA - rateB;
      continue;
    }
    const meta = MATCHING_FACTOR_META[item.id];
    const field = meta?.field;
    if(!field) continue;
    if(meta.numeric){
      const va = a[field] ?? 0;
      const vb = b[field] ?? 0;
      if(va !== vb) return vb - va;
      continue;
    }
    if(a[field] !== b[field]) return a[field] ? -1 : 1;
  }
  return 0;
}

export function buildCandidateBadgeLabels(cand){
  const labels = [];
  for(const item of getMatchingPriority()){
    if(!item.enabled) continue;
    if(item.id === 'lowRate') continue;
    if(item.id === 'courseSlotCoverage'){
      const covered = cand.courseSlotCoverage ?? 0;
      const total = cand.courseSlotCoverageTotal ?? 0;
      if(covered <= 0) continue;
      if(total > 0 && covered >= total) labels.push('全コマ対応');
      else if(total > 0) labels.push(`${covered}/${total}コマ`);
      continue;
    }
    const field = MATCHING_FACTOR_META[item.id]?.field;
    if(field && cand[field]) labels.push(MATCHING_FACTOR_META[item.id].label);
  }
  return labels;
}
