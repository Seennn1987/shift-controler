const COPY = {
  lessonTitle: '授業の承認・辞退',
  lessonSubmit: '確認結果を提出する',
  lessonApproveAll: '残り1コマをすべて承認',
  shiftTitle: 'シフト',
  shiftSubmit: 'シフトを提出する',
};

const STATUS_KV = `
  <dl class="fmt-kv">
    <dt>未対応</dt><dd class="is-alert">1コマ</dd>
    <dt>下書き</dt><dd class="is-draft">2件（承認1·辞退1）</dd>
  </dl>`;

function lessonBlock(options = {}){
  const { showTitle = true, statusHtml = STATUS_KV, actionsLayout = 'stacked' } = options;
  const title = showTitle ? `<p class="dock-title">${COPY.lessonTitle}</p>` : '';
  const actionsClass = actionsLayout === 'stacked' ? 'dock-actions' : 'dock-actions is-inline';
  return `
    <div class="dock-inner-head">
      <div class="dock-lines">
        ${title}
        ${statusHtml}
      </div>
      <div class="${actionsClass}">
        <button type="button" class="btn-primary">${COPY.lessonSubmit}</button>
        <button type="button" class="btn-ghost">${COPY.lessonApproveAll}</button>
      </div>
    </div>`;
}

function shiftBlock(){
  return `
    <div class="dock-inner-head">
      <div class="dock-lines">
        <div class="shift-row">
          <p class="dock-title" style="margin:0;">${COPY.shiftTitle}</p>
          <span class="status-badge draft">未提出</span>
        </div>
      </div>
      <div class="dock-actions">
        <button type="button" class="btn-primary">${COPY.shiftSubmit}</button>
      </div>
    </div>`;
}

function wrapDock(className, lessonInner, shiftInner){
  return `<div class="${className}">
    <div class="dock-section is-lesson">${lessonInner}</div>
    <div class="dock-section is-shift">${shiftInner}</div>
  </div>`;
}

const DESIGNS = [
  {
    id: 'D1',
    title: 'D1 — 白1枚・区切り線だけ',
    recommend: true,
    note: '上下同じ白背景。役割の違いは見出しと区切り線のみ。いちばん中立。',
    build(){
      return wrapDock('dock-d1', lessonBlock(), shiftBlock());
    },
  },
  {
    id: 'D2',
    title: 'D2 — 全体を薄グレー1色',
    note: 'カード全体が薄グレー。上だけ色、という違和感がない。',
    build(){
      return wrapDock('dock-d2', lessonBlock(), shiftBlock());
    },
  },
  {
    id: 'D3',
    title: 'D3 — 見出し帯だけ薄青',
    note: '色は見出し1行分だけ。本文エリアは白のまま。',
    build(){
      const shiftNoTitle = `
        <div class="dock-inner-head">
          <div class="dock-lines"></div>
          <div class="dock-actions">
            <button type="button" class="btn-primary">${COPY.shiftSubmit}</button>
          </div>
        </div>`;
      return `<div class="dock-d3">
        <div class="dock-section is-lesson">
          <div class="dock-band"><p class="dock-title">${COPY.lessonTitle}</p></div>
          ${lessonBlock({ showTitle: false })}
        </div>
        <div class="dock-section is-shift">
          <div class="dock-band"><p class="dock-title">${COPY.shiftTitle}</p><span class="status-badge draft">未提出</span></div>
          ${shiftNoTitle}
        </div>
      </div>`;
    },
  },
  {
    id: 'D4',
    title: 'D4 — 2段とも同じ薄青',
    note: '上下均等に薄青。左太線なし。ブロック全体がセットに見える。',
    build(){
      return wrapDock('dock-d4', lessonBlock(), shiftBlock());
    },
  },
  {
    id: 'D5',
    title: 'D5 — 白＋軽い影',
    note: '色付けせず、影でカード感。提出エリアが浮いて見える。',
    build(){
      return wrapDock('dock-d5', lessonBlock(), shiftBlock());
    },
  },
  {
    id: 'D6',
    title: 'D6 — 小ラベルチップ見出し',
    recommend: true,
    note: '「授業」「シフト」の丸ラベルのみ色。左線・帯背景なし。',
    build(){
      return `<div class="dock-d6">
        <div class="dock-section is-lesson">
          <span class="dock-section-label is-lesson">授業</span>
          ${lessonBlock()}
        </div>
        <div class="dock-section is-shift">
          <span class="dock-section-label is-shift">シフト</span>
          ${shiftBlock()}
        </div>
      </div>`;
    },
  },
  {
    id: 'D7',
    title: 'D7 — 本文とボタンの間に縦線',
    note: '左太線の代わりに、文字列とボタン列の間だけ1pxの縦線。',
    build(){
      return wrapDock('dock-d7', lessonBlock(), shiftBlock());
    },
  },
  {
    id: 'D8',
    title: 'D8 — 2枚の角丸カード',
    note: '外枠なし。授業カード＋シフトカードを8px空けて縦に。独立性がはっきり。',
    build(){
      return `<div class="dock-d8">
        <div class="dock-section is-lesson">${lessonBlock()}</div>
        <div class="dock-section is-shift">${shiftBlock()}</div>
      </div>`;
    },
  },
  {
    id: 'D9',
    title: 'D9 — 上端アクセント線（左右均等）',
    note: '各ブロックの上だけ3px色線（左線ではない）。授業＝青、シフト＝緑。',
    build(){
      return wrapDock('dock-d9', lessonBlock(), shiftBlock());
    },
  },
  {
    id: 'D10',
    title: 'D10 — 未対応行だけ薄赤帯',
    note: 'カードは白。「未対応」行だけ薄赤背景で注意を引く。',
    build(){
      const statusPartial = `
        <div class="status-highlight">
          <dl class="fmt-kv"><dt>未対応</dt><dd class="is-alert">1コマ</dd></dl>
        </div>
        <dl class="fmt-kv"><dt>下書き</dt><dd class="is-draft">2件（承認1·辞退1）</dd></dl>`;
      return wrapDock('dock-d10', lessonBlock({ statusHtml: statusPartial }), shiftBlock());
    },
  },
];

