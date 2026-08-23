const SUBJECT = {
  算数: { bg: '#DBEAFE', text: '#1D4ED8' },
  国語: { bg: '#FCE8E6', text: '#9F1239' },
};

/** 確定文言（T1本番反映時もこのセットを使う） */
const COPY = {
  lessonTitle: '授業依頼への返事',
  lessonPending: '返事待ち 1コマ',
  lessonDraft: '送る前 2件 — 承認1・辞退1',
  lessonSend: '返事を教室長に送る',
  lessonApproveAll: '残り1コマをすべて承認',
  shiftTitle: 'シフト',
  shiftDraftHint: '空きコマの○△×を選んでから提出',
  shiftSubmit: 'シフトを提出する',
  shiftChangeHint: '変更はまだ教室長に届いていません',
  shiftChangeDraft: n => `送る前 ${n}件`,
  shiftSendChange: n => `変更を教室長に送る（${n}件）`,
};

const PATTERNS = [
  {
    id: 'T1',
    title: 'T1 — 2段ドック（確定案）',
    dockClass: 'submit-dock-t1',
    note: '右側ボタンは縦並び（上＝送信、下＝一括承認）。左の説明文は1行のまま読める。',
    pros: '改行が少ない。主操作が上、補助操作が下で優先順位が明確。',
    cons: 'ボタン列がやや縦長（168px幅で収まる想定）。',
    recommend: true,
  },
  {
    id: 'T2',
    title: 'T2 — 横並び2ブロック',
    dockClass: 'submit-dock-t2',
    note: '授業｜シフトを左右に。授業ブロック内のボタンはT1と同じ縦並び。',
    pros: 'デスクトップで2用件を一望。',
    cons: 'スマホでは縦積みになりT1とほぼ同じ。',
  },
  {
    id: 'T3',
    title: 'T3 — コンパクト1行',
    dockClass: 'submit-dock-t3',
    note: '省スペース版。文言はT1と同じ。',
    pros: '縦幅最小。',
    cons: '狭い画面では折り返しが出やすい。',
  },
];

let monthMode = 'draft';
let hasLessonPending = true;
let shiftChangeCount = 0;

function subjectTag(name) {
  const c = SUBJECT[name] || { bg: '#EEE', text: '#333' };
  return `<span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${name}</span>`;
}

function lessonActionsHtml(){
  return `<div class="submit-dock-actions is-stacked">
    <button type="button" class="btn-primary">${COPY.lessonSend}</button>
    <button type="button" class="btn-ghost">${COPY.lessonApproveAll}</button>
  </div>`;
}

function lessonBlock(showActions){
  if(!hasLessonPending) return '';
  return `
    <div class="submit-dock-block is-lesson">
      <div class="submit-dock-head">
        <div class="submit-dock-lines">
          <p class="submit-dock-title">${COPY.lessonTitle}</p>
          <p class="submit-dock-line is-request">${COPY.lessonPending}</p>
          <p class="submit-dock-line is-draft">${COPY.lessonDraft}</p>
        </div>
        ${showActions ? lessonActionsHtml() : ''}
      </div>
    </div>`;
}

function shiftBlock(showActions){
  const isSubmitted = monthMode === 'submitted';
  const badge = isSubmitted
    ? '<span class="status-badge submitted">提出済</span>'
    : '<span class="status-badge draft">未提出</span>';
  const line = isSubmitted
    ? (shiftChangeCount > 0
      ? `<p class="submit-dock-line is-draft">${COPY.shiftChangeDraft(shiftChangeCount)}</p>`
      : `<p class="submit-dock-line is-muted">${COPY.shiftChangeHint}</p>`)
    : `<p class="submit-dock-line is-muted">${COPY.shiftDraftHint}</p>`;

  let actions = '';
  if(showActions){
    if(isSubmitted){
      const disabled = shiftChangeCount === 0 ? ' disabled' : '';
      actions = `<div class="submit-dock-actions is-stacked">
        <button type="button" class="btn-request"${disabled}>${COPY.shiftSendChange(shiftChangeCount)}</button>
      </div>`;
    }else{
      actions = `<div class="submit-dock-actions is-stacked">
        <button type="button" class="btn-primary">${COPY.shiftSubmit}</button>
      </div>`;
    }
  }

  return `
    <div class="submit-dock-block is-shift">
      <div class="submit-dock-head">
        <div class="submit-dock-lines">
          <div class="submit-dock-meta">
            <p class="submit-dock-title">${COPY.shiftTitle}</p>
            ${badge}
          </div>
          ${line}
        </div>
        ${actions}
      </div>
    </div>`;
}

