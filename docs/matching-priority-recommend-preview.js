const MATCHING_FACTOR_META = {
  prefPair: { title: '担当生徒に指定した講師', description: '生徒の教科ごとに「担当生徒にする」で登録した組み合わせを最優先にします。' },
  fillBonus: { title: '同じ時間帯で担当中', description: 'その曜日・時間にすでに別の生徒を担当している講師を優先します（人件費・移動の効率）。' },
  lowAddCost: { title: '追加のコストが低い順', description: 'この1コマで増える金額が小さい講師を優先します（新規出勤は交通費込み）。' },
  dayConsolidation: { title: '同じ日に複数コマ', description: '同じ曜日に他のコマも担当している講師を優先します（出勤日をまとめる）。' },
  courseSlotCoverage: { title: '希望コマの対応数', description: 'その生徒・教科の希望コマのうち、すでに担当できるコマが多い講師を優先します。' },
  prefSubject: { title: '「得意」教科の講師', description: '講師登録で★を付けた得意教科に当てはまる講師を優先します。' },
  prefDay: { title: 'シフト「○」のコマ', description: '月次シフトで「特に希望（○）」を出している曜日・時間を優先します。' },
};

const DEFAULT_MATCHING_PRIORITY = [
  { id: 'prefPair', enabled: true },
  { id: 'fillBonus', enabled: true },
  { id: 'lowAddCost', enabled: true },
  { id: 'dayConsolidation', enabled: true },
  { id: 'courseSlotCoverage', enabled: true },
  { id: 'prefSubject', enabled: true },
  { id: 'prefDay', enabled: true },
];

const MOVE_UP_SVG = '<svg class="matching-priority-move-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7.41 15.41 12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>';
const MOVE_DOWN_SVG = '<svg class="matching-priority-move-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6 6z"/></svg>';

/** 試し用：上へ・下へで動かしたあとの並び */
let priority = [
  { id: 'prefPair', enabled: true },
  { id: 'courseSlotCoverage', enabled: true },
  { id: 'prefSubject', enabled: true },
  { id: 'prefDay', enabled: true },
  { id: 'fillBonus', enabled: true },
  { id: 'dayConsolidation', enabled: true },
  { id: 'lowAddCost', enabled: true },
];

function cloneDefault(){
  return DEFAULT_MATCHING_PRIORITY.map(item=> ({ id: item.id, enabled: item.enabled !== false }));
}

function renderList(){
  const wrap = document.getElementById('matchingPriorityList');
  wrap.innerHTML = priority.map((item, idx)=>{
    const meta = MATCHING_FACTOR_META[item.id];
    const title = meta?.title || meta?.label || item.id;
    const description = meta?.description || '';
    const rowClass = item.enabled ? '' : ' is-disabled';
    const num = item.enabled ? String(idx + 1) : '—';
    const upDisabled = idx === 0 || !item.enabled;
    const downDisabled = idx === priority.length - 1 || !item.enabled;
    return `<div class="matching-priority-row${rowClass}" data-id="${item.id}">
      <span class="matching-priority-num" aria-hidden="true">${num}</span>
      <label class="matching-priority-main">
        <input type="checkbox" class="matching-priority-enabled" data-id="${item.id}" ${item.enabled ? 'checked' : ''} aria-label="この条件を使う">
        <span class="matching-priority-text">
          <span class="matching-priority-title">${title}</span>
          ${description ? `<span class="matching-priority-desc">${description}</span>` : ''}
        </span>
      </label>
      <div class="matching-priority-actions">
        <button type="button" class="matching-priority-move matching-priority-up" data-id="${item.id}" ${upDisabled ? 'disabled' : ''} aria-label="上へ">${MOVE_UP_SVG}<span class="matching-priority-move-text">上へ</span></button>
        <button type="button" class="matching-priority-move matching-priority-down" data-id="${item.id}" ${downDisabled ? 'disabled' : ''} aria-label="下へ">${MOVE_DOWN_SVG}<span class="matching-priority-move-text">下へ</span></button>
      </div>
    </div>`;
  }).join('');

  wrap.querySelectorAll('.matching-priority-enabled').forEach(input=>{
    input.addEventListener('change', ()=>{
      const row = priority.find(r=> r.id === input.dataset.id);
      if(!row) return;
      row.enabled = input.checked;
      renderList();
    });
  });
  wrap.querySelectorAll('.matching-priority-up').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = priority.findIndex(r=> r.id === btn.dataset.id);
      if(idx <= 0) return;
      const tmp = priority[idx - 1];
      priority[idx - 1] = priority[idx];
      priority[idx] = tmp;
      renderList();
    });
  });
  wrap.querySelectorAll('.matching-priority-down').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const idx = priority.findIndex(r=> r.id === btn.dataset.id);
      if(idx < 0 || idx >= priority.length - 1) return;
      const tmp = priority[idx + 1];
      priority[idx + 1] = priority[idx];
      priority[idx] = tmp;
      renderList();
    });
  });
}

document.getElementById('matchingPriorityRecommendBtn').addEventListener('click', ()=>{
  priority = cloneDefault();
  renderList();
});

renderList();
