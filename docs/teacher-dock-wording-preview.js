/** 見出し × 青ボタン — 20案（「返事」不使用） */
const WORDING = [
  { id: 'W1', title: '授業依頼', btn: '教室長に送る', note: '最短。見出しとボタンで役割分担。' },
  { id: 'W2', title: '授業依頼', btn: '承認・辞退を送る', note: '中身（承認/辞退）をボタンに明示。' },
  { id: 'W3', title: '授業依頼への対応', btn: '教室長に送る', note: '「返事」の代わりに対応。' },
  { id: 'W4', title: '授業依頼への対応', btn: '選択内容を送る', note: 'カレンダーで選んだ内容、という意味。' },
  { id: 'W5', title: '承認・辞退', btn: '教室長に送る', note: '操作名を見出しに。シンプル。' },
  { id: 'W6', title: '承認・辞退', btn: '承認・辞退を送る', note: '見出しとボタンが同系統で一貫。★候補' },
  { id: 'W7', title: '教室長からの依頼', btn: '教室長に送る', note: '誰から来た依頼かを見出しで示す。' },
  { id: 'W8', title: '教室長からの依頼', btn: '承認・辞退を送る', note: '依頼元＋操作を両方はっきり。' },
  { id: 'W9', title: '依頼コマ', btn: '教室長に送る', note: 'コマ単位の依頼であることが伝わる。' },
  { id: 'W10', title: '依頼コマ', btn: '選択を送る', note: '短いボタン。' },
  { id: 'W11', title: '授業の承認・辞退', btn: '教室長に送る', note: '授業＋操作を見出しにまとめる。' },
  { id: 'W12', title: '授業の承認・辞退', btn: '承認・辞退を送る', note: 'やや長いが誤解が少ない。' },
  { id: 'W13', title: '未送信の選択', btn: '教室長に送る', note: '状態（未送信）を見出しに。' },
  { id: 'W14', title: '未送信の選択', btn: '選択内容を送る', note: '下書き感が出る。' },
  { id: 'W15', title: '依頼への回答', btn: '教室長に送る', note: '「返事」より硬い「回答」。' },
  { id: 'W16', title: '依頼への回答', btn: '回答を送る', note: '回答を送る、とボタンも揃える。' },
  { id: 'W17', title: 'コマの承認待ち', btn: '教室長に送る', note: '状態寄りの見出し。' },
  { id: 'W18', title: 'コマの承認待ち', btn: '承認・辞退を送る', note: '状態＋操作。' },
  { id: 'W19', title: '授業依頼（1コマ）', btn: '教室長に送る', note: '件数を見出しに含める。' },
  { id: 'W20', title: '授業依頼（1コマ）', btn: '承認・辞退を送る', note: '件数＋操作。' },
];

