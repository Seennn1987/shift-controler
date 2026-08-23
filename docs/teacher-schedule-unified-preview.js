const SUBJECT = {
  算数: { bg: '#DBEAFE', text: '#1D4ED8' },
  国語: { bg: '#FCE8E6', text: '#9F1239' },
};

const SHIFT_LABELS = {
  none: { sym: '×', label: '不可' },
  preferred: { sym: '○', label: '優先' },
  normal: { sym: '△', label: '可能' },
};

const PATTERNS = [
  {
    id: 'S1',
    title: 'S1 — 連結セグメント（3つが1本）',
    groupClass: 'shift-pick-s1',
    note: 'ボタンがくっついたセグメント型。幅を取らず、右端にまとまって見える。タップ領域は十分。',
    pros: 'コンパクト。どれか1つ選ばれていることが一目で分かる。',
    cons: '記号だけなので初見は説明文が欲しい。',
  },
  {
    id: 'S2',
    title: 'S2 — 独立ピル（丸ボタン）',
    groupClass: 'shift-pick-s2',
    note: '○△×をそれぞれ丸いボタンに。間隔を空けて誤タップを減らす。',
    pros: 'スマホで押しやすい。選択中の青丸がはっきり。',
    cons: '横幅がやや広い。',
  },
  {
    id: 'S3',
    title: 'S3 — 大きめ角丸（記号強調）',
    groupClass: 'shift-pick-s3',
    note: '記号を大きく、角丸四角。視力・高齢の講師にも読みやすい。',
    pros: '記号が見やすい。承認ボタンとサイズ感が近い。',
    cons: '1日4コマ並べると縦長になりやすい。',
  },
  {
    id: 'S4',
    title: 'S4 — 記号＋短ラベル（不可／希望／可能）',
    groupClass: 'shift-pick-s4',
    note: '×不可・○希望・△可能を縦2行で表示。意味が文字でも分かる。',
    pros: '初見の学習コストがいちばん低い。シフト提出タブの説明と一致。',
    cons: '縦幅がやや増える。',
  },
  {
    id: 'S5',
    title: 'S5 — 薄枠ボックス内トグル',
    groupClass: 'shift-pick-s5',
    note: '薄い枠の中で青1つ・グレー2つ。入力欄のような見た目。',
    pros: '空コマであることが視覚的に分かる。他の操作ボタンと混同しにくい。',
    cons: '枠が1段増え、やや情報量多め。',
  },
];

let monthMode = 'draft';
const localOverrides = {};
const baseline = { '6': 'normal', '7': 'none' };

function subjectTag(name) {
  const c = SUBJECT[name] || { bg: '#EEE', text: '#333' };
  return `<span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${name}</span>`;
}

function shiftButtons(groupClass, slotId, style) {
  const base = baseline[slotId] || 'none';
  const current = localOverrides[slotId] ?? base;
  const items = ['preferred', 'normal', 'none'];

  if (style === 'S4') {
    return `<div class="shift-pick-group ${groupClass}" data-slot="${slotId}" role="group" aria-label="${slotId}講の出勤希望">
      ${items.map(key => {
        const { sym, label } = SHIFT_LABELS[key];
        return `<button type="button" class="shift-pick-btn${current === key ? ' is-active' : ''}" data-priority="${key}" aria-pressed="${current === key}">
          <span class="shift-pick-symbol">${sym}</span>
          <span class="shift-pick-label">${label}</span>
        </button>`;
      }).join('')}
    </div>`;
  }

  return `<div class="shift-pick-group ${groupClass}" data-slot="${slotId}" role="group" aria-label="${slotId}講の出勤希望">
    ${items.map(key => {
      const sym = SHIFT_LABELS[key].sym;
      return `<button type="button" class="shift-pick-btn${current === key ? ' is-active' : ''}" data-priority="${key}" aria-pressed="${current === key}">${sym}</button>`;
    }).join('')}
  </div>`;
}

function hasLocalChange(slotId) {
  if (!(slotId in localOverrides)) return false;
  return localOverrides[slotId] !== baseline[slotId];
}

function emptyShiftCard(groupClass, slotId, patternId) {
  const changed = monthMode === 'submitted' && hasLocalChange(slotId);
  return `
    <div class="mycal-slot-card is-empty-shift${changed ? ' has-local-shift' : ''}" data-slot-card="${slotId}">
      <div class="mycal-slot-head">
        <span class="mycal-slot-label">${slotId}講${changed ? '<span class="local-shift-badge">未送信</span>' : ''}</span>
        ${shiftButtons(groupClass, slotId, patternId)}
      </div>
    </div>`;
}

