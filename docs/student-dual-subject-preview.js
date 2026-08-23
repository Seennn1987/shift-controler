/** プレビュー用デモ（静的データ） */
const SUBJECT_COLORS = {
  国語: { bg: '#FDE8E8', text: '#8B2942' },
  算数: { bg: '#E8F4E8', text: '#2D5016' },
  英語: { bg: '#E8EEF8', text: '#1A3A6B' },
  理科: { bg: '#F0E8F8', text: '#4A2060' },
  社会: { bg: '#FDF0E0', text: '#6B4423' },
};
const DAYS = ['月','火','水','木','金','土'];
const SLOTS = [
  { id: 4, label: '4講', time: '14:50〜16:20' },
  { id: 5, label: '5講', time: '16:40〜18:10' },
];
const DEMO = {
  '月-4': { type: 'dual', subjects: ['国語', '算数'], badge: '両方対応（3名）', cls: 'is-ready' },
  '火-4': { type: 'single', subject: '英語', badge: '組める（5名）', cls: 'is-ready' },
};

function renderCalendar(){
  const root = document.getElementById('calendarDemo');
  let html = '<table class="avail-grid"><thead><tr><th class="slot-h">時間割</th>';
  DAYS.forEach(d=>{ html += `<th>${d}</th>`; });
  html += '</tr></thead><tbody>';
  SLOTS.forEach(slot=>{
    html += `<tr><th class="slot-h">${slot.label}<br><span class="slot-time">${slot.time}</span></th>`;
    DAYS.forEach(day=>{
      const key = `${day}-${slot.id}`;
      const cell = DEMO[key];
      if(cell?.type === 'dual'){
        const tags = cell.subjects.map(s=>{
          const c = SUBJECT_COLORS[s];
          return `<span class="scc-subject-name" style="background:${c.bg};color:${c.text};">${s}</span>`;
        }).join('<span class="scc-dual-plus">+</span>');
        html += `<td class="scc-cell"><button type="button" class="scc-slot-btn" data-key="${key}">
          <span class="scc-dual-tags">${tags}</span>
          <span class="scc-dual-mode-label">90分・2教科</span>
          <span class="scc-cell-badge match-status-badge ${cell.cls}">${cell.badge}</span>
        </button></td>`;
      }else if(cell?.type === 'single'){
        const c = SUBJECT_COLORS[cell.subject];
        html += `<td class="scc-cell"><button type="button" class="scc-slot-btn" data-key="${key}">
          <span class="scc-subject-name" style="background:${c.bg};color:${c.text};">${cell.subject}</span>
          <span class="scc-cell-badge match-status-badge ${cell.cls}">${cell.badge}</span>
        </button></td>`;
      }else{
        html += `<td class="scc-cell"><button type="button" class="scc-slot-btn scc-empty-btn" data-key="${key}">＋</button></td>`;
      }
    });
    html += '</tr>';
  });
  html += '</tbody></table>';
  root.innerHTML = html;
  root.querySelectorAll('.scc-slot-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> openPopover(btn, btn.dataset.key));
  });
}

function openPopover(anchor, key){
  document.querySelector('.student-course-popover')?.remove();
  const pop = document.createElement('div');
  pop.className = 'student-course-popover';
  pop.innerHTML = `
    <div class="scp-slot-context">月曜 4講（14:50〜16:20）</div>
    <div class="scp-title">教科を選択</div>
    <p class="scp-hint">通常は<strong>1教科・90分</strong>です。国語と算数を続けて教える生徒だけ、下の「2教科で登録」を使います。</p>
    <div class="scp-section-label">1教科・90分（通常）</div>
    <div class="scp-subjects">${Object.keys(SUBJECT_COLORS).map(sub=>{
      const c = SUBJECT_COLORS[sub];
      return `<button type="button" class="scp-subject-row"><span class="scc-subject-name" style="background:${c.bg};color:${c.text};">${sub}</span><span class="match-status-badge is-ready">組める</span></button>`;
    }).join('')}</div>
    <details open class="scp-dual-details" style="margin-top:10px;border-top:1px solid #ddd;padding-top:8px;">
      <summary style="font-size:12px;font-weight:700;color:#666;cursor:pointer;">2教科で登録（45分×2）— 必要な場合のみ</summary>
      <div style="margin-top:8px;">
    <div class="scp-dual-row"><span class="scp-dual-label">1教科目</span>
      <div class="scp-dual-chips">${chipHtml('a', '国語')}</div></div>
    <div class="scp-dual-row"><span class="scp-dual-label">2教科目</span>
      <div class="scp-dual-chips">${chipHtml('b', '算数')}</div></div>
    <span class="match-status-badge is-ready">両方対応（3名）</span>
    <button type="button" class="confirm-btn" style="margin-top:8px;">2教科で登録</button>
      </div>
    </details>
  `;
  document.body.appendChild(pop);
  const rect = anchor.getBoundingClientRect();
  pop.style.top = `${rect.bottom + 4}px`;
  pop.style.left = `${Math.min(rect.left, window.innerWidth - pop.offsetWidth - 8)}px`;
}

function chipHtml(role, selected){
  return Object.keys(SUBJECT_COLORS).map(sub=>{
    const c = SUBJECT_COLORS[sub];
    const sel = sub === selected ? ' is-selected-a' : '';
    return `<button type="button" class="scp-dual-chip${sel}" style="background:${c.bg};color:${c.text};">${sub}</button>`;
  }).join('');
}

document.getElementById('summaryDemo').innerHTML = `
  <span class="scc-subject-name" style="background:#FDE8E8;color:#8B2942;">国語 週1コマ</span>
  <span class="scc-subject-name" style="background:#E8F4E8;color:#2D5016;">算数 週1コマ</span>
  <span class="scc-subject-name" style="background:#E8EEF8;color:#1A3A6B;">英語 週1コマ</span>
`;
renderCalendar();
