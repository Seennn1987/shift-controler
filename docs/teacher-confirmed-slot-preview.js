const SUBJECT_COLORS = {
  算数: { bg: '#DBEAFE', text: '#1D4ED8' },
  国語: { bg: '#FCE8E6', text: '#9F1239' },
};

function subjectTag(name) {
  const c = SUBJECT_COLORS[name] || { bg: '#EEE', text: '#333' };
  return `<span class="sched-student-tag" style="background:${c.bg};color:${c.text};">${name}</span>`;
}

function studentRow({ subject, name, grade, assigned, divider, extra }) {
  return `<div class="mycal-slot-student${divider ? ' has-divider' : ''}">
    ${subjectTag(subject)}
    <span class="mycal-slot-student-name"><b>${name}</b>（${grade}）</span>
    ${assigned ? '<span class="pref-pair-assigned-badge">担当生徒</span>' : ''}
    ${extra || ''}
  </div>`;
}

function confirmedCard() {
  return `<div class="mycal-slot-card is-confirmed">
    <div class="mycal-slot-head">
      <span class="mycal-slot-label">4講</span>
      <div class="mycal-slot-head-actions">
        <span class="mycal-confirmed-pill">確定</span>
        <button type="button" class="mycal-cancel-btn">欠勤申請</button>
      </div>
    </div>
    <div class="mycal-slot-students">
      ${studentRow({ subject: '算数', name: 'テスト準', grade: '小4', assigned: true })}
    </div>
  </div>`;
}

function waitingCard() {
  return `<div class="mycal-slot-card is-waiting">
    <div class="mycal-slot-head">
      <span class="mycal-slot-label">5講</span>
      <div class="mycal-slot-head-actions">
        <button type="button" class="mycal-approve-btn">承認</button>
        <button type="button" class="mycal-decline-btn">辞退</button>
      </div>
    </div>
    <div class="mycal-slot-students">
      ${studentRow({ subject: '国語', name: 'テストはなこ', grade: '小5', divider: true })}
      ${studentRow({ subject: '国語', name: 'テスト準', grade: '小4' })}
    </div>
  </div>`;
}

function emptyShiftCard() {
  return `<div class="mycal-slot-card is-empty-shift">
    <div class="mycal-slot-head">
      <span class="mycal-slot-label">6講</span>
      <div class="shift-pick-group shift-pick-s4" role="group" aria-label="6講の出勤希望">
        <button type="button" class="shift-pick-btn" aria-pressed="false">
          <span class="shift-pick-symbol">○</span><span class="shift-pick-label">優先</span>
        </button>
        <button type="button" class="shift-pick-btn" aria-pressed="false">
          <span class="shift-pick-symbol">△</span><span class="shift-pick-label">可能</span>
        </button>
        <button type="button" class="shift-pick-btn is-active" aria-pressed="true">
          <span class="shift-pick-symbol">×</span><span class="shift-pick-label">不可</span>
        </button>
      </div>
    </div>
  </div>`;
}

function dayHtml() {
  return `<div class="mycal-day">
    <div class="mycal-date-label">8月3日（月）</div>
    ${confirmedCard()}
    ${waitingCard()}
    ${emptyShiftCard()}
  </div>`;
}

const PATTERNS = [
  {
    id: 'A',
    title: 'A — コマ全体を濃いめの青で塗る',
    note: 'いまの薄い青より一段はっきり塗ります。お願い（細い青枠）より塗りが目立ちます。色の種類はいまと同じ青です。',
  },
  {
    id: 'B',
    title: 'B — コマ全体を緑で塗る（おすすめ）',
    note: '青＝返事が必要、緑＝もう決まった、と色を分けます。ちら見でも確定とお願いが混ざりません。',
  },
  {
    id: 'C',
    title: 'C — コマ番号を色つきにする',
    note: '「4講」のラベルを青い塊にします。縦に見たとき、授業のあるコマが数字で拾えます。カード全体も薄く塗ります。',
  },
  {
    id: 'D',
    title: 'D — 見出し行を青く塗る',
    note: '4講と「確定」の行だけ濃い青にします。生徒名は白地のままです。スクロール中に帯として目に入ります。',
  },
  {
    id: 'E',
    title: 'E — 上の帯＋全体塗り',
    note: 'カードの一番上に青い帯を置き、中も薄く塗ります。枠は細いまま、帯で「授業あり」が分かります。',
  },
];

document.getElementById('evalBox').innerHTML = `
  <p><strong>いまの問題</strong></p>
  <p>確定した授業は、薄い青の塗りと太い青枠です。お願いが来ている授業も青い枠なので、ちら見するとどちらも「青いコマ」に見えます。薄い青は白に近く、空きコマの白とも差が小さいです。</p>
  <p style="margin-bottom:0"><strong>おすすめは B</strong>です。コマ全体を塗りつつ、お願いの青と色を分けるので、「何をすべきか」が一番はっきりします。青のまま強くしたい場合は A です。</p>
`;

document.getElementById('nowSample').innerHTML = `
  <p class="sample-label">いま（本番と同じ）</p>
  ${dayHtml()}
`;

document.getElementById('patternList').innerHTML = PATTERNS.map((p) => `
  <article class="pattern-block pat-${p.id.toLowerCase()}">
    <h3>${p.title}</h3>
    <p class="pattern-note">${p.note}</p>
    ${dayHtml()}
  </article>
`).join('');
