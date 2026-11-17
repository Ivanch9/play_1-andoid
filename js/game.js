// Игровая логика без DOM: её можно гонять в Node (test/sim.js).
var NR = globalThis.NR = globalThis.NR || {};

(function () {
  const W = NR.W, H = NR.H, TAU = NR.TAU;
  const { clamp, angleDiff } = NR;

  NR.COLORS = {
    player: '#33ffff', pbullet: '#99ffff', chaser: '#ff33cc', shooter: '#ffee33',
    splitter: '#ff8833', mini: '#ffbb66', tank: '#44ff99', boss: '#ff3355',
    ebullet: '#ff5599', heart: '#55ff88', orb: '#77ffff', shield: '#bbffff',
  };

  const TYPES = {
    chaser:   { r: 11, hp: 2,   speed: 125 },
    shooter:  { r: 13, hp: 3,   speed: 95 },
    splitter: { r: 16, hp: 4,   speed: 115 },
    mini:     { r: 7,  hp: 1,   speed: 195 },
    tank:     { r: 22, hp: 10,  speed: 52 },
    boss:     { r: 46, hp: 900, speed: 70 },
  };
  NR.TYPES = TYPES;

  // dur — сколько секунд идёт спавн, rate — врагов в секунду (в среднем)
  const WAVES = [
    { dur: 20, rate: 0.8,  mix: { chaser: 1 } },
    { dur: 24, rate: 0.95, mix: { chaser: 0.75, shooter: 0.25 } },
    { dur: 27, rate: 1.05, mix: { chaser: 0.55, shooter: 0.25, splitter: 0.2 } },
    { dur: 28, rate: 1.1,  mix: { chaser: 0.45, shooter: 0.2, splitter: 0.2, tank: 0.15 } },
    { dur: 30, rate: 1.2,  mix: { chaser: 0.4, shooter: 0.25, splitter: 0.2, tank: 0.15 } },
    { dur: 30, rate: 1.3,  mix: { chaser: 0.35, shooter: 0.25, splitter: 0.25, tank: 0.15 } },
    { dur: 32, rate: 1.4,  mix: { chaser: 0.35, shooter: 0.25, splitter: 0.2, tank: 0.2 } },
    { dur: 34, rate: 1.5,  mix: { chaser: 0.3, shooter: 0.3, splitter: 0.2, tank: 0.2 } },
  ];
  NR.WAVES = WAVES;
  const MAX_ALIVE = 48;

  const VAMP = [18, 13, 9];
  const SHIELD = [12, 9, 6];

  const UPGRADES = [
    { id: 'multi', name: 'Веерный залп', max: 4, desc: () => '+1 снаряд в каждом залпе',
      apply: g => { g.stats.multishot++; } },
    { id: 'rate', name: 'Разгон', max: 5, desc: () => '+25% к скорострельности',
      apply: g => { g.stats.fireRate *= 1.25; } },
    { id: 'dmg', name: 'Тяжёлые заряды', max: 5, desc: () => '+40% к урону снарядов',
      apply: g => { g.stats.damage *= 1.4; } },
    { id: 'pierce', name: 'Пробой', max: 3, desc: () => 'Снаряды пробивают ещё одного врага',
      apply: g => { g.stats.pierce++; } },
    { id: 'bounce', name: 'Рикошет', max: 3, desc: () => 'Снаряды отскакивают от стен ещё раз',
      apply: g => { g.stats.bounce++; } },
    { id: 'speed', name: 'Форсаж', max: 3, desc: () => '+12% к скорости, рывок перезаряжается быстрее',
      apply: g => { g.stats.moveSpeed *= 1.12; g.stats.dashCd *= 0.8; } },
    { id: 'hp', name: 'Живучесть', max: 3, desc: () => '+1 к максимуму здоровья и полное лечение',
      apply: g => { g.stats.maxHp++; g.player.hp = g.stats.maxHp; } },
    { id: 'vamp', name: 'Вампиризм', max: 3, desc: g => `Лечит 1 ед. здоровья за каждые ${VAMP[g.lvl('vamp')]} убийств`,
      apply: g => { g.stats.killsPerHeal = VAMP[g.lvl('vamp')]; } },
    { id: 'shield', name: 'Энергощит', max: 3, desc: g => `Щит поглощает один удар, перезарядка ${SHIELD[g.lvl('shield')]} с`,
      apply: g => { g.stats.shieldCd = SHIELD[g.lvl('shield')]; g.player.shield = true; } },
    { id: 'orb', name: 'Спутник', max: 3, desc: () => '+1 сфера на орбите: жжёт врагов и гасит пули',
      apply: g => { g.stats.orbs++; } },
    { id: 'nova', name: 'Нова-рывок', max: 1, desc: () => 'Рывок выпускает кольцо из 14 снарядов',
      apply: g => { g.stats.nova = true; } },
    { id: 'crit', name: 'Крит', max: 3, desc: () => '+15% шанс нанести двойной урон',
      apply: g => { g.stats.crit += 0.15; } },
  ];
  NR.UPGRADES = UPGRADES;

  class Game {
    constructor(seed) {
      this.seed = seed >>> 0;
      this.rng = NR.mulberry32(this.seed);
      this.pb = new NR.Pool(() => ({ hits: [] }), 700); // пули игрока
      this.eb = new NR.Pool(() => ({}), 600);            // пули врагов
      this.reset();
    }

    rand(a, b) { return a + (b - a) * this.rng(); }
    lvl(id) { return this.levels[id] || 0; }
    emit(t, x, y, extra) {
      const e = { t, x, y };
      if (extra) Object.assign(e, extra);
      this.events.push(e);
    }

    reset() {
      this.time = 0;
      this.state = 'play'; // play | upgrade | dead | win
      this.events = [];
      this.nextId = 1;
      this.stats = {
        damage: 1, fireRate: 6, multishot: 1, pierce: 0, bounce: 0, moveSpeed: 250,
        maxHp: 5, killsPerHeal: 0, shieldCd: 0, orbs: 0, nova: false, crit: 0,
        bulletSpeed: 760, dashCd: 1.1,
      };
      this.levels = {};
      this.taken = [];
      this.player = {
        x: W / 2, y: H / 2, r: 11, vx: 0, vy: 0, hp: 5, inv: 0, fireT: 0.2,
        dashT: 0, dashCd: 0, dx: 0, dy: -1, aim: -Math.PI / 2,
        shield: false, shieldT: 0, orbA: 0, healKills: 0,
      };
      this.enemies = [];
      this.spawns = [];
      this.pickups = [];
      this.pb.clear();
      this.eb.clear();
      this.kills = 0;
      this.hitsTaken = 0;
      this.boss = null;
      this.choices = null;
      this.winT = 0;
      this.dashQueued = false;
      this.godMode = false; // для автотестов
      this.input = { mx: W / 2, my: H / 2 - 100, up: false, down: false, left: false, right: false };
      this.startWave(1);
    }

    // ---------- Волны ----------
    startWave(n) {
      this.wave = n;
      this.waveT = 0;
      this.spawnAcc = 0;
      this.waveDone = false;
      this.clearT = 0;
      if (n > WAVES.length) {
        this.spawnBoss();
        this.emit('boss', W / 2, H / 2);
      } else {
        this.emit('wave', W / 2, H / 2, { n });
      }
    }

    get waveDef() { return WAVES[this.wave - 1]; }

    pickType(mix) {
      let r = this.rng(), last = 'chaser';
      for (const k in mix) { last = k; r -= mix[k]; if (r <= 0) return k; }
      return last;
    }

    queueSpawn(type, x, y) {
      const p = this.player;
      if (x === undefined) {
        let tries = 0;
        do {
          const side = Math.floor(this.rng() * 4), m = 40;
          if (side === 0) { x = this.rand(m, W - m); y = m; }
          else if (side === 1) { x = this.rand(m, W - m); y = H - m; }
          else if (side === 2) { x = m; y = this.rand(m, H - m); }
          else { x = W - m; y = this.rand(m, H - m); }
        } while (NR.dist2(x, y, p.x, p.y) < 300 * 300 && ++tries < 12);
      }
      this.spawns.push({ type, x, y, t: 0.9, max: 0.9 });
    }

    addEnemy(type, x, y) {
      const T = TYPES[type];
      const boss = type === 'boss';
      const hpMul = boss ? 1 : 1 + 0.06 * (this.wave - 1);
      const p = this.player;
      const e = {
        id: this.nextId++, type, x, y, vx: 0, vy: 0, r: T.r,
        hp: T.hp * hpMul, maxHp: T.hp * hpMul,
        speed: T.speed * (boss ? 1 : 1 + 0.02 * (this.wave - 1)),
        flash: 0, fireT: this.rand(1.2, 2.4), face: Math.atan2(p.y - y, p.x - x),
        ph: this.rng() * TAU, orbCd: 0, dead: false, intro: 0,
      };
      this.enemies.push(e);
      return e;
    }

    updateSpawning(dt) {
      if (!this.boss) {
        const w = this.waveDef;
        this.waveT += dt;
        if (this.waveT < w.dur) {
          // темп нарастает от 70% до 130% к концу волны
          this.spawnAcc += dt * w.rate * (0.7 + 0.6 * this.waveT / w.dur);
          while (this.spawnAcc >= 1) {
            this.spawnAcc -= 1;
            if (this.enemies.length + this.spawns.length < MAX_ALIVE) this.queueSpawn(this.pickType(w.mix));
          }
        }
      }
      for (let i = this.spawns.length - 1; i >= 0; i--) {
        const s = this.spawns[i];
        s.t -= dt;
        if (s.t <= 0) {
          this.addEnemy(s.type, s.x, s.y);
          this.emit('spawn', s.x, s.y, { type: s.type });
          this.spawns.splice(i, 1);
        }
      }
    }

    updateWaveFlow(dt) {
      if (this.boss) {
        if (this.boss.dead) {
          this.winT += dt;
          if (this.winT > 2.8) { this.state = 'win'; this.emit('win', W / 2, H / 2); }
        }
        return;
      }
      const w = this.waveDef;
      if (!this.waveDone && this.waveT >= w.dur && this.enemies.length === 0 && this.spawns.length === 0) {
        this.waveDone = true;
        this.clearT = 1.4;
        this.eb.clear();
        this.emit('waveclear', W / 2, H / 2, { n: this.wave });
      }
      if (this.waveDone) {
        this.clearT -= dt;
        if (this.clearT <= 0) this.offerUpgrades();
      }
    }

    offerUpgrades() {
      const avail = UPGRADES.filter(u => this.lvl(u.id) < u.max);
      for (let i = avail.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [avail[i], avail[j]] = [avail[j], avail[i]];
      }
      // Хотя бы одно атакующее улучшение в каждом выборе, иначе забег может «застрять»
      const offensive = ['multi', 'rate', 'dmg', 'pierce', 'crit'];
      const oi = avail.findIndex(u => offensive.includes(u.id));
      if (oi > 2) [avail[0], avail[oi]] = [avail[oi], avail[0]];
      this.choices = avail.slice(0, 3).map(u => ({ id: u.id, name: u.name, desc: u.desc(this), lvl: this.lvl(u.id), max: u.max }));
      this.state = 'upgrade';
      this.emit('offer', W / 2, H / 2);
    }

    chooseUpgrade(i) {
      if (this.state !== 'upgrade' || !this.choices || !this.choices[i]) return false;
      const u = UPGRADES.find(x => x.id === this.choices[i].id);
      u.apply(this);
      this.levels[u.id] = this.lvl(u.id) + 1;
      this.taken.push(u.id);
      this.choices = null;
      this.state = 'play';
      this.emit('upgrade', this.player.x, this.player.y, { name: u.name });
      this.startWave(this.wave + 1);
      return true;
    }

    // ---------- Главный шаг ----------
    update(dt) {
      if (this.state !== 'play') return;
      this.time += dt;
      this.updatePlayer(dt);
      this.updateSpawning(dt);
      this.updateEnemies(dt);
      this.updateBullets(dt);
      this.updatePickups(dt);
      if (this.state === 'play') this.updateWaveFlow(dt);
    }

    // ---------- Игрок ----------
    updatePlayer(dt) {
      const p = this.player, s = this.stats, inp = this.input;
      let mx = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
      let my = (inp.down ? 1 : 0) - (inp.up ? 1 : 0);
      const ml = Math.hypot(mx, my);
      if (ml > 0) { mx /= ml; my /= ml; }
      p.aim = Math.atan2(inp.my - p.y, inp.mx - p.x);
      p.inv = Math.max(0, p.inv - dt);
      p.dashCd = Math.max(0, p.dashCd - dt);

      if (this.dashQueued) {
        this.dashQueued = false;
        if (p.dashCd <= 0 && p.dashT <= 0) {
          p.dx = ml > 0 ? mx : Math.cos(p.aim);
          p.dy = ml > 0 ? my : Math.sin(p.aim);
          p.dashT = 0.17;
          p.dashCd = s.dashCd;
          this.emit('dash', p.x, p.y);
          if (s.nova) {
            for (let i = 0; i < 14; i++) this.fireBullet(p.x, p.y, (i / 14) * TAU + p.aim, 0.8);
            this.emit('nova', p.x, p.y);
          }
        }
      }

      if (p.dashT > 0) {
        p.dashT -= dt;
        p.vx = p.dx * 900; p.vy = p.dy * 900;
        if (p.dashT <= 0) { p.vx *= 0.3; p.vy *= 0.3; }
      } else {
        const k = Math.min(1, dt * 14);
        p.vx += (mx * s.moveSpeed - p.vx) * k;
        p.vy += (my * s.moveSpeed - p.vy) * k;
      }
      p.x = clamp(p.x + p.vx * dt, p.r, W - p.r);
      p.y = clamp(p.y + p.vy * dt, p.r, H - p.r);

      if (s.shieldCd > 0 && !p.shield) {
        p.shieldT -= dt;
        if (p.shieldT <= 0) { p.shield = true; this.emit('shieldup', p.x, p.y); }
      }

      p.fireT -= dt;
      if (p.fireT <= 0) {
        p.fireT = Math.max(0, p.fireT + 1 / s.fireRate);
        const n = s.multishot, spread = 0.11;
        const cx = p.x + Math.cos(p.aim) * 14, cy = p.y + Math.sin(p.aim) * 14;
        for (let i = 0; i < n; i++) this.fireBullet(cx, cy, p.aim + (i - (n - 1) / 2) * spread, 1);
        this.emit('shoot', cx, cy, { a: p.aim });
      }
      p.orbA += dt * 3.2;
    }

    fireBullet(x, y, a, dmgMul) {
      const b = this.pb.spawn();
      if (!b) return;
      const s = this.stats;
      b.x = x; b.y = y;
      b.vx = Math.cos(a) * s.bulletSpeed; b.vy = Math.sin(a) * s.bulletSpeed;
      b.r = 4; b.dmg = s.damage * dmgMul; b.pierce = s.pierce; b.bounce = s.bounce;
      b.life = 1.6; b.hits.length = 0;
    }

    hurtPlayer() {
      const p = this.player;
      if (p.inv > 0 || p.dashT > 0 || this.state !== 'play') return;
      this.hitsTaken++;
      if (p.shield) {
        p.shield = false;
        p.shieldT = this.stats.shieldCd;
        p.inv = 0.8;
        this.emit('shieldbreak', p.x, p.y);
        this.repel(p.x, p.y, 150);
        return;
      }
      p.hp--;
      p.inv = 1.2;
      this.emit('hurt', p.x, p.y, { hp: p.hp });
      this.repel(p.x, p.y, 170);
      if (p.hp <= 0) {
        if (this.godMode) { p.hp = 1; return; }
        this.state = 'dead';
        this.emit('death', p.x, p.y);
      }
    }

    // Милосердие после удара: гасим ближние пули и отталкиваем врагов
    repel(x, y, rad) {
      this.eb.update(b => NR.dist2(b.x, b.y, x, y) > rad * rad);
      for (const e of this.enemies) {
        if (e.type === 'boss') continue;
        const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1;
        if (d < rad) { e.vx += (dx / d) * 420; e.vy += (dy / d) * 420; }
      }
    }

    // ---------- Враги ----------
    updateEnemies(dt) {
      const p = this.player, es = this.enemies;
      for (let i = 0; i < es.length; i++) {
        const e = es[i];
        if (e.dead) continue;
        const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
        const ux = dx / d, uy = dy / d;
        e.flash = Math.max(0, e.flash - dt);
        e.orbCd = Math.max(0, e.orbCd - dt);
        let tx = 0, ty = 0, accel = 3;

        switch (e.type) {
          case 'chaser':
          case 'mini':
            tx = ux * e.speed; ty = uy * e.speed;
            break;
          case 'splitter': {
            e.ph += dt * 4;
            const wob = Math.sin(e.ph) * 0.9, c = Math.cos(wob), s = Math.sin(wob);
            tx = (ux * c - uy * s) * e.speed; ty = (ux * s + uy * c) * e.speed;
            break;
          }
          case 'shooter': {
            const f = d > 330 ? 1 : d < 230 ? -1 : 0;
            const side = e.id % 2 ? 1 : -1;
            tx = (ux * f - uy * side * 0.6) * e.speed;
            ty = (uy * f + ux * side * 0.6) * e.speed;
            e.fireT -= dt;
            if (e.fireT <= 0) {
              e.fireT = this.rand(1.8, 2.6);
              const a = Math.atan2(dy, dx);
              if (this.wave >= 6) for (let k = -1; k <= 1; k++) this.enemyShoot(e.x, e.y, a + k * 0.22, 230, 5);
              else this.enemyShoot(e.x, e.y, a, 230, 5);
              this.emit('eshoot', e.x, e.y);
            }
            break;
          }
          case 'tank': {
            const da = angleDiff(e.face, Math.atan2(dy, dx));
            e.face += clamp(da, -0.95 * dt, 0.95 * dt);
            tx = Math.cos(e.face) * e.speed; ty = Math.sin(e.face) * e.speed;
            accel = 2;
            break;
          }
          case 'boss':
            this.updateBoss(e, dt, ux, uy, d);
            break;
        }

        if (e.type !== 'boss') {
          const k = Math.min(1, dt * accel);
          e.vx += (tx - e.vx) * k; e.vy += (ty - e.vy) * k;
        }
        e.x = clamp(e.x + e.vx * dt, e.r, W - e.r);
        if (e.intro > 0) e.y += e.vy * dt;
        else e.y = clamp(e.y + e.vy * dt, e.r, H - e.r);

        if (e.intro <= 0 && d < e.r + p.r * 0.8) this.hurtPlayer();
      }

      // Расталкивание врагов друг от друга
      for (let i = 0; i < es.length; i++) {
        const a = es[i];
        for (let j = i + 1; j < es.length; j++) {
          const b = es[j];
          const dx = b.x - a.x, dy = b.y - a.y, rr = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 < rr * rr && d2 > 0.01) {
            const d = Math.sqrt(d2), push = rr - d, nx = dx / d, ny = dy / d;
            const wa = a.type === 'boss' ? 0 : b.type === 'boss' ? 1 : 0.5;
            const wb = 1 - wa;
            a.x -= nx * push * wa; a.y -= ny * push * wa;
            b.x += nx * push * wb; b.y += ny * push * wb;
          }
        }
      }
    }

    enemyShoot(x, y, a, speed, r) {
      const b = this.eb.spawn();
      if (!b) return;
      b.x = x; b.y = y; b.vx = Math.cos(a) * speed; b.vy = Math.sin(a) * speed; b.r = r; b.life = 8;
    }

    radial(x, y, n, speed, off) {
      for (let i = 0; i < n; i++) this.enemyShoot(x, y, off + (i / n) * TAU, speed, 6);
    }

    // ---------- Босс ----------
    spawnBoss() {
      const e = this.addEnemy('boss', W / 2, -70);
      e.intro = 2.2; e.phase = 1; e.mode = 'move'; e.modeT = 3; e.spiralT = 0; e.spiralA = 0;
      e.fanT = 2; e.burstT = 1.5; e.summonT = 5; e.cdx = 0; e.cdy = 0; e.chargeA = 0;
      this.boss = e;
    }

    updateBoss(e, dt, ux, uy, d) {
      if (e.intro > 0) {
        e.intro -= dt;
        e.vx = 0; e.vy = (150 - e.y) * 2;
        return;
      }
      const ratio = e.hp / e.maxHp;
      const ph = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
      if (ph !== e.phase) {
        e.phase = ph;
        e.mode = 'move'; e.modeT = 2.5;
        this.eb.clear();
        this.emit('bossphase', e.x, e.y, { n: ph });
      }

      if (e.mode === 'tele') {
        e.vx *= 0.85; e.vy *= 0.85;
        e.modeT -= dt;
        if (e.modeT <= 0) {
          e.mode = 'charge'; e.modeT = 0.7;
          e.cdx = Math.cos(e.chargeA); e.cdy = Math.sin(e.chargeA);
          this.emit('charge', e.x, e.y);
        }
        return;
      }
      if (e.mode === 'charge') {
        e.vx = e.cdx * 640; e.vy = e.cdy * 640;
        e.modeT -= dt;
        const wall = e.x <= e.r + 2 || e.x >= W - e.r - 2 || e.y <= e.r + 2 || e.y >= H - e.r - 2;
        if (e.modeT <= 0 || wall) {
          e.mode = 'move'; e.modeT = 3.2;
          e.vx = 0; e.vy = 0;
          this.radial(e.x, e.y, 20, 190, this.rng() * TAU);
          this.emit('slam', e.x, e.y);
        }
        return;
      }

      // Обычный режим: держит дистанцию и кружит вокруг игрока
      const want = d > 280 ? 1 : d < 200 ? -1 : 0;
      const tx = (ux * want - uy * 0.5) * e.speed, ty = (uy * want + ux * 0.5) * e.speed;
      const k = Math.min(1, dt * 1.5);
      e.vx += (tx - e.vx) * k; e.vy += (ty - e.vy) * k;
      const aim = Math.atan2(uy, ux);

      // Спираль (все фазы, разная плотность)
      const spiralGap = ph === 1 ? 0.14 : ph === 2 ? 0.22 : 0.16;
      const arms = ph === 3 ? 3 : 2;
      e.spiralT -= dt;
      while (e.spiralT <= 0) {
        e.spiralT += spiralGap;
        for (let a = 0; a < arms; a++) this.enemyShoot(e.x, e.y, e.spiralA + (a / arms) * TAU, 165, 6);
        e.spiralA += ph === 3 ? -0.31 : 0.27;
      }

      if (ph === 1) {
        e.fanT -= dt;
        if (e.fanT <= 0) {
          e.fanT = 2.2;
          for (let i = -2; i <= 2; i++) this.enemyShoot(e.x, e.y, aim + i * 0.17, 250, 6);
          this.emit('eshoot', e.x, e.y);
        }
      } else if (ph === 2) {
        e.burstT -= dt;
        if (e.burstT <= 0) {
          e.burstT = 1.7;
          this.radial(e.x, e.y, 18, 175, this.rng() * TAU);
          this.emit('burst', e.x, e.y);
        }
        e.summonT -= dt;
        if (e.summonT <= 0) {
          e.summonT = 7;
          for (let i = 0; i < 3; i++) {
            const a = this.rng() * TAU;
            this.queueSpawn('chaser', clamp(e.x + Math.cos(a) * 90, 40, W - 40), clamp(e.y + Math.sin(a) * 90, 40, H - 40));
          }
        }
      } else {
        e.modeT -= dt;
        if (e.modeT <= 0) {
          e.mode = 'tele'; e.modeT = 0.85;
          e.chargeA = aim;
          this.emit('chargewarn', e.x, e.y, { a: aim });
        }
      }
    }

    // ---------- Пули и попадания ----------
    updateBullets(dt) {
      const es = this.enemies, p = this.player, s = this.stats;

      this.pb.update(b => {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.life <= 0) return false;
        if (b.x < 0 || b.x > W) {
          if (b.bounce > 0) { b.bounce--; b.vx = -b.vx; b.x = clamp(b.x, 0, W); this.emit('ricochet', b.x, b.y); }
          else { this.emit('wallhit', clamp(b.x, 0, W), b.y); return false; }
        }
        if (b.y < 0 || b.y > H) {
          if (b.bounce > 0) { b.bounce--; b.vy = -b.vy; b.y = clamp(b.y, 0, H); this.emit('ricochet', b.x, b.y); }
          else { this.emit('wallhit', b.x, clamp(b.y, 0, H)); return false; }
        }
        for (let i = 0; i < es.length; i++) {
          const e = es[i];
          if (e.dead || e.intro > 0 || b.hits.indexOf(e.id) >= 0) continue;
          const rr = e.r + b.r;
          if (NR.dist2(b.x, b.y, e.x, e.y) < rr * rr) {
            const crit = this.rng() < s.crit;
            const dmg = crit ? b.dmg * 2 : b.dmg;
            // Щит танка спереди гасит 65% урона и поглощает снаряд — выгоднее заходить сбоку
            if (e.type === 'tank' && Math.abs(angleDiff(e.face, Math.atan2(b.y - e.y, b.x - e.x))) < 0.95) {
              this.emit('deflect', b.x, b.y);
              this.damageEnemy(e, dmg * 0.35, b.vx, b.vy, false);
              return false;
            }
            this.damageEnemy(e, dmg, b.vx, b.vy, crit);
            if (b.pierce > 0) { b.pierce--; b.hits.push(e.id); }
            else return false;
          }
        }
        return true;
      });

      // Спутники
      if (s.orbs > 0) {
        const orbDmg = 1 + s.damage;
        for (let o = 0; o < s.orbs; o++) {
          const a = p.orbA + (o / s.orbs) * TAU;
          const ox = p.x + Math.cos(a) * 62, oy = p.y + Math.sin(a) * 62;
          for (const e of es) {
            if (e.dead || e.intro > 0 || e.orbCd > 0) continue;
            const rr = e.r + 8;
            if (NR.dist2(ox, oy, e.x, e.y) < rr * rr) {
              e.orbCd = 0.3;
              this.damageEnemy(e, orbDmg, e.x - p.x, e.y - p.y, false);
            }
          }
          this.eb.update(b => {
            const rr = b.r + 8;
            if (NR.dist2(ox, oy, b.x, b.y) < rr * rr) { this.emit('absorb', b.x, b.y); return false; }
            return true;
          });
        }
      }

      // Удаляем убитых
      let w = 0;
      for (let i = 0; i < es.length; i++) if (!es[i].dead) es[w++] = es[i];
      es.length = w;

      // Пули врагов
      // hurtPlayer() меняет этот же пул, поэтому удар обрабатываем после обхода
      const hr = p.r * 0.6;
      let struck = false;
      this.eb.update(b => {
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.life <= 0 || b.x < -20 || b.x > W + 20 || b.y < -20 || b.y > H + 20) return false;
        const rr = b.r + hr;
        if (!struck && NR.dist2(b.x, b.y, p.x, p.y) < rr * rr && p.inv <= 0 && p.dashT <= 0) {
          struck = true;
          return false;
        }
        return true;
      });
      if (struck) this.hurtPlayer();
    }

    damageEnemy(e, dmg, kx, ky, crit) {
      if (e.dead) return;
      e.hp -= dmg;
      e.flash = 0.07;
      if (e.type !== 'boss' && e.type !== 'tank') {
        const kl = Math.hypot(kx, ky) || 1;
        e.vx += (kx / kl) * 45; e.vy += (ky / kl) * 45;
      }
      this.emit('hit', e.x, e.y, { n: dmg, crit, type: e.type });
      if (e.hp <= 0) this.killEnemy(e);
    }

    killEnemy(e) {
      e.dead = true;
      this.kills++;
      this.emit('kill', e.x, e.y, { type: e.type, r: e.r });
      const p = this.player, s = this.stats;

      if (e.type === 'boss') { this.onBossDead(e); return; }
      if (e.type === 'splitter') {
        for (let k = 0; k < 3; k++) {
          const a = (k / 3) * TAU + this.rng();
          const m = this.addEnemy('mini', e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10);
          m.vx = Math.cos(a) * 220; m.vy = Math.sin(a) * 220;
        }
      }
      if (s.killsPerHeal > 0 && p.hp < s.maxHp) {
        p.healKills++;
        if (p.healKills >= s.killsPerHeal) { p.healKills = 0; p.hp++; this.emit('heal', p.x, p.y); }
      }
      if (e.type !== 'mini' && p.hp < s.maxHp && this.rng() < 0.035) {
        this.pickups.push({ x: e.x, y: e.y, life: 10 });
      }
    }

    onBossDead(e) {
      for (const o of this.enemies) {
        if (!o.dead) { o.dead = true; this.emit('kill', o.x, o.y, { type: o.type, r: o.r }); }
      }
      this.spawns.length = 0;
      this.eb.clear();
      this.emit('bossdead', e.x, e.y);
    }

    updatePickups(dt) {
      const p = this.player;
      for (let i = this.pickups.length - 1; i >= 0; i--) {
        const k = this.pickups[i];
        k.life -= dt;
        const dx = p.x - k.x, dy = p.y - k.y, d = Math.hypot(dx, dy) || 1;
        if (d < 110 || this.waveDone) { k.x += (dx / d) * 380 * dt; k.y += (dy / d) * 380 * dt; }
        if (d < p.r + 12) {
          if (p.hp < this.stats.maxHp) p.hp++;
          this.emit('heal', p.x, p.y);
          this.pickups.splice(i, 1);
        } else if (k.life <= 0) this.pickups.splice(i, 1);
      }
    }

    // Для HUD
    waveProgress() {
      if (this.boss) return 1 - Math.max(0, this.boss.hp) / this.boss.maxHp;
      return Math.min(1, this.waveT / this.waveDef.dur);
    }

    // Проверка целостности состояния (используется в тестах)
    validate() {
      const bad = v => !Number.isFinite(v);
      const p = this.player;
      if (bad(p.x) || bad(p.y) || bad(p.vx) || bad(p.vy) || bad(p.hp)) return 'player NaN';
      for (const e of this.enemies) if (bad(e.x) || bad(e.y) || bad(e.hp)) return 'enemy NaN ' + e.type;
      for (const b of this.pb.items) if (bad(b.x) || bad(b.y)) return 'pbullet NaN';
      for (const b of this.eb.items) if (bad(b.x) || bad(b.y)) return 'ebullet NaN';
      return null;
    }
  }

  NR.Game = Game;
})();
