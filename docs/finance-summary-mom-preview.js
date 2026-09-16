(function(){
  const sample = {
    include: {
      studentCount: 42,
      lessonCount: 186,
      revenue: 682400,
      lessonCost: 248000,
      transportCost: 18600,
      cost: 266600,
      ratio: 39.1,
      gross: 415800,
      deltas: {
        studentCount: 3,
        lessonCount: 12,
        revenue: 38400,
        lessonCost: 16000,
        transportCost: 1200,
        cost: 17200,
        ratio: -1.4,
        gross: 21200,
      },
    },
    exclude: {
      studentCount: 42,
      lessonCount: 186,
      revenue: 682400,
      lessonCost: 248000,
      transportCost: 18600,
      cost: 248000,
      ratio: 36.3,
      gross: 434400,
      deltas: {
        studentCount: 3,
        lessonCount: 12,
        revenue: 38400,
        lessonCost: 16000,
        transportCost: 1200,
        cost: 16000,
        ratio: -0.8,
        gross: 22400,
      },
    },
  };

  let includeTransport = true;

  function yen(n){
    return `¥${Math.round(n).toLocaleString('ja-JP')}`;
  }

  function formatDelta(delta, kind){
    if(delta == null || !Number.isFinite(delta)) return '先月比 —';
    if(delta === 0) return '先月と同じ';
    const sign = delta > 0 ? '+' : '−';
    const abs = Math.abs(delta);
    if(kind === 'count') return `先月比 ${sign}${abs}人`;
    if(kind === 'lesson') return `先月比 ${sign}${abs}コマ`;
    if(kind === 'yen') return `先月比 ${sign}${yen(abs)}`;
    if(kind === 'ratio') return `先月比 ${sign}${abs.toFixed(1)}pt`;
    return `先月比 ${sign}${abs}`;
  }

  function item(label, valueHtml, deltaText){
    return `<div class="fin-summary-item">
      <div class="fin-label">${label}</div>
      <div class="fin-value">${valueHtml}</div>
      <div class="fin-delta">${deltaText}</div>
    </div>`;
  }

  function render(){
    const m = includeTransport ? sample.include : sample.exclude;
    const transportLabel = includeTransport ? '交通費込' : '交通費別';
    const host = document.getElementById('finMonthSummary');
    if(!host) return;
    host.innerHTML = [
      item('在籍生徒数', `${m.studentCount}人`, formatDelta(m.deltas.studentCount, 'count')),
      item('実施コマ数', `${m.lessonCount}コマ`, formatDelta(m.deltas.lessonCount, 'lesson')),
      item('売上', yen(m.revenue), formatDelta(m.deltas.revenue, 'yen')),
      item('講師コスト（コマ給）', yen(m.lessonCost), formatDelta(m.deltas.lessonCost, 'yen')),
      item('交通費', yen(m.transportCost), formatDelta(m.deltas.transportCost, 'yen')),
      item(`コスト率（${transportLabel}）`, `${m.ratio.toFixed(1)}%`, formatDelta(m.deltas.ratio, 'ratio')),
      item(`粗利（${transportLabel}）`, yen(m.gross), formatDelta(m.deltas.gross, 'yen')),
    ].join('');
  }

  document.querySelectorAll('.fin-transport-btn').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      includeTransport = btn.dataset.transport === 'include';
      document.querySelectorAll('.fin-transport-btn').forEach(x=>{
        x.classList.toggle('active', x === btn);
      });
      render();
    });
  });

  render();
})();