function pendingCard() {
  return `
    <div class="mycal-slot-card is-waiting">
      <div class="mycal-slot-head">
        <span class="mycal-slot-label">5講</span>
        <div class="mycal-slot-head-actions">
          <button type="button" class="mycal-approve-btn">承認</button>
          <button type="button" class="mycal-decline-btn">辞退</button>
        </div>
      </div>
      <div class="mycal-slot-students">
        <div class="mycal-slot-student has-divider">
          ${subjectTag('国語')}
          <span class="mycal-slot-student-name">テストはなこ（小5）</span>
        </div>
        <div class="mycal-slot-student">
          ${subjectTag('国語')}
          <span class="mycal-slot-student-name">テスト準（小4）</span>
        </div>
      </div>
    </div>`;
}

function confirmedCard() {
  return `
    <div class="mycal-slot-card is-confirmed">
      <div class="mycal-slot-head">
        <span class="mycal-slot-label">4講</span>
        <div class="mycal-slot-head-actions">
          <span class="mycal-confirmed-pill">確定</span>
          <button type="button" class="mycal-cancel-btn">キャンセルを依頼</button>
        </div>
      </div>
      <div class="mycal-slot-students">
        <div class="mycal-slot-student">
          ${subjectTag('算数')}
          <span class="mycal-slot-student-name">テスト準（小4）</span>
          <span class="pref-pair-assigned-badge">担当生徒</span>
        </div>
      </div>
    </div>`;
}

function statusBarHtml() {
  if (monthMode === 'submitted') {
    return `<div class="demo-status-bar">
      <span class="status-badge submitted">確定</span>
      <span>提出済みの月です。○△×を変えると「未送信」になり、下のボタンでまとめて教室長に届きます。</span>
    </div>`;
  }
  return `<div class="demo-status-bar">
    <span class="status-badge draft">未提出</span>
    <span>空コマの○△×を選び、下の「シフトを提出する」でまとめて送れます。</span>
  </div>`;
}

function footerHtml() {
  const changeCount = Object.keys(localOverrides).filter(hasLocalChange).length;
  if (monthMode === 'submitted') {
    const disabled = changeCount === 0 ? ' disabled' : '';
    return `<div class="demo-form-actions">
      <button type="button" class="demo-request-btn" id="demoRequestBtn"${disabled}>変更をリクエストする（${changeCount}件）</button>
      <span class="demo-form-msg">${changeCount ? '押すまで教室長には届きません' : '変更したコマがあるときだけ押せます'}</span>
    </div>`;
  }
  return `<div class="demo-form-actions">
    <button type="button" class="demo-submit-btn" id="demoSubmitBtn">この内容でシフトを提出する</button>
    <span class="demo-form-msg">提出後も○△×は変更できます（変更はリクエスト）</span>
  </div>`;
}

function demoScreen(pattern) {
  return `
    <div class="demo-screen" data-pattern="${pattern.id}">
      <div class="demo-banner">
        <p class="demo-banner-line">あと1コマ、返事が必要です</p>
        <div class="demo-banner-actions">
          <button type="button" class="demo-ghost">残りNコマをすべて承認</button>
          <button type="button" class="demo-primary">教室長に送信する</button>
        </div>
      </div>
      ${statusBarHtml()}
      <div class="mycal-day">
        <div class="mycal-date-label">8月10日（金）</div>
        ${confirmedCard()}
        ${pendingCard()}
        ${emptyShiftCard(pattern.groupClass, '6', pattern.id)}
        ${emptyShiftCard(pattern.groupClass, '7', pattern.id)}
      </div>
      ${footerHtml()}
    </div>`;
}

function renderPatterns() {
  const mount = document.getElementById('patternPanels');
  mount.innerHTML = PATTERNS.map((p, i) => `
    <div class="pattern-panel${i === 0 ? ' is-active' : ''}" id="panel-${p.id}" data-panel="${p.id}">
      <div class="pattern-card">
        <div class="pattern-card-head">${p.title}</div>
        <div class="pattern-card-body">
          ${demoScreen(p)}
          <p class="pattern-note">${p.note}</p>
        </div>
      </div>
    </div>
  `).join('');
}

