// Связка: ввод, игровой цикл с фиксированным шагом, сцены, рекорды.
(function () {
  const W = NR.W, H = NR.H;
  const STEP = 1 / 60;
  const canvas = document.getElementById('game');
  const R = new NR.Renderer(canvas);
  const A = new NR.Audio();

  let game = null;
  let scene = 'menu';
  let paused = false;
  let endT = 0;
  let acc = 0;
  let hover = -1;
  let newRecord = false;
  let mouse = null; // мировые координаты курсора
  let screenMouse = { x: innerWidth / 2, y: innerHeight / 2 };
  const keys = new Set();
  let best = loadBest();

  function loadBest() {
    try { return JSON.parse(localStorage.getItem('neonrift.best')) || {}; } catch (e) { return {}; }
  }
  function saveBest() {
    try { localStorage.setItem('neonrift.best', JSON.stringify(best)); } catch (e) { /* нет доступа */ }
  }

  function start() {
    A.init();
    A.setIntensity(1);
    game = new NR.Game((Math.random() * 4294967296) >>> 0);
    scene = 'game';
    paused = false;
    endT = 0;
    acc = 0;
    newRecord = false;
    R.reset();
  }

  function toMenu() {
    scene = 'menu';
    game = null;
    paused = false;
    A.setPaused(false);
    A.setIntensity(0);
    R.reset();
  }

  function setPaused(p) {
    if (!game || game.state === 'dead' || game.state === 'win') return;
    paused = p;
    A.setPaused(p);
  }

  function choose(i) {
    if (game && game.state === 'upgrade' && game.chooseUpgrade(i)) hover = -1;
  }

  function recordResult() {
    const reached = game.wave;
    if (game.state === 'win') {
      best.wins = (best.wins || 0) + 1;
      if (!best.bestTime || game.time < best.bestTime) { best.bestTime = game.time; newRecord = true; }
      best.bestWave = NR.WAVES.length + 1;
    } else if (!best.bestWave || reached > best.bestWave) {
      best.bestWave = reached;
      newRecord = !best.bestTime;
    }
    saveBest();
  }

  const ended = () => game && (game.state === 'dead' || game.state === 'win');

  // ---------- Ввод ----------
  addEventListener('keydown', e => {
    const k = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) e.preventDefault();
    if (e.repeat) return;
    keys.add(k);
    A.init();

    if (k === 'KeyM') { A.toggleMute(); return; }
    if (scene === 'menu') {
      if (k === 'Enter' || k === 'Space') start();
      return;
    }
    if (paused) {
      if (k === 'Escape' || k === 'KeyP') setPaused(false);
      else if (k === 'KeyQ') toMenu();
      return;
    }
    if (ended()) {
      if ((k === 'Enter' || k === 'KeyR' || k === 'Space') && endT > 1.5) start();
      else if (k === 'KeyQ' || k === 'Escape') toMenu();
      return;
    }
    if (k === 'Escape' || k === 'KeyP') { setPaused(true); return; }
    if (game.state === 'upgrade') {
      if (k === 'Digit1' || k === 'Numpad1') choose(0);
      if (k === 'Digit2' || k === 'Numpad2') choose(1);
      if (k === 'Digit3' || k === 'Numpad3') choose(2);
      return;
    }
    if (k === 'Space' || k === 'ShiftLeft' || k === 'ShiftRight') game.dashQueued = true;
  });
  addEventListener('keyup', e => keys.delete(e.code));

  function updateMouse(e) {
    screenMouse = { x: e.clientX, y: e.clientY };
    mouse = R.toWorld(e.clientX, e.clientY);
    hover = game && game.state === 'upgrade' ? R.cardAt(mouse.x, mouse.y) : -1;
  }
  canvas.addEventListener('mousemove', updateMouse);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('mousedown', e => {
    updateMouse(e);
    A.init();
    if (scene === 'menu') { if (e.button === 0) start(); return; }
    if (paused) { setPaused(false); return; }
    if (ended()) { if (endT > 1.5 && e.button === 0) start(); return; }
    if (game.state === 'upgrade') { if (hover >= 0) choose(hover); return; }
    if (e.button === 2) game.dashQueued = true;
  });

  addEventListener('blur', () => {
    keys.clear();
    if (scene === 'game' && game && game.state === 'play') setPaused(true);
  });
  addEventListener('resize', () => {
    R.resize();
    mouse = R.toWorld(screenMouse.x, screenMouse.y);
  });

  function syncInput() {
    const i = game.input;
    i.up = keys.has('KeyW') || keys.has('ArrowUp');
    i.down = keys.has('KeyS') || keys.has('ArrowDown');
    i.left = keys.has('KeyA') || keys.has('ArrowLeft');
    i.right = keys.has('KeyD') || keys.has('ArrowRight');
    if (mouse) { i.mx = mouse.x; i.my = mouse.y; }
  }

  // ---------- Цикл ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    if (scene === 'game' && !paused) {
      if (R.hitstop <= 0 && game.state === 'play') {
        acc += dt;
        syncInput();
        let n = 0;
        while (acc >= STEP && n++ < 5) { game.update(STEP); acc -= STEP; }
        if (acc > STEP) acc = 0;
      }
      for (const ev of game.events) {
        R.consume(ev);
        A.play(ev);
        if (ev.t === 'death' || ev.t === 'win') recordResult();
      }
      game.events.length = 0;
      if (ended()) endT += dt;
    }
    if (!paused) R.update(dt);

    R.draw(game, { scene, paused, hover, best, muted: A.muted, endT, newRecord, mouse });
    requestAnimationFrame(frame);
  }

  A.setIntensity(0);
  requestAnimationFrame(frame);

  // Для отладки и автотестов в браузере
  NR.debug = { get game() { return game; }, start, choose, R };
})();
