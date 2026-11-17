// Неоновая отрисовка на Canvas 2D: эффекты, HUD и экраны.
var NR = globalThis.NR = globalThis.NR || {};

(function () {
  const W = NR.W, H = NR.H, TAU = NR.TAU, C = NR.COLORS;
  const FONT = '"Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];

  const rnd = (a, b) => a + Math.random() * (b - a);

  class Renderer {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.parts = new NR.Pool(() => ({}), 2000);
      this.reset();
      this.time = 0;
      this.resize();
    }

    reset() {
      if (this.parts) this.parts.clear();
      this.floats = [];
      this.banner = null;
      this.shake = 0;
      this.hitstop = 0;
      this.redFlash = 0;
      this.whiteFlash = 0;
      this.gridPulse = 0;
      this.chargeWarn = 0;
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const cw = window.innerWidth, ch = window.innerHeight;
      this.cv.width = Math.floor(cw * dpr);
      this.cv.height = Math.floor(ch * dpr);
      this.cv.style.width = cw + 'px';
      this.cv.style.height = ch + 'px';
      this.dpr = dpr;
      this.scale = Math.min(this.cv.width / W, this.cv.height / H);
      this.ox = (this.cv.width - W * this.scale) / 2;
      this.oy = (this.cv.height - H * this.scale) / 2;
      this.makeBg();
    }

    toWorld(clientX, clientY) {
      return { x: (clientX * this.dpr - this.ox) / this.scale, y: (clientY * this.dpr - this.oy) / this.scale };
    }

    // Фон рисуется один раз в отдельный canvas
    makeBg() {
      const s = this.scale;
      const bg = document.createElement('canvas');
      bg.width = Math.max(1, Math.ceil(W * s));
      bg.height = Math.max(1, Math.ceil(H * s));
      const g = bg.getContext('2d');
      g.scale(s, s);
      g.fillStyle = '#07040f';
      g.fillRect(0, 0, W, H);
      for (let x = 0; x <= W; x += 40) {
        g.strokeStyle = x % 160 === 0 ? 'rgba(120,70,255,0.22)' : 'rgba(90,60,200,0.10)';
        g.lineWidth = 1;
        g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
      }
      for (let y = 0; y <= H; y += 40) {
        g.strokeStyle = y % 160 === 0 ? 'rgba(120,70,255,0.22)' : 'rgba(90,60,200,0.10)';
        g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
      }
      const vg = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, W * 0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.65)');
      g.fillStyle = vg;
      g.fillRect(0, 0, W, H);
      g.strokeStyle = '#7a4dff';
      g.lineWidth = 3;
      g.shadowColor = '#7a4dff';
      g.shadowBlur = 18 * s;
      g.strokeRect(1.5, 1.5, W - 3, H - 3);
      this.bg = bg;
    }

    // ---------- Частицы ----------
    part(x, y, vx, vy, life, color, size, kind) {
      const p = this.parts.spawn();
      if (!p) return;
      p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life;
      p.color = color; p.size = size; p.kind = kind || 'dot';
    }

    burst(x, y, color, n, speed, life, size) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, sp = speed * rnd(0.25, 1);
        this.part(x, y, Math.cos(a) * sp, Math.sin(a) * sp, life * rnd(0.6, 1.2), color, size * rnd(0.6, 1.3), Math.random() < 0.5 ? 'line' : 'dot');
      }
    }

    ring(x, y, color, radius, life) {
      this.part(x, y, radius, 0, life, color, 3, 'ring');
    }

    float(x, y, text, color, size) {
      if (this.floats.length > 70) this.floats.shift();
      this.floats.push({ x: x + rnd(-8, 8), y, text, color, size, life: 0.8, max: 0.8 });
    }

    setBanner(text, sub, color, dur) {
      this.banner = { text, sub, color: color || '#ffffff', life: dur || 2, max: dur || 2 };
    }

    // ---------- События игры ----------
    consume(ev) {
      const x = ev.x, y = ev.y;
      switch (ev.t) {
        case 'shoot':
          this.part(x, y, Math.cos(ev.a) * 120, Math.sin(ev.a) * 120, 0.08, C.pbullet, 3, 'dot');
          break;
        case 'hit': {
          this.burst(x, y, C[ev.type] || '#fff', 3, 180, 0.25, 2.5);
          const n = ev.n >= 10 ? Math.round(ev.n) : Math.round(ev.n * 10) / 10;
          if (ev.crit) this.float(x, y - 14, n + '!', '#ffff66', 22);
          break;
        }
        case 'kill': {
          const col = C[ev.type] || '#fff';
          const big = ev.type === 'boss';
          this.burst(x, y, col, big ? 160 : 14 + ev.r, big ? 700 : 260 + ev.r * 6, big ? 1.6 : 0.6, big ? 5 : 3);
          this.burst(x, y, '#ffffff', big ? 40 : 4, big ? 500 : 200, 0.3, 2);
          this.ring(x, y, col, ev.r * (big ? 10 : 4), big ? 1 : 0.4);
          this.shake = Math.max(this.shake, ev.r / 5);
          this.gridPulse = Math.min(1, this.gridPulse + ev.r / 60);
          if (ev.type === 'tank') this.hitstop = Math.max(this.hitstop, 0.04);
          break;
        }
        case 'spawn':
          this.ring(x, y, C[ev.type] || '#fff', 40, 0.3);
          break;
        case 'deflect':
          this.burst(x, y, C.shield, 4, 220, 0.2, 2);
          break;
        case 'wallhit':
          this.burst(x, y, C.pbullet, 2, 120, 0.2, 2);
          break;
        case 'ricochet':
          this.burst(x, y, '#ffffff', 5, 200, 0.25, 2);
          break;
        case 'absorb':
          this.burst(x, y, C.orb, 4, 120, 0.2, 2);
          break;
        case 'dash':
          this.ring(x, y, C.player, 50, 0.25);
          break;
        case 'nova':
          this.ring(x, y, '#ffffff', 140, 0.35);
          break;
        case 'hurt':
          this.burst(x, y, C.player, 30, 360, 0.6, 3);
          this.ring(x, y, '#ff3366', 170, 0.4);
          this.shake = 14; this.redFlash = 0.6; this.hitstop = 0.09;
          break;
        case 'shieldbreak':
          this.burst(x, y, C.shield, 24, 300, 0.5, 3);
          this.ring(x, y, C.shield, 150, 0.4);
          this.shake = 8; this.hitstop = 0.05;
          this.float(x, y - 24, 'ЩИТ', C.shield, 16);
          break;
        case 'shieldup':
          this.ring(x, y, C.shield, 40, 0.4);
          break;
        case 'heal':
          this.burst(x, y, C.heart, 16, 160, 0.6, 3);
          this.float(x, y - 24, '+1', C.heart, 20);
          break;
        case 'wave':
          this.setBanner('ВОЛНА ' + ev.n, 'из ' + NR.WAVES.length, '#c9a8ff', 2.2);
          break;
        case 'waveclear':
          this.setBanner('ВОЛНА ЗАЧИЩЕНА', '', '#66ffcc', 1.4);
          this.gridPulse = 1;
          break;
        case 'upgrade':
          this.ring(x, y, '#ffffff', 120, 0.5);
          break;
        case 'boss':
          this.setBanner('СТРАЖ РАЗЛОМА', 'финальная битва', C.boss, 3);
          this.shake = 12;
          break;
        case 'bossphase':
          this.setBanner('ФАЗА ' + ev.n, ev.n === 2 ? 'он зовёт подмогу' : 'берегись тарана', C.boss, 1.8);
          this.whiteFlash = 0.5; this.shake = 16; this.hitstop = 0.15;
          this.ring(x, y, C.boss, 400, 0.6);
          break;
        case 'chargewarn':
          this.chargeWarn = 0.85;
          break;
        case 'slam':
          this.ring(x, y, C.boss, 260, 0.5);
          this.burst(x, y, C.boss, 30, 400, 0.5, 3);
          this.shake = 16;
          break;
        case 'burst':
          this.ring(x, y, C.boss, 90, 0.3);
          break;
        case 'bossdead':
          this.whiteFlash = 1; this.hitstop = 0.35; this.shake = 30; this.gridPulse = 1;
          for (let i = 0; i < 4; i++) this.ring(x, y, i % 2 ? '#ffffff' : C.boss, 300 + i * 200, 1 + i * 0.3);
          break;
        case 'death':
          this.burst(x, y, C.player, 120, 600, 1.4, 4);
          this.burst(x, y, '#ffffff', 40, 400, 0.8, 3);
          this.ring(x, y, C.player, 500, 1);
          this.shake = 24; this.hitstop = 0.25; this.redFlash = 1;
          break;
      }
    }

    update(dt) {
      this.time += dt;
      this.hitstop = Math.max(0, this.hitstop - dt);
      this.shake = Math.max(0, this.shake - dt * 45);
      this.redFlash = Math.max(0, this.redFlash - dt * 1.8);
      this.whiteFlash = Math.max(0, this.whiteFlash - dt * 2.2);
      this.gridPulse = Math.max(0, this.gridPulse - dt * 1.6);
      this.chargeWarn = Math.max(0, this.chargeWarn - dt);
      const damp = Math.exp(-dt * 4);
      this.parts.update(p => {
        p.life -= dt;
        if (p.life <= 0) return false;
        if (p.kind !== 'ring') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= damp; p.vy *= damp; }
        return true;
      });
      for (let i = this.floats.length - 1; i >= 0; i--) {
        const f = this.floats[i];
        f.life -= dt; f.y -= 40 * dt;
        if (f.life <= 0) this.floats.splice(i, 1);
      }
      if (this.banner) { this.banner.life -= dt; if (this.banner.life <= 0) this.banner = null; }
    }

    // ---------- Примитивы ----------
    glow(color, blur) {
      const c = this.ctx;
      c.shadowColor = color;
      c.shadowBlur = blur * this.scale;
    }
    noGlow() { this.ctx.shadowBlur = 0; }

    poly(n, r, rot) {
      const c = this.ctx;
      c.beginPath();
      for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * TAU;
        if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath();
    }

    text(str, x, y, size, color, align, glowPx, weight) {
      const c = this.ctx;
      c.font = `${weight || 700} ${size}px ${FONT}`;
      c.textAlign = align || 'center';
      c.textBaseline = 'middle';
      if (glowPx) this.glow(color, glowPx);
      c.fillStyle = color;
      c.fillText(str, x, y);
      if (glowPx) this.noGlow();
    }

    wrap(str, maxW, size) {
      const c = this.ctx;
      c.font = `500 ${size}px ${FONT}`;
      const words = str.split(' '), lines = [];
      let line = '';
      for (const w of words) {
        const t = line ? line + ' ' + w : w;
        if (c.measureText(t).width > maxW && line) { lines.push(line); line = w; }
        else line = t;
      }
      if (line) lines.push(line);
      return lines;
    }

    // ---------- Кадр ----------
    draw(game, ui) {
      const c = this.ctx, s = this.scale;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#000';
      c.fillRect(0, 0, this.cv.width, this.cv.height);

      const sx = this.shake ? rnd(-1, 1) * this.shake : 0;
      const sy = this.shake ? rnd(-1, 1) * this.shake : 0;
      c.setTransform(s, 0, 0, s, this.ox + sx * s, this.oy + sy * s);
      c.drawImage(this.bg, 0, 0, W, H);
      if (this.gridPulse > 0) {
        c.globalCompositeOperation = 'lighter';
        c.globalAlpha = this.gridPulse * 0.6;
        c.drawImage(this.bg, 0, 0, W, H);
        c.globalAlpha = 1;
        c.globalCompositeOperation = 'source-over';
      }

      if (ui.scene === 'menu') {
        this.drawParticles();
        c.setTransform(s, 0, 0, s, this.ox, this.oy);
        this.drawMenu(ui);
      } else {
        this.drawWorld(game, ui);
        this.drawParticles();
        this.drawFloats();
        c.setTransform(s, 0, 0, s, this.ox, this.oy);
        if (this.redFlash > 0) {
          c.fillStyle = `rgba(255,0,70,${this.redFlash * 0.25})`;
          c.fillRect(0, 0, W, H);
        }
        if (this.whiteFlash > 0) {
          c.fillStyle = `rgba(255,255,255,${this.whiteFlash * 0.6})`;
          c.fillRect(0, 0, W, H);
        }
        this.drawHud(game, ui);
        this.drawBanner();
        if (game.state === 'upgrade') this.drawUpgrades(game, ui);
        else if (game.state === 'dead' && ui.endT > 1.2) this.drawEnd(game, ui, false);
        else if (game.state === 'win' && ui.endT > 0.3) this.drawEnd(game, ui, true);
        if (ui.paused) this.drawPause(ui);
      }
      this.drawCursor(ui);
    }

    drawWorld(g, ui) {
      const c = this.ctx, t = this.time, p = g.player;

      // Маркеры появления
      for (const sp of g.spawns) {
        const k = sp.t / sp.max, col = C[sp.type];
        c.globalAlpha = 1 - k * 0.6;
        c.strokeStyle = col; c.lineWidth = 2;
        c.beginPath(); c.arc(sp.x, sp.y, NR.TYPES[sp.type].r * (1 + k * 2.5), 0, TAU); c.stroke();
        c.beginPath(); c.arc(sp.x, sp.y, 3, 0, TAU); c.fillStyle = col; c.fill();
      }
      c.globalAlpha = 1;

      // Аптечки
      for (const k of g.pickups) {
        const pulse = 1 + Math.sin(t * 8) * 0.15;
        if (k.life < 3 && Math.floor(t * 8) % 2) continue;
        c.save(); c.translate(k.x, k.y); c.scale(pulse, pulse);
        this.glow(C.heart, 14);
        c.strokeStyle = C.heart; c.lineWidth = 3;
        c.beginPath(); c.moveTo(-7, 0); c.lineTo(7, 0); c.moveTo(0, -7); c.lineTo(0, 7); c.stroke();
        this.poly(4, 12, Math.PI / 4); c.lineWidth = 1.5; c.stroke();
        c.restore();
      }
      this.noGlow();

      // Предупреждение о таране босса
      const boss = g.boss;
      if (boss && !boss.dead && boss.mode === 'tele') {
        const a = boss.chargeA, k = 1 - boss.modeT / 0.85;
        c.save();
        c.globalAlpha = 0.25 + 0.5 * k;
        c.strokeStyle = C.boss; c.lineWidth = boss.r * 2 * (0.3 + 0.7 * k);
        c.beginPath(); c.moveTo(boss.x, boss.y); c.lineTo(boss.x + Math.cos(a) * 1600, boss.y + Math.sin(a) * 1600); c.stroke();
        c.restore();
      }

      // Враги
      for (const e of g.enemies) this.drawEnemy(e, p);
      this.noGlow();

      // Пули (аддитивно, без shadowBlur — дешевле)
      c.globalCompositeOperation = 'lighter';
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(80,220,255,0.35)'; c.lineWidth = 8;
      c.beginPath();
      for (const b of g.pb.items) { c.moveTo(b.x - b.vx * 0.025, b.y - b.vy * 0.025); c.lineTo(b.x, b.y); }
      c.stroke();
      c.strokeStyle = '#e6ffff'; c.lineWidth = 3;
      c.beginPath();
      for (const b of g.pb.items) { c.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02); c.lineTo(b.x, b.y); }
      c.stroke();

      c.fillStyle = 'rgba(255,60,140,0.35)';
      c.beginPath();
      for (const b of g.eb.items) { c.moveTo(b.x + b.r * 2.2, b.y); c.arc(b.x, b.y, b.r * 2.2, 0, TAU); }
      c.fill();
      c.fillStyle = '#ffd0e6';
      c.beginPath();
      for (const b of g.eb.items) { c.moveTo(b.x + b.r, b.y); c.arc(b.x, b.y, b.r, 0, TAU); }
      c.fill();
      c.globalCompositeOperation = 'source-over';
      c.lineCap = 'butt';

      if (g.state !== 'dead') this.drawPlayer(g, ui);
    }

    drawEnemy(e, p) {
      const c = this.ctx, t = this.time;
      const col = e.flash > 0 ? '#ffffff' : (e.type === 'boss' ? this.bossColor(e) : C[e.type]);
      c.save();
      c.translate(e.x, e.y);
      this.glow(col, e.type === 'boss' ? 30 : 14);
      c.strokeStyle = col;
      c.fillStyle = col + '26';
      c.lineWidth = 2.5;
      const head = Math.atan2(e.vy, e.vx);

      switch (e.type) {
        case 'chaser':
        case 'mini': {
          c.rotate(head);
          const r = e.r * 1.25;
          c.beginPath(); c.moveTo(r, 0); c.lineTo(-r * 0.8, r * 0.75); c.lineTo(-r * 0.4, 0); c.lineTo(-r * 0.8, -r * 0.75); c.closePath();
          c.fill(); c.stroke();
          break;
        }
        case 'shooter': {
          this.poly(4, e.r * 1.2, t * 1.5 + e.id); c.fill(); c.stroke();
          this.poly(4, e.r * 0.55, -t * 2); c.stroke();
          if (e.fireT < 0.4) {
            c.fillStyle = '#ffffff';
            c.beginPath(); c.arc(0, 0, 3 + (0.4 - e.fireT) * 18, 0, TAU); c.fill();
          }
          break;
        }
        case 'splitter': {
          this.poly(6, e.r * 1.1, t * 2 + e.id); c.fill(); c.stroke();
          this.poly(6, e.r * 0.5, -t * 3); c.stroke();
          break;
        }
        case 'tank': {
          c.rotate(e.face);
          this.poly(8, e.r, Math.PI / 8); c.fill(); c.stroke();
          this.poly(8, e.r * 0.55, Math.PI / 8 + t); c.stroke();
          this.glow(C.shield, 18);
          c.strokeStyle = C.shield; c.lineWidth = 5;
          c.beginPath(); c.arc(0, 0, e.r + 8, -0.95, 0.95); c.stroke();
          break;
        }
        case 'boss':
          this.drawBoss(e, col);
          break;
      }
      c.restore();

      // Полоска здоровья у крепких врагов
      if ((e.type === 'tank' || e.type === 'splitter') && e.hp < e.maxHp) {
        this.noGlow();
        const w = e.r * 2;
        c.fillStyle = 'rgba(255,255,255,0.15)';
        c.fillRect(e.x - w / 2, e.y + e.r + 10, w, 3);
        c.fillStyle = C[e.type];
        c.fillRect(e.x - w / 2, e.y + e.r + 10, w * Math.max(0, e.hp / e.maxHp), 3);
      }
    }

    bossColor(e) {
      return e.phase === 3 ? '#ff2299' : e.phase === 2 ? '#ff6633' : C.boss;
    }

    drawBoss(e, col) {
      const c = this.ctx, t = this.time;
      if (e.intro > 0) c.globalAlpha = 1 - e.intro / 2.2 * 0.7;
      const pulse = 1 + Math.sin(t * (e.phase === 3 ? 12 : 5)) * 0.06;
      // Внешняя звезда
      c.lineWidth = 3;
      c.beginPath();
      const n = 8, rot = t * 0.6;
      for (let i = 0; i < n * 2; i++) {
        const r = i % 2 ? e.r * 0.8 : e.r * 1.25;
        const a = rot + (i / (n * 2)) * TAU;
        if (i === 0) c.moveTo(Math.cos(a) * r, Math.sin(a) * r); else c.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      c.closePath(); c.fill(); c.stroke();
      this.poly(6, e.r * 0.65, -t * 1.2); c.stroke();
      // Ядро
      c.fillStyle = '#ffffff';
      this.glow(col, 40);
      c.beginPath(); c.arc(0, 0, e.r * 0.25 * pulse, 0, TAU); c.fill();
      c.globalAlpha = 1;
    }

    drawPlayer(g, ui) {
      const c = this.ctx, p = g.player, s = g.stats, t = this.time;

      // Спутники
      if (s.orbs > 0) {
        this.glow(C.orb, 16);
        c.fillStyle = '#e6ffff';
        for (let o = 0; o < s.orbs; o++) {
          const a = p.orbA + (o / s.orbs) * TAU;
          c.beginPath(); c.arc(p.x + Math.cos(a) * 62, p.y + Math.sin(a) * 62, 7, 0, TAU); c.fill();
        }
        this.noGlow();
      }

      // След от рывка и выхлоп (только во время игры, не на паузе)
      if (!ui.paused && g.state === 'play') {
        if (p.dashT > 0) this.part(p.x, p.y, 0, 0, 0.25, C.player, 10, 'ghost');
        else if (Math.hypot(p.vx, p.vy) > 60 && Math.random() < 0.6) {
          const a = Math.atan2(p.vy, p.vx) + Math.PI + rnd(-0.4, 0.4);
          this.part(p.x + Math.cos(a) * 8, p.y + Math.sin(a) * 8, Math.cos(a) * 120, Math.sin(a) * 120, 0.3, '#3388ff', 2.5, 'dot');
        }
      }

      if (p.inv > 0 && Math.floor(t * 20) % 2) return;

      c.save();
      c.translate(p.x, p.y);
      if (p.shield) {
        this.glow(C.shield, 16);
        c.strokeStyle = 'rgba(190,255,255,0.7)'; c.lineWidth = 2;
        this.poly(6, 22, t); c.stroke();
      }
      c.rotate(p.aim);
      this.glow(C.player, 20);
      c.strokeStyle = C.player; c.fillStyle = 'rgba(51,255,255,0.18)'; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(17, 0); c.lineTo(-11, 10); c.lineTo(-5, 0); c.lineTo(-11, -10); c.closePath();
      c.fill(); c.stroke();
      c.fillStyle = '#ffffff';
      c.beginPath(); c.arc(0, 0, 3, 0, TAU); c.fill();
      c.restore();
      this.noGlow();

      // Перезарядка рывка — дуга под кораблём
      if (p.dashCd > 0) {
        c.strokeStyle = 'rgba(51,255,255,0.5)'; c.lineWidth = 2;
        c.beginPath(); c.arc(p.x, p.y, 28, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.dashCd / s.dashCd)); c.stroke();
      }
    }

    drawParticles() {
      const c = this.ctx;
      c.globalCompositeOperation = 'lighter';
      for (const p of this.parts.items) {
        const k = p.life / p.max;
        c.globalAlpha = k;
        if (p.kind === 'dot') {
          c.fillStyle = p.color;
          const sz = p.size * (0.5 + k * 0.5);
          c.fillRect(p.x - sz / 2, p.y - sz / 2, sz, sz);
        } else if (p.kind === 'line') {
          c.strokeStyle = p.color; c.lineWidth = p.size * 0.7;
          c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); c.stroke();
        } else if (p.kind === 'ring') {
          c.strokeStyle = p.color; c.lineWidth = 3 * k + 0.5;
          c.beginPath(); c.arc(p.x, p.y, p.vx * (1 - k) + 4, 0, TAU); c.stroke();
        } else if (p.kind === 'ghost') {
          c.globalAlpha = k * 0.5;
          c.fillStyle = p.color;
          c.beginPath(); c.arc(p.x, p.y, p.size, 0, TAU); c.fill();
        }
      }
      c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
    }

    drawFloats() {
      const c = this.ctx;
      for (const f of this.floats) {
        c.globalAlpha = Math.min(1, f.life / f.max * 2);
        this.text(f.text, f.x, f.y, f.size, f.color, 'center', 0);
      }
      c.globalAlpha = 1;
    }

    // ---------- HUD ----------
    drawHud(g, ui) {
      const c = this.ctx, p = g.player, s = g.stats;
      // Здоровье
      for (let i = 0; i < s.maxHp; i++) {
        const x = 34 + i * 30, y = 34, full = i < p.hp;
        c.save(); c.translate(x, y);
        this.poly(4, 11, 0);
        if (full) { this.glow(C.player, 14); c.fillStyle = C.player; c.fill(); }
        else { c.strokeStyle = 'rgba(51,255,255,0.35)'; c.lineWidth = 2; c.stroke(); }
        c.restore();
      }
      this.noGlow();
      let y2 = 64;
      if (s.shieldCd > 0) {
        const k = p.shield ? 1 : 1 - Math.max(0, p.shieldT) / s.shieldCd;
        this.text('ЩИТ', 22, y2, 13, p.shield ? C.shield : 'rgba(190,255,255,0.4)', 'left', p.shield ? 8 : 0);
        c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(82, y2 - 3, 58, 6);
        c.fillStyle = C.shield; c.fillRect(82, y2 - 3, 58 * k, 6);
        y2 += 20;
      }
      const dk = 1 - p.dashCd / s.dashCd;
      this.text('РЫВОК', 22, y2, 13, dk >= 1 ? C.player : 'rgba(51,255,255,0.4)', 'left', 0);
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(82, y2 - 3, 58, 6);
      c.fillStyle = C.player; c.fillRect(82, y2 - 3, 58 * dk, 6);

      // Центр: волна или босс
      if (g.boss) {
        const e = g.boss, w = 560, x = W / 2 - w / 2;
        this.text('СТРАЖ РАЗЛОМА', W / 2, 24, 16, C.boss, 'center', 10);
        c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(x, 40, w, 10);
        this.glow(C.boss, 12);
        c.fillStyle = this.bossColor(e); c.fillRect(x, 40, w * Math.max(0, e.hp / e.maxHp), 10);
        this.noGlow();
        c.fillStyle = 'rgba(255,255,255,0.5)';
        c.fillRect(x + w * 0.33, 38, 2, 14); c.fillRect(x + w * 0.66, 38, 2, 14);
      } else {
        const w = 280, x = W / 2 - w / 2;
        const left = g.waveT >= g.waveDef.dur && !g.waveDone;
        this.text(`ВОЛНА ${g.wave} / ${NR.WAVES.length}`, W / 2, 24, 16, '#c9a8ff', 'center', 8);
        c.fillStyle = 'rgba(255,255,255,0.1)'; c.fillRect(x, 40, w, 6);
        c.fillStyle = '#a07aff'; c.fillRect(x, 40, w * g.waveProgress(), 6);
        if (left) this.text(`Добейте врагов: ${g.enemies.length + g.spawns.length}`, W / 2, 62, 13, '#ffffff', 'center', 0, 500);
      }

      // Справа: время и убийства
      this.text(fmtTime(g.time), W - 22, 26, 20, '#ffffff', 'right', 6);
      this.text(`убито: ${g.kills}`, W - 22, 50, 13, 'rgba(255,255,255,0.7)', 'right', 0, 500);
      if (ui.muted) this.text('звук выкл (M)', W - 22, 70, 12, 'rgba(255,255,255,0.4)', 'right', 0, 500);

      // Внизу слева: полученные улучшения
      let ux = 18;
      const counts = {};
      for (const id of g.taken) counts[id] = (counts[id] || 0) + 1;
      c.font = `600 12px ${FONT}`;
      for (const id in counts) {
        const u = NR.UPGRADES.find(x => x.id === id);
        const label = u.name + (counts[id] > 1 ? ' ' + ROMAN[counts[id]] : '');
        const tw = c.measureText(label).width + 16;
        c.strokeStyle = 'rgba(160,122,255,0.5)'; c.lineWidth = 1;
        c.strokeRect(ux, H - 32, tw, 20);
        this.text(label, ux + tw / 2, H - 22, 12, 'rgba(220,200,255,0.85)', 'center', 0, 600);
        ux += tw + 6;
      }
    }

    drawBanner() {
      const b = this.banner;
      if (!b) return;
      const k = b.life / b.max, c = this.ctx;
      const a = Math.min(1, (1 - k) * 6, k * 3);
      c.globalAlpha = a;
      const sc = 1 + (1 - Math.min(1, (1 - k) * 5)) * 0.3;
      c.save(); c.translate(W / 2, H * 0.32); c.scale(sc, sc);
      this.text(b.text, 0, 0, 56, b.color, 'center', 24, 800);
      if (b.sub) this.text(b.sub, 0, 44, 18, 'rgba(255,255,255,0.75)', 'center', 0, 500);
      c.restore();
      c.globalAlpha = 1;
    }

    cardRects() {
      const w = 300, h = 210, gap = 30, x0 = W / 2 - (w * 3 + gap * 2) / 2, y = H / 2 - h / 2 + 20;
      return [0, 1, 2].map(i => ({ x: x0 + i * (w + gap), y, w, h }));
    }

    cardAt(x, y) {
      const rs = this.cardRects();
      for (let i = 0; i < rs.length; i++) {
        const r = rs[i];
        if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
      }
      return -1;
    }

    drawUpgrades(g, ui) {
      const c = this.ctx;
      c.fillStyle = 'rgba(5,2,15,0.72)';
      c.fillRect(0, 0, W, H);
      this.text('ВЫБЕРИТЕ УЛУЧШЕНИЕ', W / 2, H / 2 - 150, 34, '#ffffff', 'center', 18, 800);
      this.text(`перед волной ${g.wave + 1 > NR.WAVES.length ? 'с боссом' : g.wave + 1}`, W / 2, H / 2 - 115, 15, 'rgba(255,255,255,0.6)', 'center', 0, 500);
      const rs = this.cardRects();
      (g.choices || []).forEach((u, i) => {
        const r = rs[i], hov = ui.hover === i;
        const lift = hov ? -6 : 0;
        c.save(); c.translate(0, lift);
        c.fillStyle = hov ? 'rgba(120,80,255,0.22)' : 'rgba(60,40,140,0.25)';
        c.fillRect(r.x, r.y, r.w, r.h);
        if (hov) this.glow('#a07aff', 22);
        c.strokeStyle = hov ? '#d6c4ff' : '#7a4dff'; c.lineWidth = hov ? 2.5 : 1.5;
        c.strokeRect(r.x, r.y, r.w, r.h);
        this.noGlow();
        this.text(String(i + 1), r.x + 22, r.y + 24, 16, 'rgba(255,255,255,0.45)', 'center', 0);
        this.text(u.name, r.x + r.w / 2, r.y + 52, 22, '#ffffff', 'center', hov ? 10 : 0, 800);
        const lines = this.wrap(u.desc, r.w - 40, 15);
        lines.forEach((ln, j) => this.text(ln, r.x + r.w / 2, r.y + 96 + j * 22, 15, 'rgba(230,220,255,0.85)', 'center', 0, 500));
        // уровни
        const pw = 16, total = u.max * pw + (u.max - 1) * 6, px = r.x + r.w / 2 - total / 2;
        for (let k = 0; k < u.max; k++) {
          c.fillStyle = k < u.lvl ? '#a07aff' : k === u.lvl ? '#ffffff' : 'rgba(255,255,255,0.15)';
          c.fillRect(px + k * (pw + 6), r.y + r.h - 28, pw, 6);
        }
        c.restore();
      });
      this.text('клик по карточке или клавиши 1 / 2 / 3', W / 2, H / 2 + 160, 14, 'rgba(255,255,255,0.5)', 'center', 0, 500);
    }

    drawPause(ui) {
      const c = this.ctx;
      c.fillStyle = 'rgba(5,2,15,0.7)';
      c.fillRect(0, 0, W, H);
      this.text('ПАУЗА', W / 2, H / 2 - 30, 56, '#ffffff', 'center', 20, 800);
      this.text('Esc — продолжить   ·   M — звук   ·   Q — в меню', W / 2, H / 2 + 30, 16, 'rgba(255,255,255,0.7)', 'center', 0, 500);
    }

    drawEnd(g, ui, win) {
      const c = this.ctx;
      const a = Math.min(1, (ui.endT - (win ? 0.3 : 1.2)) * 2);
      c.globalAlpha = a;
      c.fillStyle = 'rgba(5,2,15,0.78)';
      c.fillRect(0, 0, W, H);
      const col = win ? '#66ffcc' : '#ff3366';
      this.text(win ? 'РАЗЛОМ ЗАКРЫТ' : 'СИГНАЛ ПОТЕРЯН', W / 2, H / 2 - 120, 60, col, 'center', 26, 800);
      this.text(win ? 'Страж повержен. Победа!' : `Вы продержались до волны ${g.wave > NR.WAVES.length ? 'с боссом' : g.wave}`, W / 2, H / 2 - 66, 18, 'rgba(255,255,255,0.8)', 'center', 0, 500);
      const rows = [
        ['Время', fmtTime(g.time)],
        ['Убито врагов', String(g.kills)],
        ['Получено ударов', String(g.hitsTaken)],
        ['Улучшений', String(g.taken.length)],
      ];
      rows.forEach((r, i) => {
        this.text(r[0], W / 2 - 20, H / 2 - 10 + i * 30, 17, 'rgba(255,255,255,0.6)', 'right', 0, 500);
        this.text(r[1], W / 2 + 20, H / 2 - 10 + i * 30, 17, '#ffffff', 'left', 0, 700);
      });
      const b = ui.best || {};
      let rec = '';
      if (b.bestTime) rec = `Лучшая победа: ${fmtTime(b.bestTime)}   ·   побед: ${b.wins || 0}`;
      else if (b.bestWave) rec = `Рекорд: волна ${b.bestWave > NR.WAVES.length ? 'с боссом' : b.bestWave}`;
      if (ui.newRecord) this.text('НОВЫЙ РЕКОРД!', W / 2, H / 2 + 120, 20, '#ffff66', 'center', 14, 800);
      if (rec) this.text(rec, W / 2, H / 2 + 150, 14, 'rgba(255,255,255,0.55)', 'center', 0, 500);
      if (Math.floor(this.time * 2) % 2 === 0) this.text('Enter или клик — ещё раз   ·   Q — в меню', W / 2, H / 2 + 200, 17, '#ffffff', 'center', 8, 600);
      c.globalAlpha = 1;
    }

    drawMenu(ui) {
      const c = this.ctx, t = this.time;
      // Декоративные фигуры
      const shapes = [['chaser', 3], ['shooter', 4], ['splitter', 6], ['tank', 8]];
      for (let i = 0; i < 12; i++) {
        const [type, n] = shapes[i % 4];
        const x = (i * 211 + t * (20 + i * 3)) % (W + 100) - 50;
        const y = 90 + ((i * 137) % (H - 180));
        c.save(); c.translate(x, y);
        c.globalAlpha = 0.35;
        this.glow(C[type], 12);
        c.strokeStyle = C[type]; c.lineWidth = 2;
        this.poly(n, 14 + (i % 3) * 5, t * (i % 2 ? 1 : -1) + i); c.stroke();
        c.restore();
      }
      this.noGlow();
      c.globalAlpha = 1;
      if (Math.random() < 0.3) this.part(rnd(0, W), H + 5, 0, -rnd(30, 90), 4, Math.random() < 0.5 ? C.player : '#a07aff', 2, 'dot');

      const flick = Math.random() < 0.03 ? 0.5 : 1;
      c.globalAlpha = flick;
      this.text('NEON RIFT', W / 2, 170, 96, C.player, 'center', 36, 900);
      c.globalAlpha = 1;
      this.text('неоновый рогалик  ·  8 волн и босс  ·  около 5 минут', W / 2, 235, 18, 'rgba(220,200,255,0.8)', 'center', 0, 500);

      const ctrl = [
        ['WASD / стрелки', 'движение'],
        ['Мышь', 'прицел (огонь автоматический)'],
        ['Пробел / Shift / ПКМ', 'рывок — неуязвимость на миг'],
        ['Esc', 'пауза'],
        ['M', 'звук вкл/выкл'],
      ];
      ctrl.forEach((r, i) => {
        this.text(r[0], W / 2 - 16, 310 + i * 30, 17, C.player, 'right', 0, 700);
        this.text(r[1], W / 2 + 16, 310 + i * 30, 17, 'rgba(255,255,255,0.8)', 'left', 0, 500);
      });
      this.text('Совет: щит танка спереди гасит урон — заходите сбоку.', W / 2, 480, 14, 'rgba(255,255,255,0.5)', 'center', 0, 500);

      const b = ui.best || {};
      if (b.bestTime) this.text(`Лучшая победа: ${fmtTime(b.bestTime)}  ·  побед: ${b.wins || 0}`, W / 2, 520, 15, '#ffff99', 'center', 0, 600);
      else if (b.bestWave) this.text(`Рекорд: волна ${b.bestWave > NR.WAVES.length ? 'с боссом' : b.bestWave}`, W / 2, 520, 15, '#ffff99', 'center', 0, 600);

      const pulse = 0.6 + Math.sin(t * 4) * 0.4;
      c.globalAlpha = pulse;
      this.text('КЛИК ИЛИ ENTER — НАЧАТЬ', W / 2, 590, 24, '#ffffff', 'center', 16, 800);
      c.globalAlpha = 1;
    }

    drawCursor(ui) {
      if (!ui.mouse) return;
      const c = this.ctx, m = ui.mouse;
      c.setTransform(this.scale, 0, 0, this.scale, this.ox, this.oy);
      this.glow(C.player, 8);
      c.strokeStyle = '#ffffff'; c.lineWidth = 1.5;
      c.beginPath();
      c.arc(m.x, m.y, 9, 0, TAU);
      c.moveTo(m.x - 15, m.y); c.lineTo(m.x - 5, m.y);
      c.moveTo(m.x + 5, m.y); c.lineTo(m.x + 15, m.y);
      c.moveTo(m.x, m.y - 15); c.lineTo(m.x, m.y - 5);
      c.moveTo(m.x, m.y + 5); c.lineTo(m.x, m.y + 15);
      c.stroke();
      this.noGlow();
    }
  }

  function fmtTime(s) {
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  }

  NR.Renderer = Renderer;
  NR.fmtTime = fmtTime;
})();
