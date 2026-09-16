(function(){
  const statusEl = document.getElementById('gcalSyncStatus');
  const msgEl = document.getElementById('gcalSyncMsg');
  const btn = document.getElementById('gcalSyncBtn');

  function selectedScope(){
    const checked = document.querySelector('input[name="gcalScope"]:checked');
    return checked ? checked.value : 'all';
  }

  function scopeLabel(scope){
    return scope === 'owner' ? '自分の担当だけ' : '教室全体';
  }

  btn.addEventListener('click', ()=>{
    msgEl.textContent = '';
    const label = scopeLabel(selectedScope());
    statusEl.textContent = `試しページです。本番では「${label}」をGoogleカレンダーに送ります。`;
  });
})();