function submitDock(dockClass, showActions = true){
  const lesson = lessonBlock(showActions);
  const shift = shiftBlock(showActions);
  if(!lesson && !shift) return '';
  return `<div class="submit-dock ${dockClass}">${lesson}${shift}</div>`;
}

function currentLayoutDock(){
  if(!hasLessonPending) return '';
  return `
    <div class="submit-dock-current-lesson">
      <p class="submit-dock-line is-request">【返事が必要】あと1コマ、授業依頼への返事が必要です</p>
      <p class="submit-dock-line is-draft">【教室長に送る】2件、まだ送っていません（承認1件・辞退1件）</p>
      <div class="submit-dock-actions" style="margin-top:8px;">
        <button type="button" class="btn-ghost">${COPY.lessonApproveAll}</button>
        <button type="button" class="btn-primary">教室長に送信する</button>
      </div>
    </div>`;
}

function currentLayoutFoot(){
  const isSubmitted = monthMode === 'submitted';
  const badge = isSubmitted
    ? '<span class="status-badge submitted">提出済</span>'
    : '<span class="status-badge draft">未提出</span>';
  const shiftFoot = isSubmitted
    ? `<button type="button" class="btn-request"${shiftChangeCount ? '' : ' disabled'}>変更をリクエストする（${shiftChangeCount}件）</button>`
    : `<button type="button" class="btn-primary">この内容でシフトを提出する</button>`;

  return `
    <div class="submit-dock-meta" style="margin-bottom:10px;">${badge}<span class="form-msg">シフト状態</span></div>
    <div class="submit-dock-current-shift-foot">${shiftFoot}</div>`;
}

function calendarSample(){
  return `
    <div class="mycal-day">
      <div class="mycal-date-label">8月10日（金）</div>
      <div class="mycal-slot-card is-confirmed">
        <div class="mycal-slot-head"><span class="mycal-slot-label">4講</span></div>
        <div class="mycal-slot-students">
          <div class="mycal-slot-student">${subjectTag('算数')}<span class="mycal-slot-student-name">テスト準（小4）</span></div>
        </div>
      </div>
      ${hasLessonPending ? `
      <div class="mycal-slot-card is-waiting">
        <div class="mycal-slot-head">
          <span class="mycal-slot-label">5講</span>
          <div style="display:flex;gap:6px;margin-left:auto;">
            <button type="button" class="mycal-approve-btn">承認</button>
            <button type="button" class="mycal-decline-btn">辞退</button>
          </div>
        </div>
        <div class="mycal-slot-students">
          <div class="mycal-slot-student">${subjectTag('国語')}<span class="mycal-slot-student-name">テストはなこ（小5）</span></div>
        </div>
      </div>` : ''}
      <div class="mycal-slot-card is-empty-shift">
        <div class="mycal-slot-head">
          <span class="mycal-slot-label">6講</span>
          <div class="shift-pick-group shift-pick-s4">
            <button type="button" class="shift-pick-btn"><span class="shift-pick-symbol">○</span><span class="shift-pick-label">優先</span></button>
            <button type="button" class="shift-pick-btn is-active"><span class="shift-pick-symbol">△</span><span class="shift-pick-label">可能</span></button>
            <button type="button" class="shift-pick-btn"><span class="shift-pick-symbol">×</span><span class="shift-pick-label">不可</span></button>
          </div>
        </div>
      </div>
    </div>`;
}

function scheduleCard(extraClass, topDockHtml, bottomFootHtml = ''){
  return `
    <div class="demo-app">
      ${topDockHtml || ''}
      <div class="demo-card ${extraClass || ''}">
        <h3>マイスケジュール</h3>
        <p class="demo-desc">提出操作はカレンダーより上。カレンダー内で承認・辞退・○△×を選び、上のドックから送る。</p>
        <div class="month-nav">
          <button type="button" class="nav-btn">‹</button>
          <div class="month-title">2026年8月</div>
          <button type="button" class="nav-btn">›</button>
          <button type="button" class="today-btn">今月</button>
        </div>
        ${calendarSample()}
        ${bottomFootHtml}
      </div>
    </div>`;
}

function currentLayoutScreen(){
  return scheduleCard('layout-current', currentLayoutDock(), currentLayoutFoot());
}

function newLayoutScreen(pattern){
  return scheduleCard('', submitDock(pattern.dockClass));
}