/** 状態2行フォーマット — 10案 */
const FORMATS = [
  {
    id: 'F1',
    title: 'F1 — ラベル：値（2行）',
    recommend: true,
    note: '左にラベル、右に値。教室長向け画面の表記に近い。',
    html: `
      <div class="fmt-kv">
        <dt>未対応</dt><dd class="is-alert">1コマ</dd>
        <dt>下書き</dt><dd class="is-draft">2件（承認1·辞退1）</dd>
      </div>`,
  },
  {
    id: 'F2',
    title: 'F2 — チップ2つ',
    note: '状態をチップで分離。一覧性が高い。',
    html: `
      <div class="fmt-chips">
        <span class="fmt-chip is-alert">未対応 1コマ</span>
        <span class="fmt-chip is-draft">下書き 2件</span>
        <span class="fmt-chip is-approve">承認1</span>
        <span class="fmt-chip is-decline">辞退1</span>
      </div>`,
  },
  {
    id: 'F3',
    title: 'F3 — 1行目件数／2行目内訳',
    note: '1行目で全体、2行目で内訳のみ。',
    html: `
      <p class="fmt-line" style="color:var(--danger);font-weight:bold;">未対応 1コマ</p>
      <p class="fmt-line" style="color:var(--green-800);font-weight:bold;">承認1 · 辞退1 <span style="color:var(--ink-soft);font-weight:normal;">（送る前）</span></p>`,
  },
  {
    id: 'F4',
    title: 'F4 — 区切り線つき1行',
    note: '1行にまとめる。横幅に余裕があるとき向き。',
    html: `<p class="fmt-inline is-alert">未対応 1コマ<span class="sep">｜</span><span class="is-draft">下書き 承認1・辞退1</span></p>`,
  },
  {
    id: 'F5',
    title: 'F5 — ミニ表（2行）',
    note: '表形式で整列。数字が揃って読みやすい。',
    html: `
      <table class="fmt-table">
        <tr><th>未対応</th><td style="color:var(--danger);font-weight:bold;">1コマ</td></tr>
        <tr><th>下書き</th><td style="color:var(--green-800);font-weight:bold;">2件 — 承認1 · 辞退1</td></tr>
      </table>`,
  },
  {
    id: 'F6',
    title: 'F6 — 数字強調',
    note: '数字だけ大きく（CSSは本番で調整）。要点が目に入る。',
    html: `
      <p class="fmt-line"><span style="color:var(--danger);font-weight:900;font-size:15px;">1</span> コマ未対応</p>
      <p class="fmt-line"><span style="color:var(--green-800);font-weight:900;font-size:15px;">2</span> 件の下書き <span style="color:var(--ink-soft);">（承認1 · 辞退1）</span></p>`,
  },
  {
    id: 'F7',
    title: 'F7 — 承認／辞退を先に',
    note: '操作の内訳を先に、未対応コマ数を後に。',
    html: `
      <p class="fmt-line" style="color:var(--green-800);font-weight:bold;">承認1 · 辞退1 <span style="font-weight:normal;color:var(--ink-soft);">— 送る前</span></p>
      <p class="fmt-line" style="color:var(--danger);font-weight:bold;">あと 1コマ 未選択</p>`,
  },
  {
    id: 'F8',
    title: 'F8 — ステップ表示',
    note: '①選ぶ ②送る の流れが伝わる。',
    html: `
      <p class="fmt-line"><span style="color:var(--ink-soft);">①</span> <strong style="color:var(--danger);">1コマ</strong> カレンダーで未選択</p>
      <p class="fmt-line"><span style="color:var(--ink-soft);">②</span> <strong style="color:var(--green-800);">2件</strong> 送る前（承認1 · 辞退1）</p>`,
  },
  {
    id: 'F9',
    title: 'F9 — コンパクトKV（1行×2）',
    note: 'F1の圧縮版。ラベル幅を狭く。',
    html: `
      <div class="fmt-kv" style="grid-template-columns:56px 1fr;">
        <dt>未対応</dt><dd class="is-alert">1コマ</dd>
        <dt>下書き</dt><dd class="is-draft">承認1·辞退1</dd>
      </div>`,
  },
  {
    id: 'F10',
    title: 'F10 — バッジ＋テキスト',
    note: '未対応だけ色バッジ、下書きは通常文字。',
    html: `
      <div class="fmt-chips" style="margin-bottom:4px;">
        <span class="fmt-chip is-alert">未対応 1コマ</span>
      </div>
      <p class="fmt-line" style="color:var(--green-800);font-weight:bold;margin:0;">下書き 2件（承認1 · 辞退1）</p>`,
  },
];

const APPROVE_ALL = '残り1コマをすべて承認';
const SHIFT_SUBMIT = 'シフトを提出する';
const SHIFT_CHANGE = '変更を教室長に送る（2件）';

function lessonDock(title, btnLabel, statusHtml){
  return `
    <div class="submit-dock">
      <div class="submit-dock-block is-lesson">
        <div class="submit-dock-head">
          <div class="submit-dock-lines">
            <p class="submit-dock-title">${title}</p>
            ${statusHtml}
          </div>
          <div class="submit-dock-actions is-stacked">
            <button type="button" class="btn-primary">${btnLabel}</button>
            <button type="button" class="btn-ghost">${APPROVE_ALL}</button>
          </div>
        </div>
      </div>
      ${shiftDockDraft()}
    </div>`;
}