function renderOld(){
  document.getElementById('oldDock').innerHTML = `
    <div class="design-card">
      <div class="design-card-head"><span>旧案（問題のあるパターン）</span></div>
      <div class="design-card-body">
        <div class="dock-old">
          <div class="dock-section is-lesson">${lessonBlock()}</div>
          <div class="dock-section is-shift">${shiftBlock()}</div>
        </div>
        <p class="design-note">上段だけ薄青＋左3px線 → 「授業だけ特別扱い」「左だけ太い」と感じやすい。</p>
      </div>
    </div>`;
}

function renderIntro(){
  document.getElementById('problemBox').innerHTML = `
    前案は<strong>授業ブロックだけ</strong>薄青背景＋<strong>左3px線</strong>のため、①上下で待遇が違う ②左だけ重い、と見えます。<br>
    新案は「色・線・影」の付け方だけ変え、<strong>文言とボタン配置（W11・縦並び）は固定</strong>です。
  `;
  document.getElementById('wordBox').innerHTML = `
    <strong>W11ベース</strong><br>
    ・見出し: ${COPY.lessonTitle}<br>
    ・青ボタン: ${COPY.lessonSubmit}<br>
    ・白ボタン: ${COPY.lessonApproveAll}<br>
    ・状態: F1形式（未対応／下書き）<br>
    ・シフト: 説明文なし・未提出バッジのみ
  `;
  document.getElementById('recommendBox').innerHTML = `
    おすすめ: <strong>D1</strong>（白1枚・区切り線）または <strong>D6</strong>（小ラベルだけ色）。<br>
    色で区切りたいなら <strong>D4</strong>（上下均等の薄青）か <strong>D10</strong>（未対応行だけ薄赤）。
  `;
}

function renderGrid(){
  document.getElementById('designGrid').innerHTML = DESIGNS.map(d=> `
    <div class="design-card">
      <div class="design-card-head">
        <span>${d.title}</span>
        ${d.recommend ? '<span class="rec">★候補</span>' : ''}
      </div>
      <div class="design-card-body">
        ${d.build()}
        <p class="design-note">${d.note}</p>
      </div>
    </div>
  `).join('');
}

renderIntro();
renderOld();
renderGrid();
