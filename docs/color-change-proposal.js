/**
 * 配色 — 今の状態からこれから変えることだけ
 * （反映済みの旧↔提案比較は含めない）
 */
const TOKENS = {
  brand50: '#ECF2FD',
  brand100: '#EDF5FE',
  brand500: '#3B7DE9',
  brand600: '#0054AC',
  surfaceMuted: '#EFF1F4',
  surfacePage: '#F7F7F7',
  inkSoft: '#787E8D',
  ink: '#333333',
  successBg: '#EEF6EB',
  success: '#65AB51',
  warningBg: '#FCF8E3',
  warningInk: '#8A6D3B',
};

/** 残り作業のみ。now = 今のコード、after = 変更後 */
const REMAINING = [
  {
    id: 'bulk-hover',
    place: '一括自動仮組みボタン（マウスを乗せたとき）',
    screen: 'カレンダー上部',
    now: { hex: '#F0DCA0', label: '薄黄色', preview: 'background:#F0DCA0;color:#333;padding:8px 16px;border-radius:8px;font-weight:700;' },
    after: { hex: TOKENS.brand50, label: '薄青', preview: `background:${TOKENS.brand50};color:${TOKENS.brand600};padding:8px 16px;border-radius:8px;font-weight:700;border:1px solid ${TOKENS.brand500};` },
    reason: '黄色 hover が残っている。UI全体の青系と揃える。',
    file: 'admin.css — #bulkAutoBtn:hover',
  },
  {
    id: 'alt-hover',
    place: '代替日程ボタン（マウスを乗せたとき）',
    screen: '生徒登録・マッチング',
    now: { hex: '#F0DCA0', label: '薄黄色', preview: 'background:#F0DCA0;color:#333;padding:6px 12px;border-radius:6px;' },
    after: { hex: TOKENS.brand50, label: '薄青', preview: `background:${TOKENS.brand50};color:${TOKENS.brand600};padding:6px 12px;border-radius:6px;` },
    reason: '上と同じく hover だけ黄色が残存。',
    file: 'admin.css — .alt-toggle-btn:hover',
  },
  {
    id: 'closed-tint',
    place: '講師基本スケジュール表の「定休」マス',
    screen: '講師登録タブ',
    now: { hex: '#FBF6E6', label: '黄みクリーム', preview: 'background:#FBF6E6;color:#333;padding:12px;text-align:center;' },
    after: { hex: TOKENS.surfaceMuted, label: 'MF cloudGrey', preview: `background:${TOKENS.surfaceMuted};color:${TOKENS.inkSoft};padding:12px;text-align:center;` },
    reason: '表全体が黄みっぽく見える原因のひとつ。',
    file: 'admin.css — .closed-day-tint',
  },
  {
    id: 'closed-label',
    place: '定休マス右上の「定休」文字',
    screen: '講師登録タブ',
    now: { hex: '#A06A00', label: '橙茶', preview: 'color:#A06A00;font-weight:700;font-size:11px;' },
    after: { hex: TOKENS.inkSoft, label: '補助グレー', preview: `color:${TOKENS.inkSoft};font-weight:700;font-size:11px;` },
    reason: '定休は中立グレーで十分。橙は社会タグと近い。',
    file: 'admin.css — .closed-day-col::after',
  },
  {
    id: 'pref-pair-text',
    place: '優先ペア設定の行テキスト',
    screen: '生徒登録タブ',
    now: { hex: '#5A3F00', label: '暗い茶', preview: 'color:#5A3F00;font-weight:700;' },
    after: { hex: TOKENS.ink, label: '本文色', preview: `color:${TOKENS.ink};font-weight:700;` },
    reason: '茶色直書きをやめ、通常テキスト色に統一。',
    file: 'admin.css — .pref-pair-row .ppr-text',
  },
  {
    id: 'pref-disabled',
    place: '優先ペアフォーム（無効な選択肢）',
    screen: '生徒登録タブ',
    now: { hex: '#F1EFE8', label: '黄みグレー', preview: 'background:#F1EFE8;color:#787E8D;padding:8px;' },
    after: { hex: TOKENS.surfaceMuted, label: 'surface-muted', preview: `background:${TOKENS.surfaceMuted};color:${TOKENS.inkSoft};padding:8px;` },
    reason: '無効状態も MF の中立グレーに。',
    file: 'admin.css — .pref-pair-form select:disabled',
  },
  {
    id: 'absent-tag',
    place: 'カレンダー内の「欠席」授業タグ',
    screen: 'カレンダー',
    now: { hex: '#EEEEEE', label: '直書きグレー', preview: 'background:#eee;color:#999;text-decoration:line-through;padding:4px 8px;font-size:11px;font-weight:700;' },
    after: { hex: TOKENS.surfacePage, label: 'surface-page', preview: `background:${TOKENS.surfacePage};color:${TOKENS.inkSoft};text-decoration:line-through;padding:4px 8px;font-size:11px;font-weight:700;` },
    reason: '提案の「欠席＝グレー＋打消し線」にトークン化。',
    file: 'admin.css — .cal-entry.absent',
  },
  {
    id: 'status-ok',
    place: '未充足ゼロのときのステータスバー',
    screen: 'カレンダー上部',
    now: { hex: '#EFF1F4', label: '背景OK / 枠が旧緑', preview: `background:${TOKENS.surfaceMuted};border:2px solid rgba(46,125,50,.18);padding:10px;border-radius:8px;` },
    after: { hex: TOKENS.successBg, label: 'success-bg', preview: `background:${TOKENS.successBg};border:2px solid ${TOKENS.success};padding:10px;border-radius:8px;color:${TOKENS.success};` },
    reason: '枠線だけ旧デザインの緑が残っている。',
    file: 'admin.css — .cal-status-bar.is-ok',
  },
  {
    id: 'bulk-success',
    place: '一括仮組み成功メッセージ',
    screen: 'カレンダー・コマを組む',
    now: { hex: '#EFF1F4', label: 'グレー背景（success未使用）', preview: `background:${TOKENS.surfaceMuted};color:${TOKENS.ink};padding:10px;border-radius:8px;` },
    after: { hex: TOKENS.successBg, label: 'success-bg', preview: `background:${TOKENS.successBg};color:${TOKENS.success};padding:10px;border-radius:8px;font-weight:700;` },
    reason: '成功は MF apple 系のトークンを使う。',
    file: 'admin.css — .bulk-auto-result.success',
  },
];