function shiftDockDraft(){
  return `
    <div class="submit-dock-block is-shift">
      <div class="submit-dock-head">
        <div class="submit-dock-lines">
          <div class="shift-head-row">
            <p class="submit-dock-title" style="margin:0;">シフト</p>
            <span class="status-badge draft">未提出</span>
          </div>
        </div>
        <div class="submit-dock-actions is-stacked">
          <button type="button" class="btn-primary">${SHIFT_SUBMIT}</button>
        </div>
      </div>
    </div>`;
}

function shiftDockSubmitted(){
  return `
    <div class="submit-dock-block is-shift">
      <div class="submit-dock-head">
        <div class="submit-dock-lines">
          <div class="shift-head-row">
            <p class="submit-dock-title" style="margin:0;">シフト</p>
            <span class="status-badge submitted">提出済</span>
            <span class="status-badge change">変更あり</span>
          </div>
        </div>
        <div class="submit-dock-actions is-stacked">
          <button type="button" class="btn-request">${SHIFT_CHANGE}</button>
        </div>
      </div>
    </div>`;
}

const DEFAULT_STATUS = FORMATS[0].html;

function renderPremise(){
  document.getElementById('premiseBox').innerHTML = `
    <strong>今回直すこと</strong><br>
    ・「返事」という言葉は使わない（授業依頼への返事／返事を送る の違和感を解消）<br>
    ・シフトの説明文「空きコマの○△×を…」は<strong>表示しない</strong>（バッジとボタンだけ）<br>
    ・状態2行は<strong>ラベル付き</strong>にして読みやすくする
  `;
}

function renderBadge(){
  document.getElementById('badgeBox').innerHTML = `
    <strong>Q: 未提出だけバッジ？</strong><br>
    いいえ。<strong>提出済</strong>もバッジを付けます。変更があるときは <strong>変更あり</strong> を追加（提出済＋変更ありの2つ）。<br>
    授業ブロックは件数が変わるためバッジではなく<strong>フォーマット行</strong>で示します。
  `;
  document.getElementById('badgeDemo').innerHTML = `
    <span class="status-badge draft">未提出</span>
    <span class="status-badge submitted">提出済</span>
    <span class="status-badge change">変更あり</span>
    <span style="font-size:var(--text-sm);color:var(--ink-soft);">← シフトブロックで使う組み合わせ例</span>
  `;
}

function renderWordGrid(){
  document.getElementById('recommendW').innerHTML = `
    文言のおすすめ: <strong>W6</strong>（見出し「承認・辞退」＋ボタン「承認・辞退を送る」）または <strong>W2</strong>（見出し「授業依頼」＋ボタン「承認・辞退を送る」）。番号で選んでください。
  `;
  document.getElementById('wordGrid').innerHTML = WORDING.map(w=> `
    <div class="sample-card">
      <div class="sample-card-head">
        <span>${w.id} — ${w.title}／${w.btn}</span>
        ${w.id === 'W6' ? '<span class="tag-rec">★候補</span>' : ''}
      </div>
      <div class="sample-card-body">
        ${lessonDock(w.title, w.btn, DEFAULT_STATUS)}
        <p class="sample-note">${w.note}</p>
      </div>
    </div>
  `).join('');
}

function renderFormatGrid(){
  const w = WORDING.find(x=> x.id === 'W6');
  document.getElementById('recommendF').innerHTML = `
    フォーマットのおすすめ: <strong>F1</strong>（未対応／下書きのラベル付き2行）または <strong>F2</strong>（チップ）。「返事待ち」「送る前 —」のような自由文より、<strong>項目名＋値</strong>の方が教室長・講師ともに読みやすいです。
  `;
  document.getElementById('formatGrid').innerHTML = FORMATS.map(f=> `
    <div class="sample-card">
      <div class="sample-card-head">
        <span>${f.title}</span>
        ${f.recommend ? '<span class="tag-rec">★候補</span>' : ''}
      </div>
      <div class="sample-card-body">
        ${lessonDock(w.title, w.btn, f.html)}
        <p class="sample-note">${f.note}</p>
      </div>
    </div>
  `).join('');
}

renderPremise();
renderBadge();
renderWordGrid();
renderFormatGrid();
