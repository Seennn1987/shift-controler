import { showAppNoticeDialog } from '../shared/app-confirm-dialog.js';

const STORAGE_KEY = 'pitacoma_admin_update_notice_seen';

const UPDATES = [
  {
    id: '2026-09-12-free-lessons',
    date: '2026年9月12日',
    title: '最初◯コマ無料を、生徒登録で付けられる',
    body: '入塾キャンペーン用です。チェックしたコマ数だけ、分析タブの売上を0円にします。講師へのお給料は今までどおりです。欠席は数えません。',
  },
  {
    id: '2026-09-12-payroll',
    date: '2026年9月12日',
    title: '給与集計タブを追加',
    body: '確定した授業のコマ給・交通費に、入力した事務時間の事務給を足します。確定したあとに「CSVをダウンロード」を押すと、クラウド給与に取り込むファイルが保存できます。',
  },
];

function escapeHtml(value){
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function latestId(){
  return UPDATES[0]?.id || '';
}

function readSeenId(){
  try{
    return localStorage.getItem(STORAGE_KEY) || '';
  }catch(_e){
    return '';
  }
}

function markSeen(){
  try{
    localStorage.setItem(STORAGE_KEY, latestId());
  }catch(_e){ /* private mode */ }
}

function hasUnread(){
  const latest = latestId();
  return !!latest && readSeenId() !== latest;
}

function syncNewBadge(){
  const badge = document.getElementById('updateNoticeNewBadge');
  if(!badge) return;
  badge.hidden = !hasUnread();
}

function buildExtraHtml(){
  const items = UPDATES.map(item=> `
    <li class="app-confirm-algorithm-pick">
      <span class="app-confirm-algorithm-label">${escapeHtml(item.date)}</span>
      <span class="app-confirm-algorithm-pick-title">${escapeHtml(item.title)}</span>
      <span class="app-confirm-algorithm-pick-desc">${escapeHtml(item.body)}</span>
    </li>
  `).join('');
  return `<div class="app-confirm-algorithm">
    <ol class="app-confirm-algorithm-picks">${items}</ol>
  </div>`;
}

async function openUpdateNotice(){
  markSeen();
  syncNewBadge();
  await showAppNoticeDialog({
    title: '機能の更新',
    extraHtml: buildExtraHtml(),
    confirmLabel: '閉じる',
  });
}

function initUpdateNotice(){
  const btn = document.getElementById('updateNoticeBtn');
  if(!btn) return;
  btn.addEventListener('click', ()=>{ openUpdateNotice(); });
  syncNewBadge();
}

export { initUpdateNotice };
