const TITLES = {
  a: '機能の更新',
  b: '機能アップデート情報',
  c: 'お知らせ',
};

const overlay = document.getElementById('appConfirmOverlay');
const titleEl = document.getElementById('appConfirmTitle');
const closeBtn = document.getElementById('appConfirmCloseBtn');
const submitBtn = document.getElementById('appConfirmSubmitBtn');

function openDialog(key){
  titleEl.textContent = TITLES[key] || TITLES.a;
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  document.body.classList.add('app-confirm-open');
  submitBtn.focus();
}

function closeDialog(){
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('app-confirm-open');
}

document.querySelectorAll('[data-open]').forEach(btn=>{
  btn.addEventListener('click', ()=> openDialog(btn.dataset.open));
});
closeBtn.addEventListener('click', closeDialog);
submitBtn.addEventListener('click', closeDialog);
overlay.addEventListener('click', (ev)=>{
  if(ev.target === overlay) closeDialog();
});
document.addEventListener('keydown', (ev)=>{
  if(ev.key === 'Escape' && !overlay.hidden) closeDialog();
});
