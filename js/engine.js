// Общие утилиты: работают и в браузере, и в Node (для симуляции).
var NR = globalThis.NR = globalThis.NR || {};

(function () {
  NR.W = 1280; // логический размер арены
  NR.H = 720;
  NR.TAU = Math.PI * 2;

  // Детерминированный ГПСЧ (mulberry32): одинаковый seed — одинаковый забег.
  NR.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  NR.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  NR.lerp = (a, b, t) => a + (b - a) * t;
  NR.dist2 = (ax, ay, bx, by) => {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  // Кратчайшая разница углов в диапазоне [-PI, PI]
  NR.angleDiff = (a, b) => {
    let d = (b - a) % NR.TAU;
    if (d > Math.PI) d -= NR.TAU;
    if (d < -Math.PI) d += NR.TAU;
    return d;
  };

  // Пул объектов: переиспользует объекты, чтобы не нагружать сборщик мусора.
  NR.Pool = class {
    constructor(factory, max) {
      this.factory = factory;
      this.max = max || Infinity;
      this.items = [];
      this.free = [];
    }
    spawn() {
      if (this.items.length >= this.max) return null;
      const o = this.free.pop() || this.factory();
      this.items.push(o);
      return o;
    }
    // fn возвращает false — объект удаляется (swap-remove, порядок не сохраняется)
    update(fn) {
      const it = this.items;
      let i = 0;
      while (i < it.length) {
        if (fn(it[i]) === false) {
          this.free.push(it[i]);
          it[i] = it[it.length - 1];
          it.pop();
        } else i++;
      }
    }
    clear() {
      for (const o of this.items) this.free.push(o);
      this.items.length = 0;
    }
  };
})();
