/** 検索付きコンボボックス（hidden input と連動） */

const registry = new Map();

function escapeHtml(str){
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
}

function findLabel(groups, value, emptyLabel){
  if(!value) return emptyLabel;
  for(const g of groups){
    const hit = g.items.find(it=> it.value === value);
    if(hit) return hit.label;
  }
  return emptyLabel;
}

function renderList(root, groups, query, config = {}){
  const listEl = root.querySelector('.search-combobox-list');
  if(!listEl) return;
  const q = query.trim().toLowerCase();
  let html = '';
  const resetLabel = config.resetLabel || config.emptyLabel || 'すべて表示';
  if(config.showResetOption !== false){
    if(!q || resetLabel.toLowerCase().includes(q)){
      html += `<button type="button" class="search-combobox-option search-combobox-option-reset" data-value="" role="option">${escapeHtml(resetLabel)}</button>`;
    }
  }
  groups.forEach(group=>{
    const items = group.items.filter(it=>{
      if(!q) return true;
      return (it.searchText || it.label).toLowerCase().includes(q);
    });
    if(items.length === 0) return;
    if(group.label){
      html += `<div class="search-combobox-group-label">${escapeHtml(group.label)}</div>`;
    }
    items.forEach(it=>{
      const muted = it.muted ? ' search-combobox-option-muted' : '';
      html += `<button type="button" class="search-combobox-option${muted}" data-value="${escapeHtml(it.value)}" role="option">${escapeHtml(it.label)}</button>`;
    });
  });
  if(!html){
    html = '<div class="search-combobox-empty">該当なし</div>';
  }
  listEl.innerHTML = html;
}

function closePanel(root){
  root.classList.remove('is-open');
  const panel = root.querySelector('.search-combobox-panel');
  if(panel) panel.hidden = true;
}

function openPanel(root){
  root.classList.add('is-open');
  const panel = root.querySelector('.search-combobox-panel');
  const search = root.querySelector('.search-combobox-search');
  if(panel) panel.hidden = false;
  if(search){
    search.value = '';
    const entry = registry.get(root.querySelector('input[type="hidden"]')?.id);
    renderList(root, root._groups || [], '', entry?.config || {});
    setTimeout(()=> search.focus(), 0);
  }
}

function clearValue(root, input, config){
  input.value = '';
  syncTrigger(root, input, config);
  closePanel(root);
  input.dispatchEvent(new Event('change', { bubbles: true }));
  if(config.onChange) config.onChange('');
}

function syncTrigger(root, input, config = {}){
  const trigger = root.querySelector('.search-combobox-trigger');
  if(!trigger) return;
  const emptyLabel = config.emptyLabel || '選択…';
  const wrap = root.closest('.search-combobox-wrap');
  const clearBtn = wrap?.querySelector('.search-combobox-clear');
  if(!input.value){
    trigger.textContent = emptyLabel;
    trigger.removeAttribute('title');
    trigger.classList.remove('is-active-filter');
    if(clearBtn) clearBtn.hidden = true;
  } else {
    const label = findLabel(root._groups || [], input.value, emptyLabel);
    trigger.textContent = label;
    trigger.title = label;
    trigger.classList.add('is-active-filter');
    if(clearBtn) clearBtn.hidden = !config.showClearButton;
  }
  trigger.disabled = !!root._disabled;
}

