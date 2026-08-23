(function(){
  'use strict';

  const DOW = ['日', '月', '火', '水', '木', '金', '土'];
  const FLOW_ORDER = ['unassigned', 'draft', 'waiting'];
  const FLOW_META = {
    unassigned: { full: '講師なし', short: 'なし', cls: 'is-unassigned' },
    draft: { full: '仮決め', short: '仮', cls: 'is-tentative-outline' },
    waiting: { full: '承認待ち', short: '待', cls: 'is-waiting' },
  };

  /** flows: { unassigned?, draft?, waiting? } */
  const WEEK = [
    { day: 17, dow: 0, closed: true },
    { day: 18, dow: 1, slots: mkSlots('2110'), flows: {} },
    { day: 19, dow: 2, slots: mkSlots('2110'), flows: { unassigned: true } },
    { day: 20, dow: 3, slots: mkSlots('3210'), flows: { unassigned: true, draft: true, waiting: true } },
    { day: 21, dow: 4, slots: mkSlots('2211'), flows: { unassigned: true, draft: true } },
    { day: 22, dow: 5, slots: mkSlots('1000'), flows: { waiting: true }, today: true },
  ];

  const TRIPLE_DAY = { day: 20, flows: { unassigned: true, draft: true, waiting: true } };

  function mkSlots(counts){
    const labels = ['4講', '5講', '6講', '7講'];
    return labels.map((l, i)=>{
      const n = counts[i];
      return { l, c: n === '0' ? '—' : `${n}人`, pending: n === '0' ? false : i === 0 && counts.includes('pending') };
    });
  }

  function activeFlows(flows){
    return FLOW_ORDER.filter(k=> flows[k]);
  }

  function singleBadgeHtml(kind, variant){
    const meta = FLOW_META[kind];
    if(!meta) return '';
    const text = variant === 'm2' ? meta.short : meta.full;
    const shortCls = variant === 'm2' ? ' is-short' : '';
    return `<span class="cal-day-flow-badge ${meta.cls}${shortCls}">${text}</span>`;
  }

  function badgesHtml(flows, variant){
    const kinds = activeFlows(flows);
    if(!kinds.length) return '';
    return kinds.map(k=> singleBadgeHtml(k, variant)).join('');
  }

  function badgesBlock(flows, variant, layout){
    const html = badgesHtml(flows, variant);
    if(!html) return '';
    const colCls = layout === 'col' ? ' is-col' : '';
    return `<span class="cal-day-badges${colCls}">${html}</span>`;
  }

  function heatRows(slots, variant){
    return slots.map(s=>{
      const countCls = s.c === '—' ? ' is-dash' : '';
      const pendingBadge = (variant === 'current' && s.pending)
        ? '<span class="cal-heat-pending-badge">未決1</span>'
        : '';
      return `<div class="cal-heat-box"><span class="cal-heat-label">${s.l}</span><span class="cal-heat-count${countCls}">${s.c}</span>${pendingBadge}</div>`;
    }).join('');
  }

  function dayHeadHtml(d, variant){
    if(d.closed){
      return `<div class="cal-daynum-legacy">${d.day}</div><div class="cal-sublabel">定休</div>`;
    }
    const todayCls = d.today ? ' is-today' : '';
    const flows = d.flows || {};

    if(variant === 'current'){
      const hasAny = activeFlows(flows).length > 0;
      const dot = hasAny ? '<span class="cal-day-pending-dot" aria-hidden="true"></span>' : '';
      return `<div class="cal-daynum-legacy">${d.day}${dot}</div>`;
    }

    const layout = variant === 'm3' ? 'col' : (variant === 'm4' ? 'two-line' : 'wrap');
    const badges = badgesBlock(flows, variant, layout === 'col' ? 'col' : 'row');

    if(layout === 'two-line'){
      return `<div class="cal-day-head is-two-line">
        <span class="cal-daynum${todayCls}">${d.day}</span>
        ${badges}
      </div>`;
    }
    return `<div class="cal-day-head">
      <span class="cal-daynum${todayCls}">${d.day}</span>
      ${badges}
    </div>`;
  }

  function cellHtml(d, variant){
    if(d.closed){
      return `<div class="cal-cell closed-weekday">${dayHeadHtml(d, variant)}</div>`;
    }
    return `<div class="cal-cell open">${dayHeadHtml(d, variant)}<div class="cal-heat-stack">${heatRows(d.slots, variant)}</div></div>`;
  }

  function weekGrid(variant){
    const head = DOW.map((w, i)=>`<div class="cal-dow ${i===0?'sun':(i===6?'sat':'')}">${w}</div>`).join('');
    return `<div class="cal-grid-mini">${head}${WEEK.map(d=>cellHtml(d, variant)).join('')}</div>`;
  }

  function variantCard(title, variant, rec){
    return `<div class="variant-card${rec ? ' is-rec' : ''}">
      <div class="variant-head">${title}</div>
      <div class="variant-body">${weekGrid(variant)}</div>
    </div>`;
  }

  function tripleSample(variant, title){
    const d = { ...TRIPLE_DAY, slots: mkSlots('3210') };
    return `<div class="day-head-sample">
      <div class="day-head-sample-label">${title}</div>
      <div class="day-head-sample-body">${dayHeadHtml(d, variant)}</div>
    </div>`;
  }

  document.getElementById('ruleList').innerHTML = [
    '最大<strong>3バッジ</strong> — その日に存在する状態だけ（講師なし / 仮決め / 承認待ち）',
    'コマ行の「未決」は<strong>削除</strong>。4講 2人 だけ残す',
    'バッジは<strong>日付ヘッダー内</strong>（コマ行より上）',
    '確定だけの日はバッジなし',
  ].map(t=>`<li>${t}</li>`).join('');

  document.getElementById('recommendBox').innerHTML =
    '<strong>おすすめ：案M1</strong> — 日付の右にフル文言3つを横並び（はみ出したら折り返し）。週間カレンダーと同じ言葉・同じ色。';

  document.getElementById('weekCompare').innerHTML = [
    variantCard('公開中 — 青ドット＋コマごと「未決」', 'current', false),
    variantCard('案M1（おすすめ）— フル文言・横並び折り返し', 'm1', true),
    variantCard('案M2 — 略称3つ（なし 仮 待）横1行', 'm2', false),
    variantCard('案M3 — フル文言・右端縦積み', 'm3', false),
    variantCard('案M4 — 2行ヘッダー（日付→その下にバッジ横並び）', 'm4', false),
  ].join('');

  document.getElementById('tripleCompare').innerHTML = [
    tripleSample('m1', '案M1 — 3状態すべて'),
    tripleSample('m2', '案M2 — 略称'),
    tripleSample('m3', '案M3 — 縦積み'),
    tripleSample('m4', '案M4 — 2行ヘッダー'),
  ].join('');

  document.getElementById('prosCons').innerHTML = [
    {
      title: '案M1（おすすめ）',
      rec: true,
      pros: ['週間と同じフル文言', '3状態が同時に見える', '折り返しでマス幅に対応'],
      cons: ['3つ並ぶとヘッダーがやや高くなる'],
    },
    {
      title: '案M2 — 略称',
      pros: ['1行に収まりやすい', '3つ並べやすい'],
      cons: ['「なし」「仮」だけでは不親切'],
    },
    {
      title: '案M3 — 縦積み',
      pros: ['横の幅を取らない', 'フル文言のまま3つ表示'],
      cons: ['ヘッダーが縦に伸びる', 'コマ行が少し下がる'],
    },
    {
      title: '案M4 — 2行ヘッダー',
      pros: ['日付とバッジが分離して読みやすい', '3バッジ横並びに余裕'],
      cons: ['「日付と同じ高さ」からはずれる', 'マス上部がやや圧迫'],
    },
  ].map(it=>`
    <div class="pros-cons-card${it.rec ? ' is-rec' : ''}">
      <div class="pros-cons-head">${it.title}</div>
      <div class="pros-cons-body">
        <h4>長所</h4><ul>${it.pros.map(p=>`<li>${p}</li>`).join('')}</ul>
        <h4>短所</h4><ul>${it.cons.map(c=>`<li>${c}</li>`).join('')}</ul>
      </div>
    </div>`).join('');

  document.getElementById('displayRules').innerHTML = `
    <p>その日の全コマを集計し、<strong>存在する状態ごとにバッジを1つ</strong>（最大3つ）出します。</p>
    <ul style="margin:8px 0 0;padding-left:1.2em;line-height:1.7;">
      <li>講師なしのコマが1件でもある → <strong>講師なし</strong> バッジ</li>
      <li>仮決めが1件でもある → <strong>仮決め</strong> バッジ</li>
      <li>承認待ちが1件でもある → <strong>承認待ち</strong> バッジ</li>
      <li>すべて確定 → バッジなし</li>
    </ul>
    <p style="margin:10px 0 0;color:var(--ink-soft);font-size:var(--text-sm);">並び順は常に <strong>講師なし → 仮決め → 承認待ち</strong>（上部フローバーと同じ）。件数はバッジに入れず、詳細は日をクリックしたパネルで見る想定です。</p>`;
})();