function bindInteractions() {
  const mount = document.getElementById('patternPanels');
  if (!mount || bindInteractions._bound) return;
  bindInteractions._bound = true;

  mount.addEventListener('click', e => {
    const btn = e.target.closest('.shift-pick-btn');
    if (btn) {
      const group = btn.closest('.shift-pick-group');
      if (!group) return;
      const slotId = group.dataset.slot;
      const priority = btn.dataset.priority;
      const base = baseline[slotId] || 'none';

      if (monthMode === 'submitted') {
        if (priority === base) {
          delete localOverrides[slotId];
        } else {
          localOverrides[slotId] = priority;
        }
      } else {
        baseline[slotId] = priority;
        delete localOverrides[slotId];
      }

      renderPatterns();
      syncPatternTabs();
      updateModeToggles();
      return;
    }

    if (e.target.id === 'demoSubmitBtn' || e.target.classList.contains('demo-submit-btn')) {
      monthMode = 'submitted';
      Object.keys(localOverrides).forEach(k => delete localOverrides[k]);
      renderPatterns();
      syncPatternTabs();
      updateModeToggles();
      flashMsg('シフトを提出しました（プレビュー）。7講を△→○に変えて「変更をリクエスト」を試してください。');
      return;
    }

    if (e.target.id === 'demoRequestBtn' || e.target.classList.contains('demo-request-btn')) {
      if (e.target.disabled) return;
      Object.keys(localOverrides).forEach(k => {
        baseline[k] = localOverrides[k];
        delete localOverrides[k];
      });
      renderPatterns();
      syncPatternTabs();
      flashMsg('変更リクエストを送信しました（プレビュー）。未送信バッジが消えます。');
    }
  });
}

function flashMsg(text) {
  const el = document.getElementById('flashMsg');
  if (!el) return;
  el.textContent = text;
  el.style.display = 'block';
  clearTimeout(flashMsg._t);
  flashMsg._t = setTimeout(() => { el.style.display = 'none'; }, 5000);
}

function renderTabs() {
  document.getElementById('patternTabs').innerHTML = PATTERNS.map((p, i) => `
    <button type="button" class="pattern-tab${i === 0 ? ' is-active' : ''}" data-tab="${p.id}">${p.id}</button>
  `).join('');

  document.querySelectorAll('.pattern-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.pattern-tab').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      syncPatternTabs(tab.dataset.tab);
    });
  });
}

function syncPatternTabs(activeId) {
  const id = activeId || document.querySelector('.pattern-tab.is-active')?.dataset.tab || 'S1';
  document.querySelectorAll('.pattern-panel').forEach(p => {
    p.classList.toggle('is-active', p.dataset.panel === id);
  });
}

function renderPros() {
  document.getElementById('prosGrid').innerHTML = PATTERNS.map(p => `
    <div class="pros-card">
      <h3>${p.id}</h3>
      <p><strong>長所:</strong> ${p.pros}</p>
      <p><strong>短所:</strong> ${p.cons}</p>
    </div>
  `).join('');
}

function updateModeToggles() {
  document.querySelectorAll('[data-month-mode]').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.monthMode === monthMode);
  });
}

function bindModeToggles() {
  document.querySelectorAll('[data-month-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      monthMode = btn.dataset.monthMode;
      if (monthMode === 'draft') {
        Object.keys(localOverrides).forEach(k => delete localOverrides[k]);
      }
      renderPatterns();
      syncPatternTabs();
      updateModeToggles();
    });
  });
}

function renderIntro() {
  document.getElementById('ruleBox').innerHTML = `
    <strong>共通ルール（5案すべて）</strong><br>
    ・授業のないコマだけ、カード<strong>右側中央</strong>に ×／○／△<br>
    ・どれか1つが<strong>青</strong>、それ以外は<strong>グレー</strong>。グレーを押すと入れ替わる<br>
    ・未提出の月 → 下の「シフトを提出する」／ 提出済みの月 → 変更は「未送信」→「変更をリクエスト」<br>
    ・授業依頼・確定コマには○△×を出さない（上部バナーは授業返事用）
  `;

  document.getElementById('evalRecommend').innerHTML = `
    おすすめは <strong>S4（記号＋短ラベル）</strong> または <strong>S1（連結セグメント）</strong> です。<br>
    S4はシフト提出タブの説明（×不可→○希望→△可能）と一致し、初見に優しいです。S1はいちばん省スペースで、今のコマカード型と並べやすいです。
  `;
}

bindInteractions();
renderIntro();
renderTabs();
renderPatterns();
renderPros();
bindModeToggles();
updateModeToggles();