function renderCompare(){
  const rec = PATTERNS.find(p=> p.recommend);
  document.getElementById('compareCurrent').innerHTML = `
    <div class="pattern-card">
      <div class="pattern-card-head">現在（公開中）</div>
      <div class="pattern-card-body">${currentLayoutScreen()}<p class="pattern-note">【】付きの長い文言。ボタン横並びで左テキストが折り返す。</p></div>
    </div>
    <div class="pattern-card">
      <div class="pattern-card-head">${rec.title}</div>
      <div class="pattern-card-body">${newLayoutScreen(rec)}<p class="pattern-note">${rec.note}</p></div>
    </div>`;
}

function renderPatterns(){
  document.getElementById('patternPanels').innerHTML = PATTERNS.map((p, i)=> `
    <div class="pattern-panel${i === 0 ? ' is-active' : ''}" id="panel-${p.id}" data-panel="${p.id}">
      <div class="pattern-card">
        <div class="pattern-card-head">${p.title}${p.recommend ? ' ★' : ''}</div>
        <div class="pattern-card-body">
          ${newLayoutScreen(p)}
          <p class="pattern-note">${p.note}</p>
        </div>
      </div>
    </div>
  `).join('');
}

function renderTabs(){
  document.getElementById('patternTabs').innerHTML = PATTERNS.map((p, i)=> `
    <button type="button" class="pattern-tab${i === 0 ? ' is-active' : ''}" data-tab="${p.id}">${p.id}</button>
  `).join('');

  document.querySelectorAll('.pattern-tab').forEach(tab=>{
    tab.addEventListener('click', ()=>{
      document.querySelectorAll('.pattern-tab').forEach(t=> t.classList.remove('is-active'));
      tab.classList.add('is-active');
      document.querySelectorAll('.pattern-panel').forEach(p=>{
        p.classList.toggle('is-active', p.dataset.panel === tab.dataset.tab);
      });
    });
  });
}

function renderStateControls(){
  document.getElementById('stateControls').innerHTML = `
    <button type="button" class="preview-toggle${monthMode === 'draft' ? ' is-active' : ''}" data-mode="draft">未提出の月</button>
    <button type="button" class="preview-toggle${monthMode === 'submitted' ? ' is-active' : ''}" data-mode="submitted">提出済みの月</button>
    <button type="button" class="preview-toggle${hasLessonPending ? ' is-active' : ''}" data-lesson="1">授業返事あり</button>
    <button type="button" class="preview-toggle${!hasLessonPending ? ' is-active' : ''}" data-lesson="0">授業返事なし</button>
    <button type="button" class="preview-toggle${shiftChangeCount > 0 ? ' is-active' : ''}" data-shift-change="1">シフト変更あり</button>
    <button type="button" class="preview-toggle${shiftChangeCount === 0 ? ' is-active' : ''}" data-shift-change="0">シフト変更なし</button>
  `;

  document.querySelectorAll('[data-mode]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ monthMode = btn.dataset.mode; rerenderAll(); });
  });
  document.querySelectorAll('[data-lesson]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ hasLessonPending = btn.dataset.lesson === '1'; rerenderAll(); });
  });
  document.querySelectorAll('[data-shift-change]').forEach(btn=>{
    btn.addEventListener('click', ()=>{ shiftChangeCount = btn.dataset.shiftChange === '1' ? 2 : 0; rerenderAll(); });
  });
}

function renderIntro(){
  document.getElementById('ruleBox').innerHTML = `
    <strong>T1 修正点</strong><br>
    ・授業ブロックのボタンは<strong>縦並び</strong>（上：返事を教室長に送る／下：残り1コマをすべて承認）<br>
    ・【】をやめ、短い1行文言に統一<br>
    ・「送信する」→ <strong>教室長に送る</strong> に揃える
  `;
  document.getElementById('evalRecommend').innerHTML = `
    文言はすべて <strong>COPY</strong> 定数で管理（本番実装時に同じセットを流用）。T1を採用する場合は「T1で実装して」と送ってください。
  `;
}

function renderPros(){
  document.getElementById('prosGrid').innerHTML = PATTERNS.map(p=> `
    <div class="pros-card">
      <h3>${p.id}${p.recommend ? ' ★' : ''}</h3>
      <p><strong>長所:</strong> ${p.pros}</p>
      <p><strong>短所:</strong> ${p.cons}</p>
    </div>
  `).join('');
}

function rerenderAll(){
  renderStateControls();
  renderCompare();
  renderPatterns();
  renderIntro();
}

renderIntro();
renderStateControls();
renderTabs();
renderCompare();
renderPatterns();
renderPros();