const KEEP = [
  { title: '教科タグ（国・数・英・理・社）', note: '色相固定の HSL。変更なし。' },
  { title: '未確定タグ', note: 'すでに薄青（#ECF2FD）＋青破線。触らない。' },
  { title: '警告系（一括仮組みボタン本体・季節講習バッジ等）', note: '提案どおり cornSilk 薄黄。カレンダー外の警告として意図的に残す。' },
  { title: 'ヘッダー・タブ・メインボタン・今日・選択中', note: '反映済み。' },
];

function renderCurrentState() {
  document.getElementById('currentState').innerHTML = `
    <ul class="state-list">
      <li><code>variables.css</code> は MF 系トークン（青・薄青・グレー）に更新済み</li>
      <li>カレンダーの「今日」「選択中」「未確定」も提案どおり反映済み</li>
      <li><strong>残りは CSS に直書きされた黄色・茶色が ${REMAINING.length} か所</strong>（下表）。見た目を揃えるだけの小さな修正</li>
    </ul>
  `;
  document.getElementById('changeCount').textContent = String(REMAINING.length);
}

function renderRemaining() {
  document.getElementById('remainingChanges').innerHTML = REMAINING.map((c, i) => `
    <details class="change-card" ${i < 2 ? 'open' : ''}>
      <summary>
        <span class="change-screen">${c.screen}</span>
        ${c.place}
      </summary>
      <div class="change-card-body">
        <div class="change-visual">
          <div class="change-swatch-box">
            <div class="change-swatch-label">今</div>
            <div class="change-swatch-preview" style="${c.now.preview}">サンプル</div>
            <div class="change-swatch-meta">${c.now.label} <code>${c.now.hex}</code></div>
          </div>
          <div class="change-arrow">→</div>
          <div class="change-swatch-box">
            <div class="change-swatch-label proposed">変更後</div>
            <div class="change-swatch-preview" style="${c.after.preview}">サンプル</div>
            <div class="change-swatch-meta">${c.after.label} <code>${c.after.hex}</code></div>
          </div>
        </div>
        <p class="change-reason">${c.reason}</p>
        <p class="change-file"><small>${c.file}</small></p>
      </div>
    </details>
  `).join('');
}

function renderKeep() {
  document.getElementById('keepAsIs').innerHTML = KEEP.map(k => `
    <div class="keep-card">
      <div class="keep-title">${k.title}</div>
      <div class="keep-note">${k.note}</div>
    </div>
  `).join('');
}

function renderTable() {
  document.querySelector('#changeTable tbody').innerHTML = REMAINING.map(c => `
    <tr>
      <td><strong>${c.place}</strong><br><small>${c.screen}</small></td>
      <td><code>${c.now.hex}</code><br>${c.now.label}</td>
      <td><code>${c.after.hex}</code><br>${c.after.label}</td>
      <td>${c.reason}</td>
    </tr>
  `).join('');
}

function renderAction() {
  document.getElementById('actionBox').innerHTML = `
    <p>上記 <strong>${REMAINING.length} か所</strong>だけ <code>admin.css</code> の直書き色をトークンに置き換えます。画面構成・機能は変えません。</p>
    <ol>
      <li>「y」で承認 → 上記を一括反映</li>
      <li>カレンダー・講師登録・一括仮組みを目視確認</li>
      <li>（任意）<code>--green-*</code> 変数名を <code>--brand-*</code> に整理（見た目は同じ）</li>
    </ol>
  `;
}

renderCurrentState();
renderRemaining();
renderKeep();
renderTable();
renderAction();
