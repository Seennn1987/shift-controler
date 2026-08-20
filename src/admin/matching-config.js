import { S } from './state.js';

export const MATCHING_FACTOR_META = {
  prefPair: { label: '指定講師', field: 'prefPair' },
  monthFullCoverage: { label: '月内全コマ対応', field: 'monthFullCoverage' },
  prefSubject: { label: '得意教科', field: 'prefSubject' },
  prefDay: { label: '講師希望コマ', field: 'prefDay' },
  fillBonus: { label: '同コマ担当中', field: 'fillBonus' },
  dayConsolidation: { label: '同日担当中', field: 'dayConsolidation' },
  lowRate: { label: 'コマ単価低い', field: null },
};

export const DEFAULT_MATCHING_PRIORITY = [
  { id: 'prefPair', enabled: true },
  { id: 'monthFullCoverage', enabled: true },
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
    if(!item || !MATCHING_FACTOR_META[item.id] || seen.has(item.id)) return;
    seen.add(item.id);
    result.push({ id: item.id, enabled: item.enabled !== false });
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
    const field = MATCHING_FACTOR_META[item.id]?.field;
    if(!field) continue;
    if(a[field] !== b[field]) return a[field] ? -1 : 1;
  }
  return 0;
}

export function buildCandidateBadgeLabels(cand){
  const labels = [];
  for(const item of getMatchingPriority()){
    if(!item.enabled) continue;
    if(item.id === 'lowRate') continue;
    const field = MATCHING_FACTOR_META[item.id]?.field;
    if(field && cand[field]) labels.push(MATCHING_FACTOR_META[item.id].label);
  }
  return labels;
}
