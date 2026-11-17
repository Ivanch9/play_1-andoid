// Headless-проверка логики: бот проходит игру без браузера.
// Запуск: node test/sim.js [кол-во забегов]
globalThis.NR = {};
require('../js/engine.js');
require('../js/game.js');

const { W, H } = NR;
const STEP = 1 / 60;
const RUNS = Number(process.argv[2]) || 12;

function bot(g) {
  const p = g.player, inp = g.input;
  let fx = 0, fy = 0, nearest = null, nd = Infinity;

  for (const e of g.enemies) {
    if (e.intro > 0) continue;
    const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
    if (d < nd) { nd = d; nearest = e; }
    const range = (e.r + 90) * 2.5;
    if (d < range) {
      const w = (range - d) / range;
      fx += (dx / d) * w * 2 - (dy / d) * w * 0.8;
      fy += (dy / d) * w * 2 + (dx / d) * w * 0.8;
    }
  }
  if (nearest) {
    const t = nd / g.stats.bulletSpeed;
    inp.mx = nearest.x + nearest.vx * t;
    inp.my = nearest.y + nearest.vy * t;
  }

  for (const b of g.eb.items) {
    const rx = p.x - b.x, ry = p.y - b.y, v2 = b.vx * b.vx + b.vy * b.vy;
    const tca = (rx * b.vx + ry * b.vy) / v2;
    if (tca < 0 || tca > 0.8) continue;
    const cx = rx - b.vx * tca, cy = ry - b.vy * tca, miss = Math.hypot(cx, cy) || 0.01;
    if (miss < 34) {
      const w = (1 - tca / 0.8) * 3;
      fx += (cx / miss) * w; fy += (cy / miss) * w;
      if (miss < 16 && tca < 0.12 && p.dashCd <= 0) g.dashQueued = true;
    }
  }

  const m = 120;
  if (p.x < m) fx += ((m - p.x) / m) * 2;
  if (p.x > W - m) fx -= ((p.x - (W - m)) / m) * 2;
  if (p.y < m) fy += ((m - p.y) / m) * 2;
  if (p.y > H - m) fy -= ((p.y - (H - m)) / m) * 2;
  fx += ((W / 2 - p.x) / W) * 0.6;
  fy += ((H / 2 - p.y) / H) * 0.6;
  for (const k of g.pickups) { fx += Math.sign(k.x - p.x) * 0.4; fy += Math.sign(k.y - p.y) * 0.4; }

  const th = 0.15;
  inp.right = fx > th; inp.left = fx < -th; inp.down = fy > th; inp.up = fy < -th;
}

function run(seed, god) {
  const g = new NR.Game(seed);
  g.godMode = god;
  const maxSteps = 60 * 60 * 15;
  let steps = 0, maxEnemies = 0, maxEB = 0, maxPB = 0;
  const waveStart = {};
  while (steps < maxSteps) {
    if (g.state === 'upgrade') { g.chooseUpgrade(steps % 3); continue; }
    if (g.state !== 'play') break;
    if (!(g.wave in waveStart)) waveStart[g.wave] = g.time;
    bot(g);
    g.update(STEP);
    steps++;
    g.events.length = 0;
    maxEnemies = Math.max(maxEnemies, g.enemies.length);
    maxEB = Math.max(maxEB, g.eb.items.length);
    maxPB = Math.max(maxPB, g.pb.items.length);
    if (steps % 30 === 0) {
      const err = g.validate();
      if (err) throw new Error(`seed ${seed}: ${err} at t=${g.time.toFixed(1)}`);
    }
  }
  const bossT = waveStart[9] !== undefined ? g.time - waveStart[9] : 0;
  const waves = [];
  for (let w = 1; w <= 9; w++) if (waveStart[w] !== undefined) waves.push(Math.round((waveStart[w + 1] !== undefined ? waveStart[w + 1] : g.time) - waveStart[w]));
  return { waves: waves.join('/'), seed, state: g.state, time: g.time, wave: g.wave, kills: g.kills, hits: g.hitsTaken,
    maxEnemies, maxEB, maxPB, bossT, upgrades: g.taken.join(',') };
}

const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
let failed = false;

for (const god of [true, false]) {
  console.log(`\n=== ${god ? 'Бессмертный бот (длительность и проходимость)' : 'Обычный бот (сложность)'} ===`);
  const t0 = process.hrtime.bigint();
  const res = [];
  for (let i = 0; i < RUNS; i++) res.push(run(1000 + i * 7919, god));
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  for (const r of res) {
    console.log(`seed ${String(r.seed).padStart(6)} | ${r.state.padEnd(5)} | ${fmt(r.time)} | волна ${r.wave} | убито ${String(r.kills).padStart(3)} | ударов ${String(r.hits).padStart(3)} | босс ${r.bossT.toFixed(0)}с | волны ${r.waves} | макс врагов ${r.maxEnemies}, пуль врагов ${r.maxEB}, своих ${r.maxPB}`);
  }
  const wins = res.filter(r => r.state === 'win').length;
  const avgT = res.reduce((a, r) => a + r.time, 0) / res.length;
  const simSec = res.reduce((a, r) => a + r.time, 0);
  console.log(`побед: ${wins}/${res.length}, среднее время: ${fmt(avgT)}, симуляция: ${(ms / (simSec * 60) * 1000).toFixed(1)} мкс на шаг`);
  if (god) {
    if (wins !== res.length) { console.log('ОШИБКА: бессмертный бот не дошёл до победы'); failed = true; }
    if (avgT < 200 || avgT > 420) { console.log('ВНИМАНИЕ: длительность забега вне диапазона 3:20–7:00'); }
  }
}
process.exit(failed ? 1 : 0);
