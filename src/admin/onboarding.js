import { switchView } from './finance-ui.js';

const STORAGE_KEY = 'pitacoma_admin_onboarding_v1';

const STEPS = [
  {
    title: 'ステップ 1：生徒を登録',
    body: '「生徒登録」タブで、名前・学年・受講教科と希望コマを入力します。ここがコマ組みの土台になります。',
    view: 'student',
  },
  {
    title: 'ステップ 2：講師のシフトを回収',
    body: '「シフト管理」タブで、講師が出した出勤可能日を確認・編集します。シフトが揃ってからコマを組むとスムーズです。',
    view: 'teacherSchedule',
  },
  {
    title: 'ステップ 3：カレンダーでコマを組む',
    body: '「カレンダー」タブの「コマを組む」から、未確定のコマに講師を割り当てます。候補には理由（バッジ）が表示されます。',
    view: 'calendar',
  },
];

function isDone(){
  try{
    return localStorage.getItem(STORAGE_KEY) === '1';
  }catch(_e){
    return false;
  }
}

function markDone(){
  try{
    localStorage.setItem(STORAGE_KEY, '1');
  }catch(_e){ /* private mode */ }
}

function renderStep(index){
  const step = STEPS[index];
  const titleEl = document.getElementById('onboardingTitle');
  const bodyEl = document.getElementById('onboardingBody');
  const stepEl = document.getElementById('onboardingStepLabel');
  const nextBtn = document.getElementById('onboardingNextBtn');
  const startBtn = document.getElementById('onboardingStartBtn');
  if(!titleEl || !bodyEl) return;

  titleEl.textContent = step.title;
  bodyEl.textContent = step.body;
  if(stepEl) stepEl.textContent = `${index + 1} / ${STEPS.length}`;
  if(nextBtn) nextBtn.hidden = index >= STEPS.length - 1;
  if(startBtn) startBtn.hidden = index < STEPS.length - 1;
  switchView(step.view);
}

function closeOverlay(){
  const overlay = document.getElementById('onboardingOverlay');
  if(!overlay) return;
  overlay.hidden = true;
  overlay.setAttribute('aria-hidden', 'true');
}

function bindEvents(){
  const overlay = document.getElementById('onboardingOverlay');
  const nextBtn = document.getElementById('onboardingNextBtn');
  const skipBtn = document.getElementById('onboardingSkipBtn');
  const startBtn = document.getElementById('onboardingStartBtn');
  if(!overlay) return;

  let index = 0;

  nextBtn?.addEventListener('click', ()=>{
    if(index < STEPS.length - 1){
      index++;
      renderStep(index);
    }
  });

  const finish = ()=>{
    markDone();
    closeOverlay();
    switchView('calendar');
  };

  skipBtn?.addEventListener('click', finish);
  startBtn?.addEventListener('click', finish);
}

export function initOnboarding(){
  if(isDone()) return;
  const overlay = document.getElementById('onboardingOverlay');
  if(!overlay) return;

  bindEvents();
  overlay.hidden = false;
  overlay.setAttribute('aria-hidden', 'false');
  renderStep(0);
}
