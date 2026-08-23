(function(){
  'use strict';

  const SUBJECT_ABBR = { '国語':'国', '算数':'算', '数学':'数', '英語':'英', '理科':'理', '社会':'社' };

  const SUBJECT_STYLE = {
    '算数': { bg:'#D6EAF8', text:'#1A5276', border:'#1A5276' },
    '国語': { bg:'#FADBD8', text:'#922B21', border:'#922B21' },
    '理科': { bg:'#D5F5E3', text:'#1E8449', border:'#1E8449' },
    '社会': { bg:'#FDEBD0', text:'#935116', border:'#935116' },
    '英語': { bg:'#E8DAEF', text:'#6C3483', border:'#6C3483' },
    '数学': { bg:'#D1F2EB', text:'#117A65', border:'#117A65' },
  };

  const SLOTS = [{ id:4, label:'4講', time:'14:50〜16:20' }];

  const WEEK_DATES = [
    { label:'8/17(月)', key:'mon' },
    { label:'8/18(火)', key:'tue' },
    { label:'8/19(水)', key:'wed' },
    { label:'8/20(木)', key:'thu' },
    { label:'8/21(金)', key:'fri' },
    { label:'8/22(土)', key:'sat' },
  ];

  const SAMPLE_LESSONS = [
    { subject:'算数', studentName:'テスト華', grade:'小4', teacher:'三田', flow:'confirmed', auto:true },
    { subject:'国語', studentName:'テスト太郎', grade:'小4', teacher:'大竹', flow:'draft', auto:true },
    { subject:'理科', studentName:'テストはなこ', grade:'中2', teacher:'中村', flow:'waiting', auto:false },
    { subject:'社会', studentName:'テスト七郎', grade:'小5', teacher:null, flow:'unassigned', auto:false },
  ];

  const WEEK_GRID = {
    mon: [],
    tue: [SAMPLE_LESSONS[0]],
    wed: [SAMPLE_LESSONS[1], SAMPLE_LESSONS[3]],
    thu: SAMPLE_LESSONS.slice(),
    fri: [SAMPLE_LESSONS[2], SAMPLE_LESSONS[0]],
    sat: [SAMPLE_LESSONS[1]],
  };

  function teacherHonorific(surname){
    return surname ? `${surname} 先生` : '—';
  }

  function subjectTag(subject){
    const c = SUBJECT_STYLE[subject] || { bg:'#eee', text:'#333' };
    const abbr = SUBJECT_ABBR[subject] || subject.slice(0, 1);
    return `<span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${abbr}</span>`;
  }

  function nameWithGrade(studentName, grade){
    return `<span class="sched-card-name-line">${studentName}<span class="grade-tag">${grade}</span></span>`;
  }

  function flowBadgeChip(flow, variant){
    if(flow === 'unassigned') return '<span class="cal-status-chip is-unassigned">講師なし</span>';
    if(flow === 'draft'){
      if(variant === 'r1') return '<span class="cal-status-chip is-tentative-outline">仮決め</span>';
      return '<span class="cal-status-chip is-tentative">仮決め</span>';
    }
    if(flow === 'waiting') return '<span class="cal-status-chip is-waiting">承認待ち</span>';
    return '';
  }

  function flowText(flow){
    if(flow === 'unassigned') return '<span class="sched-card-flow-text is-unassigned">講師なし</span>';
    if(flow === 'draft') return '<span class="sched-card-flow-text is-tentative">仮決め</span>';
    if(flow === 'waiting') return '<span class="sched-card-flow-text is-waiting">承認待ち</span>';
    return '';
  }

  function teacherRow(lesson, statusHtml){
    const teacherText = lesson.flow === 'unassigned'
      ? '<span class="sched-card-meta-value is-pending">—</span>'
      : `<span class="sched-card-meta-value">${teacherHonorific(lesson.teacher)}</span>`;
    const statusCol = statusHtml
      ? `<span class="sched-card-status">${statusHtml}</span>`
      : '<span class="sched-card-status"></span>';
    return `<div class="sched-card-row2 sched-card-row2--grid">
      <span class="sched-card-meta-label">講師</span>
      ${teacherText}
      ${statusCol}
    </div>`;
  }

  /** 案R1: 教科タグ + 名前（学年inline） / 2行目に状態バッジのみ。自動なし */
  function buildR1Card(lesson){
    return `<div class="sched-lesson-card">
      <div class="sched-card-row1 sched-card-row1--inline">
        ${subjectTag(lesson.subject)}
        ${nameWithGrade(lesson.studentName, lesson.grade)}
      </div>
      ${teacherRow(lesson, flowBadgeChip(lesson.flow, 'r1'))}
    </div>`;
  }

  /** 案R2: R1と同じだが状態はバッジではなく色付きテキスト */
  function buildR2Card(lesson){
    return `<div class="sched-lesson-card">
      <div class="sched-card-row1 sched-card-row1--inline">
        ${subjectTag(lesson.subject)}
        ${nameWithGrade(lesson.studentName, lesson.grade)}
      </div>
      ${teacherRow(lesson, flowText(lesson.flow))}
    </div>`;
  }

  /** 案R3: 教科タグをやめ左ボーダー色 + 名前のみ。バッジは状態1つのみ */
  function buildR3Card(lesson){
    const c = SUBJECT_STYLE[lesson.subject] || { border:'#999' };
    const abbr = SUBJECT_ABBR[lesson.subject] || lesson.subject.slice(0, 1);
    return `<div class="sched-lesson-card sched-lesson-card--subject-stripe" style="border-left-color:${c.border};">
      <div class="sched-card-row1 sched-card-row1--textonly">
        <span class="sched-card-name-line">
          <span class="sched-card-subject-text" style="color:${c.text};">${abbr}</span>${lesson.studentName}<span class="grade-tag">${lesson.grade}</span>
        </span>
      </div>
      ${teacherRow(lesson, flowBadgeChip(lesson.flow, 'r1'))}
    </div>`;
  }

  /** v1却下案: grid + 学年独立列 + 自動バッジ */
  function buildV1Card(lesson){
    const autoBadge = lesson.auto ? '<span class="auto-badge">自動</span>' : '';
    const badge = flowBadgeChip(lesson.flow, 'v1');
    const teacherText = lesson.flow === 'unassigned'
      ? '<span class="sched-card-meta-value is-pending">—</span>'
      : `<span class="sched-card-meta-value">${teacherHonorific(lesson.teacher)}</span>`;
    return `<div class="sched-lesson-card">
      <div class="sched-card-row1 sched-card-row1--grid">
        ${subjectTag(lesson.subject)}
        <span class="sched-card-name">${lesson.studentName}</span>
        <span class="sched-card-grade">${lesson.grade}</span>
        <span class="sched-card-row1-tail">${autoBadge}</span>
      </div>
      <div class="sched-card-row2 sched-card-row2--grid">
        <span class="sched-card-meta-label">講師</span>
        ${teacherText}
        <span class="sched-card-status">${badge}</span>
      </div>
    </div>`;
  }

  function buildCellInner(lessons, builder){
    if(!lessons.length) return '<div class="sched-empty">予定なし</div>';
    const cards = lessons.map(builder).join('');
    return `<div class="sched-cell-inner">
      <div class="sched-total">合計${lessons.length}名</div>
      <div class="sched-lesson-list">${cards}</div>
    </div>`;
  }

  function buildWeekTable(lessonsByDay, builder){
    let thead = '<thead><tr><th>時間割</th>';
    WEEK_DATES.forEach(d=>{ thead += `<th class="week-date-head">${d.label}</th>`; });
    thead += '</tr></thead>';
    const slot = SLOTS[0];
    let tbody = '<tbody><tr>';
    tbody += `<th>${slot.label}<span class="time">${slot.time}</span></th>`;
    WEEK_DATES.forEach(d=>{
      const lessons = lessonsByDay[d.key] || [];
      if(!lessons.length){
        tbody += `<td class="sched-cell week-date-cell is-empty"><div class="sched-empty">予定なし</div></td>`;
      }else{
        tbody += `<td class="sched-cell week-date-cell">${buildCellInner(lessons, builder)}</td>`;
      }
    });
    tbody += '</tr></tbody>';
    return `<div class="sched-scroll"><table class="sched">${thead}${tbody}</table></div>`;
  }

  function renderIssues(){
    document.getElementById('issueList').innerHTML = [
      ['学年', '右端に独立した列になっており、講師別ビューなど他画面（名前の直後に小4）と<strong>位置・表記が不一致</strong>。'],
      ['色の混同', '自動バッジと仮決めバッジが<strong>同じ黄色・同じ角丸チップ</strong>。並ぶと区別できない。'],
      ['バッジ過多', '教科タグ・自動・フローの3つが並び、<strong>何の状態か</strong>が読み取りにくい。'],
      ['自動バッジ', '週間カレンダーで「自動で組んだか」を毎回見せる必要があるか疑問。操作はコマ組み画面で完結。'],
    ].map(([title, body], i)=>`<div class="issue-row"><span class="issue-num">${i+1}</span><span><strong>${title}</strong> — ${body}</span></div>`).join('');

    document.getElementById('recommendBox').innerHTML =
      '<strong>おすすめ：案R1</strong> — 学年は名前直後（grade-tag）。週間カレンダーでは<strong>自動バッジを表示しない</strong>。状態バッジは2行目右端に1つだけ。仮決めは<strong>点線枠（塗りなし）</strong>で自動バッジと差別化。';
  }

  function renderRevisionCompare(){
    const variants = [
      { id:'r1', title:'案R1（おすすめ）', builder: buildR1Card, rec:true },
      { id:'r2', title:'案R2', builder: buildR2Card },
      { id:'r3', title:'案R3', builder: buildR3Card },
    ];
    document.getElementById('revisionCompare').innerHTML = variants.map(v=>`
      <div class="compare-card">
        <div class="compare-card-head${v.rec ? ' is-new' : ''}">${v.title}</div>
        <div class="compare-card-body is-cell">${buildCellInner(SAMPLE_LESSONS, v.builder)}</div>
      </div>`).join('');
  }

  function renderAutoAnalysis(){
    document.getElementById('autoAnalysis').innerHTML = `
      <p><strong>結論：週間カレンダーでは自動バッジは表示しない</strong>（案R1/R2/R3 共通）。</p>
      <ul>
        <li><strong>見せる場所がある</strong> — コマ組みの仮決め列・一括操作（「自動マッチングで解除」）では、自動かどうかが操作に直結する</li>
        <li><strong>週間カレンダーの目的</strong> — 「いつ・誰が・どの講師・今どの段階か」を見る。自動/手動は副情報</li>
        <li><strong>バッジを減らす効果</strong> — フロー状態（講師なし/仮決め/承認待ち）だけに目が行く</li>
        <li><strong>例外</strong> — 振替バッジは別（白抜き点線）で、週間でも残す余地あり</li>
      </ul>`;
  }

  function renderGradeCompare(){
    const samples = [
      {
        label:'× 前回案（右端独立）',
        html:`<div class="sched-lesson-card"><div class="sched-card-row1 sched-card-row1--grid">
          ${subjectTag('算数')}<span class="sched-card-name">テスト華</span><span class="sched-card-grade">小4</span><span></span>
        </div></div>`,
        note:'名前と学年が離れ、他画面と違う',
      },
      {
        label:'○ 案R1（名前直後・grade-tag）',
        html:`<div class="sched-lesson-card"><div class="sched-card-row1 sched-card-row1--inline">
          ${subjectTag('算数')}${nameWithGrade('テスト華', '小4')}
        </div></div>`,
        note:'講師別ビュー・日詳細と同型（本番 gradeLabel）',
      },
      {
        label:'△ 括弧付き（コマ組み行型）',
        html:`<div class="sched-lesson-card"><div class="sched-card-row1 sched-card-row1--inline">
          ${subjectTag('算数')}<span class="sched-card-name-line">テスト華<span class="grade-tag">（小4）</span></span>
        </div></div>`,
        note:'コマ組み行と同じだが、狭いマスでは括弧が冗長',
      },
    ];
    document.getElementById('gradeCompare').innerHTML = samples.map(s=>`
      <div class="compare-card">
        <div class="compare-card-head">${s.label}</div>
        <div class="compare-card-body"><div class="grade-sample"><div class="grade-sample-label">${s.note}</div>${s.html}</div></div>
      </div>`).join('');
  }

  function renderWeekGridR1(){
    document.getElementById('weekGridR1').innerHTML = `
      <div class="compare-card">
        <div class="compare-card-head is-new">案R1 — 1週間・4講行</div>
        <div class="compare-card-body" style="padding:0;background:var(--surface-card);">
          ${buildWeekTable(WEEK_GRID, buildR1Card)}
        </div>
      </div>`;
  }

  function renderProsCons(){
    const items = [
      {
        title:'案R1（おすすめ）',
        rec:true,
        pros:['学年表記が他画面と統一','バッジは状態1つのみ（+教科タグ）','仮決め点線枠で黄色塗りと差別化','自動バッジ削除でスッキリ'],
        cons:['教科タグは残る（ガイドライン上は必要）'],
      },
      {
        title:'案R2',
        pros:['バッジ形状をさらに減らせる','状態は色付きテキストで表示'],
        cons:['状態の視認性がR1より弱い','一覧でパッと見つけにくい'],
      },
      {
        title:'案R3',
        pros:['教科チップをなくし左ボーダー色のみ','チップ形状が状態バッジ1つだけ'],
        cons:['教科の識別が弱くなる','左ボーダーは他画面にない新パターン'],
      },
    ];
    document.getElementById('prosCons').innerHTML = items.map(it=>`
      <div class="pros-cons-card${it.rec ? ' is-rec' : ''}">
        <div class="pros-cons-head">${it.title}</div>
        <div class="pros-cons-body">
          <h4>長所</h4><ul>${it.pros.map(p=>`<li>${p}</li>`).join('')}</ul>
          <h4>短所</h4><ul>${it.cons.map(c=>`<li>${c}</li>`).join('')}</ul>
        </div>
      </div>`).join('');
  }

  function renderV1Compare(){
    document.getElementById('v1Compare').innerHTML = `
      <div class="compare-card">
        <div class="compare-card-body is-cell" style="max-width:150px;margin:0 auto;">${buildCellInner(SAMPLE_LESSONS, buildV1Card)}</div>
      </div>`;
  }

  renderIssues();
  renderRevisionCompare();
  renderAutoAnalysis();
  renderGradeCompare();
  renderWeekGridR1();
  renderProsCons();
  renderV1Compare();
})();
