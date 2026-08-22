import { S } from './state.js';

export const MATCHING_FACTOR_META = {
  prefPair: {
    label: '担当生徒',
    title: '担当生徒に指定した講師',
    description: '生徒の教科ごとに「担当生徒にする」で登録した組み合わせを最優先にします。',
    field: 'prefPair',
  },
  courseSlotCoverage: {
    label: '希望コマ対応数',
    title: '希望コマの対応数',
    description: 'その生徒・教科の希望コマのうち、すでに担当できるコマが多い講師を優先します。',
    field: 'courseSlotCoverage',
    numeric: true,
  },
  prefSubject: {
    label: '得意教科',
    title: '「得意」教科の講師',
    description: '講師登録で★を付けた得意教科に当てはまる講師を優先します。',
    field: 'prefSubject',
  },
  prefDay: {
    label: '講師希望コマ',
    title: 'シフト「○」のコマ',
    description: '月次シフトで「特に希望（○）」を出している曜日・時間を優先します。',
    field: 'prefDay',
  },
  fillBonus: {
    label: '同コマ担当中',
    title: '同じ時間帯で担当中',
    description: 'その曜日・時間にすでに別の生徒を担当している講師を優先します（人件費・移動の効率）。',
    field: 'fillBonus',
  },
  dayConsolidation: {
    label: '同日担当中',
    title: '同じ日に複数コマ',
    description: '同じ曜日に他のコマも担当している講師を優先します（出勤日をまとめる）。',
    field: 'dayConsolidation',
  },
  lowRate: {
    label: 'コマ単価低い',
    title: 'コマ単価が低い順',
    description: '上記が同じ場合、1コマあたりの単価が低い講師を優先します。',
    field: null,
  },
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
