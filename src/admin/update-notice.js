import { showAppNoticeDialog } from '../shared/app-confirm-dialog.js';

const STORAGE_KEY = 'pitacoma_admin_update_notice_seen';

const UPDATES = [
  {
    id: '2026-09-15-leave-status',
    date: '2026年9月15日',
    title: '生徒の退会・講師の退社を、一覧から付けられる',
    body: '生徒登録・講師登録の一覧で、「退会」「退社」を1回押すと設定できます。退会・退社した人はグレーになり、授業を組む画面には出ません。一覧の「退会者を非表示」「退職者を非表示」がオンのときは、リストからも隠れます。押し間違えたときは「在籍に戻す」で戻せます。削除は、打ち間違いの登録を消すとき用です。',
  },
  {
    id: '2026-09-15-holiday-select',
    date: '2026年9月15日',
    title: '祝日の休校を、1日ずつ選べる',
    body: '「設定」の休校日設定です。これまで祝日は全部休校か全部授業の2択でした。「まとめて休校」はそのまま使え、一覧のチェックを外せばその日だけ授業日にできます。カレンダーと講師画面にも届きます。',
  },
  {
    id: '2026-09-12-owner-teacher',
    date: '2026年9月12日',
    title: '教室長が、自分で授業を持てる',
    body: '講師登録は不要です。コマを組むときの候補の一番下に「教室長」が出ます。「この講師に依頼」を押すと、その場で確定します。費用は0円で、自動で組むときは使いません。やめるときは今までどおり「確定を解除」です。',
  },
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
