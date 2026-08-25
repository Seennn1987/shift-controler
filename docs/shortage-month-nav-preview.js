(function(){
  'use strict';

  const MONTH_NAMES = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

  let previewYear = 2026;
  let previewMonth = 7; // 0-indexed = 8月

  function ymKey(){
    return `${previewYear}-${String(previewMonth + 1).padStart(2, '0')}`;
  }

  function monthTitle(){
    return `${previewYear}年${previewMonth + 1}月`;
  }

  function monthDataNote(){
    const dayCount = previewMonth === 7 ? 31 : 28;
    return `表示中: <strong>${monthTitle()}</strong>の担当データ（例・${dayCount}日分）`;
  }

  function flowSummary(){
    const m = previewMonth + 1;
    const u = m === 8 ? 0 : 3;
    const t = m === 8 ? 111 : 26;
    const p = m === 8 ? 0 : 2;
    const c = m === 8 ? 10 : 4;
    return `
      <span class="cal-status-kpi"><span class="cal-status-kpi-label">講師なし</span> <span class="cal-status-kpi-num">${u}</span><span class="cal-status-kpi-unit">コマ</span></span>
      <span aria-hidden="true">→</span>
      <span class="cal-status-kpi"><span class="cal-status-kpi-label">仮決め</span> <span class="cal-status-kpi-num">${t}</span><span class="cal-status-kpi-unit">件</span></span>
      <span aria-hidden="true">→</span>
      <span class="cal-status-kpi"><span class="cal-status-kpi-label">承認待ち</span> <span class="cal-status-kpi-num">${p}</span><span class="cal-status-kpi-unit">件</span></span>
      <span aria-hidden="true">→</span>
      <span class="cal-status-kpi"><span class="cal-status-kpi-label">確定</span> <span class="cal-status-kpi-num">${c}</span><span class="cal-status-kpi-unit">件</span></span>`;
  }

  function navHtml(options = {}){
    const {
      idPrefix,
      compact = false,
      showToday = true,
      showSync = false,
      center = false,
    } = options;
    const cls = `month-nav${center ? ' is-center' : ''}${compact ? ' is-compact' : ''}`;
    return `<div class="${cls}" data-nav="${idPrefix}">
      <button type="button" class="nav-btn" data-nav-action="prev" data-nav-id="${idPrefix}" aria-label="前の月">‹</button>
      <span class="month-label${compact ? ' is-sm' : ''}" data-month-label="${idPrefix}">${monthTitle()}</span>
      <button type="button" class="nav-btn" data-nav-action="next" data-nav-id="${idPrefix}" aria-label="次の月">›</button>
      ${showToday ? `<button type="button" class="today-btn" data-nav-action="today" data-nav-id="${idPrefix}">今月</button>` : ''}
      ${showSync ? `<span class="sync-note">カレンダーと連動</span>` : ''}
    </div>`;
  }

  function selectNavHtml(idPrefix){
    const options = [];
    for(let y = 2025; y <= 2027; y++){
      for(let m = 0; m < 12; m++){
        const val = `${y}-${String(m + 1).padStart(2, '0')}`;
        const sel = val === ymKey() ? ' selected' : '';
        options.push(`<option value="${val}"${sel}>${y}年${m + 1}月</option>`);
      }
    }
    return `<label class="month-nav">
      <span class="sync-note" style="margin-right:6px;">対象月</span>
      <select class="month-select" data-nav="select" data-nav-id="${idPrefix}" aria-label="対象月">${options.join('')}</select>
    </label>`;
  }

  function actionsToolbar(){
    return `<div class="shortage-actions-toolbar">
      <button type="button" class="ghost">全コマを自動で組む</button>
      <button type="button" class="primary">講師にスケジュールを送信</button>
      <span class="shortage-actions-sep" aria-hidden="true"></span>
      <button type="button" class="btn-text">自動マッチングで解除</button>
      <button type="button" class="btn-text">仮決めをすべて解除</button>
    </div>`;
  }

  function mockRow(when, name, tag, confirmed){
    return `<button type="button" class="mock-row${confirmed ? ' is-confirmed' : ''}">
      <span class="mock-when">${when}</span>
      <span class="mock-name">${name}</span>
      <span class="mock-tag">${tag}</span>
    </button>`;
  }

  function slotWhen(day, wd, slotNum){
    return `${previewMonth + 1}/${day}(${wd}) ${slotNum}講`;
  }

  function fourCols(){
    const unassignedRows = previewMonth === 7
      ? '<div class="shortage-panel-empty">講師が決まっていないコマはありません</div>'
      : mockRow(slotWhen(24, '月', 4), 'テスト太郎（小4）', '算')
        + mockRow(slotWhen(25, '火', 5), 'テスト花子（小5）', '国');
    const pendingRows = previewMonth === 7
      ? '<div class="shortage-panel-empty">承認待ちはありません</div>'
      : mockRow(slotWhen(10, '日', 6), '佐藤先生 テスト準', '理');
    const draftRows = [
      mockRow(slotWhen(1, '金', 4), '佐藤先生 テスト準', '理'),
      mockRow(slotWhen(1, '金', 5), '田中先生 テスト花子', '算'),
      mockRow(slotWhen(2, '土', 3), '鈴木先生 山田次郎', '英'),
    ].join('');
    const confirmedRows = [
      mockRow(slotWhen(3, '月', 4), '佐藤先生 テスト準', '理', true),
      mockRow(slotWhen(5, '水', 5), '田中先生 テスト花子', '算', true),
    ].join('');
    return `<div class="shortage-four-col">
      <section class="shortage-panel">
        <div class="shortage-panel-head">
          <span class="shortage-panel-label">講師なし</span>
          <span class="shortage-panel-count"><span class="shortage-panel-num">${previewMonth === 7 ? 0 : 3}</span>コマ</span>
        </div>
        <div class="shortage-panel-scroll">${unassignedRows}</div>
      </section>
      <section class="shortage-panel">
        <div class="shortage-panel-head">
          <span class="shortage-panel-label">仮決め</span>
          <span class="shortage-panel-count"><span class="shortage-panel-num">${previewMonth === 7 ? 111 : 26}</span>件</span>
        </div>
        <div class="shortage-panel-scroll">${draftRows}</div>
      </section>
      <section class="shortage-panel">
        <div class="shortage-panel-head">
          <span class="shortage-panel-label">承認待ち</span>
          <span class="shortage-panel-count"><span class="shortage-panel-num">${previewMonth === 7 ? 0 : 2}</span>件</span>
        </div>
        <div class="shortage-panel-scroll">${pendingRows}</div>
      </section>
      <section class="shortage-panel">
        <div class="shortage-panel-head">
          <span class="shortage-panel-label">確定</span>
          <span class="shortage-panel-count"><span class="shortage-panel-num">${previewMonth === 7 ? 10 : 4}</span>件</span>
        </div>
        <div class="shortage-panel-scroll">${confirmedRows}</div>
      </section>
    </div>`;
  }

  function detailBody(navBlock){
    return `<div class="mock-detail">
      ${navBlock}
      <p class="mock-month-hint" data-month-hint>${monthDataNote()}</p>
      ${actionsToolbar()}
      ${fourCols()}
    </div>`;
  }

  const PATTERNS = [
    {
      id: 'N1',
      title: 'N1 — カレンダー同型（操作バーの上）',
      recommend: true,
      note: '下の月間カレンダーと同じ ‹ 2026年8月 › 今月。いちばん覚えやすく、実装も cal-period-nav を流用しやすい。',
      build(){
        return `<div class="mock-shell">
          <div class="mock-status-bar">
            <button type="button" class="mock-status-toggle" aria-expanded="true">
              <span class="flow-text">${flowSummary()}</span>
              <span class="mock-status-chevron">▴</span>
            </button>
            ${detailBody(`
              <div style="margin-bottom:10px;">
                ${navHtml({ idPrefix: 'n1', center: true, showSync: true })}
              </div>
            `)}
          </div>
        </div>`;
      },
    },
    {
      id: 'N2',
      title: 'N2 — 折りたたみ行の右端（コンパクト）',
      note: 'パネルを開いたまま月だけサッと変えたいとき向け。ただし狭い画面ではサマリー行が2段になりやすい。',
      build(){
        return `<div class="mock-shell">
          <div class="mock-status-bar">
            <button type="button" class="mock-status-toggle has-inline-nav" aria-expanded="true">
              <span class="flow-text">${flowSummary()}</span>
              <div class="mock-inline-nav">
                ${navHtml({ idPrefix: 'n2', compact: true, showToday: false })}
              </div>
              <span class="mock-status-chevron">▴</span>
            </button>
            <div class="mock-detail">
              <p class="mock-month-hint" data-month-hint>${monthDataNote()}</p>
              ${actionsToolbar()}
              ${fourCols()}
            </div>
          </div>
        </div>`;
      },
    },
    {
      id: 'N3',
      title: 'N3 — 操作バーと1行（左=月・右=ボタン）',
      note: '縦幅を抑える。月と「送信」が近いので、別月を見たまま送らないよう注意書きが欲しい。',
      build(){
        return `<div class="mock-shell">
          <div class="mock-status-bar">
            <button type="button" class="mock-status-toggle" aria-expanded="true">
              <span class="flow-text">${flowSummary()}</span>
              <span class="mock-status-chevron">▴</span>
            </button>
            <div class="mock-detail">
              <div class="mock-toolbar-row">
                ${navHtml({ idPrefix: 'n3', compact: true })}
                <div class="shortage-actions-toolbar" style="margin:0;flex:1;justify-content:flex-end;">
                  <button type="button" class="ghost">全コマを自動で組む</button>
                  <button type="button" class="primary">講師にスケジュールを送信</button>
                </div>
              </div>
              <p class="mock-month-hint" data-month-hint>${monthDataNote()} — 取り消しボタンは下段</p>
              <div class="shortage-actions-toolbar">
                <button type="button" class="btn-text">自動マッチングで解除</button>
                <button type="button" class="btn-text">仮決めをすべて解除</button>
              </div>
              ${fourCols()}
            </div>
          </div>
        </div>`;
      },
    },
    {
      id: 'N4',
      title: 'N4 — プルダウンで月ジャンプ',
      note: '数ヶ月先まで一発で移動。日常の「前月・次月」より操作が重い。',
      build(){
        return `<div class="mock-shell">
          <div class="mock-status-bar">
            <button type="button" class="mock-status-toggle" aria-expanded="true">
              <span class="flow-text">${flowSummary()}</span>
              <span class="mock-status-chevron">▴</span>
            </button>
            ${detailBody(`
              <div style="margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;">
                ${selectNavHtml('n4')}
                <span class="sync-note">カレンダーと連動</span>
              </div>
            `)}
          </div>
        </div>`;
      },
    },
    {
      id: 'N5',
      title: 'N5 — 月見出し帯（薄グレー1行）',
      note: '「今どの月を見ているか」がはっきりする。D1提出ドックの区切り線と同系統で画面全体と揃う。',
      build(){
        return `<div class="mock-shell">
          <div class="mock-status-bar">
            <button type="button" class="mock-status-toggle" aria-expanded="true">
              <span class="flow-text">${flowSummary()}</span>
              <span class="mock-status-chevron">▴</span>
            </button>
            <div class="mock-detail">
              <div class="mock-month-band">
                <span style="font-size:var(--text-sm);font-weight:var(--font-weight-black);color:var(--green-900);">対象月</span>
                ${navHtml({ idPrefix: 'n5', center: false, showSync: false })}
              </div>
              <p class="mock-month-hint" data-month-hint>${monthDataNote()}</p>
              ${actionsToolbar()}
              ${fourCols()}
            </div>
          </div>
        </div>`;
      },
    },
  ];

  function shiftMonth(delta){
    previewMonth += delta;
    if(previewMonth < 0){ previewMonth = 11; previewYear--; }
    if(previewMonth > 11){ previewMonth = 0; previewYear++; }
  }

  function goToday(){
    const t = new Date();
    previewYear = t.getFullYear();
    previewMonth = t.getMonth();
  }

  function setFromYm(ym){
    const [y, m] = ym.split('-').map(Number);
    previewYear = y;
    previewMonth = m - 1;
  }

  function renderGrid(){
    document.getElementById('patternGrid').innerHTML = PATTERNS.map(p=> `
      <article class="pattern-card${p.recommend ? ' is-rec' : ''}" data-pattern="${p.id}">
        <div class="pattern-head">
          <span>${p.title}</span>
          ${p.recommend ? '<span class="rec">★おすすめ</span>' : ''}
        </div>
        <div class="pattern-body">${p.build()}<p class="pattern-note">${p.note}</p></div>
      </article>
    `).join('');
    wireNav();
  }

  function refreshAll(){
    document.querySelectorAll('[data-month-label]').forEach(el=>{
      el.textContent = monthTitle();
    });
    document.querySelectorAll('[data-month-hint]').forEach(el=>{
      el.innerHTML = monthDataNote();
    });
    document.querySelectorAll('[data-nav="select"]').forEach(sel=>{
      sel.value = ymKey();
    });
    document.querySelectorAll('.flow-text').forEach(el=>{
      el.innerHTML = flowSummary();
    });
    document.querySelectorAll('.shortage-four-col').forEach(el=>{
      el.outerHTML = fourCols();
    });
  }

  function wireNav(){
    document.querySelectorAll('[data-nav-action]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const action = btn.dataset.navAction;
        if(action === 'prev') shiftMonth(-1);
        else if(action === 'next') shiftMonth(1);
        else if(action === 'today') goToday();
        refreshAll();
      });
    });
    document.querySelectorAll('[data-nav="select"]').forEach(sel=>{
      sel.addEventListener('change', ()=>{
        setFromYm(sel.value);
        refreshAll();
      });
    });
  }

  function renderIntro(){
    document.getElementById('problemBox').innerHTML = `
      <ul style="margin:0;padding-left:1.2em;">
        <li>4列パネルは <strong>カレンダーの上</strong> にあり、中身は <strong>選んだ月</strong>（referenceYearMonth）のデータです。</li>
        <li>いま月を変える操作は <strong>下のカレンダー</strong> にしかなく、パネルを開いたまま別月を見るにはスクロールが必要です。</li>
        <li>月を変えても、下のカレンダーとズレないよう <strong>同じ月状態を共有</strong> する必要があります。</li>
      </ul>`;

    document.getElementById('ruleBox').innerHTML = `
      <ul style="margin:0;padding-left:1.2em;">
        <li>月ナビは <strong>パネル内（展開時）</strong> に置く — 折りたたみ行だけでは気づきにくい</li>
        <li>操作はカレンダーの <strong>cal-period-nav と同型</strong>（‹ ラベル › 今月）</li>
        <li>月を変えたら4列・件数・自動組み可否を <strong>その月で再読み込み</strong></li>
        <li>週間表示中も、対象月は calYear/calMonth と同期</li>
      </ul>`;

    document.getElementById('recommendBox').innerHTML =
      '<strong>おすすめ：N1</strong> — カレンダーと同じ見た目・同じ操作。教室長が「上でも下でも同じ動き」と覚えやすい。次点は <strong>N5</strong>（対象月が帯で強調される）。';

    document.getElementById('prosGrid').innerHTML = PATTERNS.map(p=> `
      <div class="pros-card">
        <h3>${p.id}</h3>
        <ul>
          ${p.id === 'N1' ? '<li><strong>長所</strong>：既存UI流用・学習コスト最小</li><li><strong>短所</strong>：縦に1行分増える</li>' : ''}
          ${p.id === 'N2' ? '<li><strong>長所</strong>：縦幅最小・サマリーと同時操作</li><li><strong>短所</strong>：狭い画面で窮屈</li>' : ''}
          ${p.id === 'N3' ? '<li><strong>長所</strong>：月と送信が近い</li><li><strong>短所</strong>：誤送信防止の文言が必要</li>' : ''}
          ${p.id === 'N4' ? '<li><strong>長所</strong>：遠い月へ一発移動</li><li><strong>短所</strong>：日常の前後月より重い</li>' : ''}
          ${p.id === 'N5' ? '<li><strong>長所</strong>：対象月が一目で分かる</li><li><strong>短所</strong>：N1より1段ぶん高い</li>' : ''}
        </ul>
      </div>
    `).join('');
  }

  renderIntro();
  renderGrid();
})();