function buildDom(root, input, config){
  root.innerHTML = '';
  root.appendChild(input);
  root.insertAdjacentHTML('beforeend', `
    <button type="button" class="search-combobox-trigger" aria-haspopup="listbox" aria-expanded="false"></button>
    <div class="search-combobox-panel" hidden>
      <input type="search" class="search-combobox-search" placeholder="${escapeHtml(config.searchPlaceholder || '検索…')}" autocomplete="off">
      <div class="search-combobox-list" role="listbox"></div>
    </div>
  `);

  const trigger = root.querySelector('.search-combobox-trigger');
  const search = root.querySelector('.search-combobox-search');
  const listEl = root.querySelector('.search-combobox-list');

  trigger.id = `${input.id}-trigger`;

  trigger.addEventListener('click', ()=>{
    if(root._disabled) return;
    if(root.classList.contains('is-open')) closePanel(root);
    else openPanel(root);
  });

  search.addEventListener('input', ()=>{
    const entry = registry.get(input.id);
    renderList(root, root._groups || [], search.value, entry?.config || config);
  });

  search.addEventListener('keydown', (e)=>{
    if(e.key === 'Escape'){
      closePanel(root);
      trigger.focus();
    }
  });

  listEl.addEventListener('click', (e)=>{
    const btn = e.target.closest('.search-combobox-option');
    if(!btn) return;
    const entry = registry.get(input.id);
    const cfg = entry?.config || config;
    input.value = btn.dataset.value || '';
    syncTrigger(root, input, cfg);
    closePanel(root);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    if(cfg.onChange) cfg.onChange(input.value);
  });

  document.addEventListener('click', (e)=>{
    if(!root.classList.contains('is-open')) return;
    if(root.contains(e.target)) return;
    closePanel(root);
  });
}

function ensureWrap(root){
  if(root.parentElement?.classList.contains('search-combobox-wrap')) return root.parentElement;
  const wrap = document.createElement('div');
  wrap.className = 'search-combobox-wrap';
  root.parentNode.insertBefore(wrap, root);
  wrap.appendChild(root);
  wrap.insertAdjacentHTML('beforeend', `
    <button type="button" class="search-combobox-clear" hidden aria-label="絞り込みを解除">× 解除</button>
  `);
  const clearBtn = wrap.querySelector('.search-combobox-clear');
  clearBtn.addEventListener('click', ()=>{
    const input = root.querySelector('input[type="hidden"]');
    const entry = registry.get(input?.id);
    if(!input || !entry) return;
    clearValue(root, input, entry.config);
  });
  return wrap;
}

export function setupSearchCombobox(inputId, config = {}){
  const input = document.getElementById(inputId);
  if(!input) return null;
  let root = input.closest('.search-combobox');
  if(!root){
    root = document.createElement('div');
    root.className = 'search-combobox';
    input.parentNode.insertBefore(root, input);
  }
  if(!root.querySelector('.search-combobox-trigger')){
    buildDom(root, input, config);
    syncTrigger(root, input, config);
  }
  if(config.showClearButton){
    ensureWrap(root);
  }
  registry.set(inputId, { root, input, config });
  syncTrigger(root, input, config);
  return root;
}

export function refreshSearchCombobox(inputId, partial = {}){
  const entry = registry.get(inputId);
  if(!entry){
    setupSearchCombobox(inputId, partial);
    return refreshSearchCombobox(inputId, partial);
  }
  const { root, input } = entry;
  const merged = { ...entry.config, ...partial };
  entry.config = merged;
  if(merged.showClearButton) ensureWrap(root);
  root._groups = merged.groups || [];
  root._disabled = !!merged.disabled;
  renderList(root, root._groups, root.querySelector('.search-combobox-search')?.value || '', merged);
  if(merged.value !== undefined){
    input.value = merged.value;
  }
  syncTrigger(root, input, merged);
  const trigger = root.querySelector('.search-combobox-trigger');
  if(trigger) trigger.disabled = !!merged.disabled;
}

export function getSearchComboboxValue(inputId){
  return document.getElementById(inputId)?.value ?? '';
}

export function setSearchComboboxValue(inputId, value){
  refreshSearchCombobox(inputId, { value: value || '' });
}

/** 既存の select を検索コンボボックスに置き換える */
export function migrateSelectToSearchCombobox(selectId, config = {}){
  const sel = document.getElementById(selectId);
  if(!sel || sel.tagName !== 'SELECT' || sel.dataset.comboboxMigrated === '1') return;
  const parent = sel.parentNode;
  const hidden = document.createElement('input');
  hidden.type = 'hidden';
  hidden.id = selectId;
  hidden.value = sel.value || '';
  hidden.dataset.comboboxMigrated = '1';
  parent.insertBefore(hidden, sel);
  sel.remove();
  setupSearchCombobox(selectId, config);
}
