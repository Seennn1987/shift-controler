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
  lowAddCost: {
    label: '追加のコストが低い',
    title: '追加のコストが低い順',
    description: 'この1コマで増える金額が小さい講師を優先します（新規出勤は交通費込み）。',
    field: 'addCost',
    numeric: true,
    lowerIsBetter: true,
  },
};

/** 旧設定 id（月内全コマ対応／コマ単価低い）からの移行用 */
const LEGACY_MATCHING_FACTOR_IDS = {
  monthFullCoverage: 'courseSlotCoverage',
  lowRate: 'lowAddCost',
};

export const DEFAULT_MATCHING_PRIORITY = [
  { id: 'prefPair', enabled: true },
  { id: 'fillBonus', enabled: true },
  { id: 'lowAddCost', enabled: true },
  { id: 'dayConsolidation', enabled: true },
  { id: 'courseSlotCoverage', enabled: true },
  { id: 'prefSubject', enabled: true },
  { id: 'prefDay', enabled: true },
];

/** 触っていない教室の旧デフォルト並び → 新デフォルトへ載せ替える判定用 */
const LEGACY_DEFAULT_MATCHING_PRIORITY = [
  { id: 'prefPair', enabled: true },
  { id: 'courseSlotCoverage', enabled: true },
  { id: 'prefSubject', enabled: true },
  { id: 'prefDay', enabled: true },
  { id: 'fillBonus', enabled: true },
  { id: 'dayConsolidation', enabled: true },
  { id: 'lowAddCost', enabled: true },
];

function clonePriorityList(list){
  return list.map(item=> ({ id: item.id, enabled: item.enabled !== false }));
}

function samePriorityList(a, b){
  if(a.length !== b.length) return false;
  return a.every((item, i)=>
    item.id === b[i].id && (item.enabled !== false) === (b[i].enabled !== false)
  );
}

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
  if(samePriorityList(result, LEGACY_DEFAULT_MATCHING_PRIORITY)){
    return clonePriorityList(DEFAULT_MATCHING_PRIORITY);
  }
  return result;
}

export function getMatchingPriority(){
  return normalizeMatchingPriority(S.matchingPriority);
}

export function compareCandidateInfo(a, b){
  for(const item of getMatchingPriority()){
    if(!item.enabled) continue;
    const meta = MATCHING_FACTOR_META[item.id];
    const field = meta?.field;
    if(!field) continue;
    if(meta.numeric){
      const fallback = meta.lowerIsBetter ? Infinity : 0;
      const va = a[field] ?? fallback;
      const vb = b[field] ?? fallback;
      if(va !== vb) return meta.lowerIsBetter ? va - vb : vb - va;
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
    if(item.id === 'lowAddCost') continue;
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
