(function(){
  const SUBJECT_TAG = '<span class="sched-student-tag" style="background:#DBEAFE;color:#1D4ED8;">算数</span>';

  function flowBadge(kind){
    const map = {
      pending: { cls: 'is-unassigned', text: '講師なし' },
      tentative: { cls: 'is-tentative-outline', text: '仮決め' },
    };
    const flow = map[kind];
    if(!flow) return '';
    return `<span class="sched-card-flow-badge"><span class="cal-day-flow-badge ${flow.cls}">${flow.text}</span></span>`;
  }

  function subjectRow(kind){
    return `<div class="mp-slot-subject has-flow-badge">
      ${flowBadge(kind)}
      <div class="mp-slot-subject-tags">${SUBJECT_TAG}</div>
    </div>`;
  }

  function teacherRow(rank, nameHtml, badgeHtml, actionHtml){
    const badge = badgeHtml ? `<div class="match-cand-badges">${badgeHtml}</div>` : '';
    return `<div class="match-cand-row">
      <span class="match-cand-rank">${rank}</span>
      <div class="match-cand-main">
        <div class="match-cand-head">
          ${nameHtml}
          <div class="match-cand-actions">${actionHtml}</div>
        </div>
        ${badge}
      </div>
    </div>`;
  }

  const ownerName = '<span class="match-cand-name">教室長</span>';
  const askBtn = '<button type="button" class="confirm-btn" data-take="1">この講師に依頼</button>';

  function pickCard(opts){
    const { empty, taken } = opts;
    let body = '';
    if(taken){
      body = `<div class="confirmed-box">
        <span class="cb-label">確定</span>
        ${SUBJECT_TAG}
        <span class="cb-teacher">講師：教室長</span>
        <span class="cb-cap">（定員 1/2）</span>
        <div class="confirmed-box-actions">
          <button type="button" class="unconfirm-btn" data-untake="1">確定を解除</button>
        </div>
      </div>`;
    }else if(empty){
      body = `<div class="match-none">候補講師がいません。</div>
        <div class="match-slot-rows">${teacherRow('—', ownerName, '', askBtn)}</div>`;
    }else{
      body = `<div class="match-slot-rows">
        ${teacherRow(1, '<span class="match-cand-name">佐藤 健太</span>', '<span class="match-reason-badge">得意教科</span>', '<button type="button" class="confirm-btn">この講師に依頼</button>')}
        ${teacherRow(2, '<span class="match-cand-name">鈴木 愛</span>', '<span class="match-reason-badge">同コマ担当中</span>', '<button type="button" class="confirm-btn">この講師に依頼</button>')}
        ${teacherRow(3, ownerName, '', askBtn)}
      </div>`;
    }
    return `<div class="match-slot${taken ? ' mp-slot-readonly' : ' matching-pick-slot mp-slot-card'}">
      <div class="ms-slot-label">5講（19:50–20:40）${taken ? '' : '<span class="mp-slot-meta">教室 1/6</span>'}</div>
      ${taken ? '' : subjectRow('pending')}
      ${body}
    </div>`;
  }

  const slots = {
    has: { el: document.getElementById('hasTeachersSlot'), empty: false, taken: false },
    none: { el: document.getElementById('noTeachersSlot'), empty: true, taken: false },
  };

  function render(){
    Object.values(slots).forEach(slot=>{
      slot.el.innerHTML = pickCard({ empty: slot.empty, taken: slot.taken });
    });
  }

  document.addEventListener('click', (e)=>{
    const take = e.target.closest('[data-take]');
    const untake = e.target.closest('[data-untake]');
    const otherAsk = e.target.closest('.confirm-btn:not([data-take])');
    const host = e.target.closest('#hasTeachersSlot, #noTeachersSlot');
    if(!host) return;
    const slot = host.id === 'noTeachersSlot' ? slots.none : slots.has;
    if(take){
      slot.taken = true;
      render();
      return;
    }
    if(untake){
      slot.taken = false;
      render();
      return;
    }
    if(otherAsk) e.preventDefault();
  });

  render();
})();
