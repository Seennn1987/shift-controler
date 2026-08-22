(function(){
  const TYPE_SCALE = [
    { token:'--text-xs', px:'11px', sample:'バッジ・短いラベル', base:false },
    { token:'--text-sm', px:'12px', sample:'補助情報・キャプション', base:false },
    { token:'--text-md', px:'13px', sample:'説明文・フォームラベル', base:false },
    { token:'--text-base', px:'14px', sample:'本文・入力欄・ボタン（基準）', base:true },
    { token:'--text-lg', px:'15px', sample:'カード見出し', base:false },
    { token:'--text-xl', px:'16px', sample:'セクション見出し', base:false },
    { token:'--text-2xl', px:'18px', sample:'KPI数値', base:false },
    { token:'--text-3xl', px:'19px', sample:'ページタイトル', base:false },
  ];

  const COLORS = [
    { token:'--ink', name:'本文' },
    { token:'--ink-soft', name:'補助文字' },
    { token:'--ink-muted', name:'薄い文字' },
    { token:'--ink-disabled', name:'無効・空' },
    { token:'--surface-page', name:'ページ背景' },
    { token:'--surface-card', name:'カード背景' },
    { token:'--surface-muted', name:'薄い背景' },
    { token:'--surface-closed', name:'休校・定休' },
    { token:'--border', name:'枠線' },
    { token:'--brand-900', name:'ヘッダー' },
    { token:'--brand-600', name:'リンク・アクティブ' },
    { token:'--brand-500', name:'主ボタン' },
    { token:'--brand-100', name:'薄青背景' },
    { token:'--pending-ink', name:'承認待ち' },
    { token:'--success', name:'成功' },
    { token:'--danger', name:'危険・欠席' },
    { token:'--warning-ink', name:'警告' },
    { token:'--heat-lv2', name:'ヒートマップ濃' },
  ];

  const SPACING = [
    { token:'--space-1', px:4 },
    { token:'--space-2', px:6 },
    { token:'--space-3', px:8 },
    { token:'--space-4', px:10 },
    { token:'--space-5', px:12 },
    { token:'--space-6', px:16 },
    { token:'--space-7', px:20 },
    { token:'--space-8', px:24 },
  ];

  const RADIUS = [
    { token:'--radius-sm', px:6 },
    { token:'--radius-md', px:8 },
    { token:'--radius-lg', px:10 },
    { token:'--radius-xl', px:12 },
    { token:'--radius-card', px:14 },
  ];

  const RULES = [
    ['本文の基準', '14px。入力・ボタン・リスト', '--text-base'],
    ['文字の下限', '11px。それ以下は禁止', '--text-xs'],
    ['0.5px刻み', '禁止（11.5px 等）', '—'],
    ['カード角丸', '14px', '--radius-card'],
    ['入力欄', '高さ40px、角丸8px', '--input-height / --radius-md'],
    ['主ボタン', '高さ40px、角丸10px', '--btn-height / --radius-lg'],
    ['色の3層', 'UI基盤 / 教科 / 状態', '配色プレビュー参照'],
  ];

  const styles = getComputedStyle(document.documentElement);

  function renderTypeScale(){
    const el = document.getElementById('typeScale');
    el.innerHTML = TYPE_SCALE.map(item=>`
      <div class="type-row${item.base ? ' is-base' : ''}">
        <span class="type-token">${item.token}</span>
        <span class="type-sample" style="font-size:var(${item.token})">${item.sample}</span>
        <span class="type-px">${item.px}${item.base ? ' ★基準' : ''}</span>
      </div>
    `).join('');
  }

  function renderColors(){
    const el = document.getElementById('colorSwatches');
    el.innerHTML = COLORS.map(item=>{
      const hex = styles.getPropertyValue(item.token).trim();
      return `
        <div class="swatch" data-hex="${hex}" title="クリックでコピー">
          <div class="swatch-chip" style="background:var(${item.token})"></div>
          <div class="swatch-info">
            <span class="swatch-name">${item.name}</span>
            <span class="swatch-hex">${item.token}<br>${hex}</span>
          </div>
        </div>
      `;
    }).join('');
    el.querySelectorAll('.swatch').forEach(node=>{
      node.addEventListener('click', ()=>{
        const hex = node.dataset.hex;
        navigator.clipboard.writeText(hex).then(()=> showToast(`${hex} をコピーしました`));
      });
    });
  }

  function renderSpacing(){
    const el = document.getElementById('spacingScale');
    el.innerHTML = SPACING.map(item=>`
      <div class="spacing-item">
        <div class="spacing-bar" style="width:${item.px * 4}px;height:${item.px}px"></div>
        <div>${item.token}</div>
        <div>${item.px}px</div>
      </div>
    `).join('');
  }

  function renderRadius(){
    const el = document.getElementById('radiusScale');
    el.innerHTML = RADIUS.map(item=>`
      <div class="radius-item">
        <div class="radius-box" style="border-radius:${item.px}px"></div>
        <div>${item.token}</div>
        <div>${item.px}px</div>
      </div>
    `).join('');
  }

  function renderRules(){
    document.getElementById('rulesTable').innerHTML = RULES.map(([a,b,c])=>`
      <tr><td>${a}</td><td>${b}</td><td><code>${c}</code></td></tr>
    `).join('');
  }

  function showToast(msg){
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(showToast._tid);
    showToast._tid = setTimeout(()=>{ t.hidden = true; }, 1800);
  }

  renderTypeScale();
  renderColors();
  renderSpacing();
  renderRadius();
  renderRules();
})();
