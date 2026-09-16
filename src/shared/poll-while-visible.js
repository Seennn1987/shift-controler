// 画面が表示されている間だけ、一定間隔で処理を回す。
// 裏タブでは読み取りを止め、前面に戻ったときにすぐ1回実行する。

const POLL_INTERVAL_MS = {
  DEFAULT: 60_000,
  APPROVAL: 30_000,
  SLOW: 120_000,
};

function startVisiblePoll(run, intervalMs, options = {}){
  const runImmediately = options.runImmediately !== false;
  let timer = null;
  let running = false;
  let stopped = false;

  const tick = async (force = false)=>{
    if(stopped) return;
    if(!force && document.visibilityState === 'hidden') return;
    if(running) return;
    running = true;
    try{
      await run();
    }finally{
      running = false;
    }
  };

  const onVisibility = ()=>{
    if(document.visibilityState === 'visible') tick(true);
  };

  if(runImmediately) tick(true);
  timer = setInterval(()=> tick(false), intervalMs);
  document.addEventListener('visibilitychange', onVisibility);

  return ()=>{
    stopped = true;
    if(timer) clearInterval(timer);
    timer = null;
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

export { POLL_INTERVAL_MS, startVisiblePoll };
