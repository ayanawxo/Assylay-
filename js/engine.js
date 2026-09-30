/*
 * Игровой движок «Канат» — чистая логика без DOM.
 * Работает с фиксированным шагом времени (tick(dt)), поэтому скорость игры
 * не зависит от частоты кадров. Все действия игроков проходят через act()/setBrace()
 * и проверяются внутри движка: до старта и после финиша они игнорируются,
 * частота рывков ограничена, выносливость нельзя «обойти» частыми нажатиями.
 */
(function (root) {
  'use strict';

  var DEFAULTS = {
    matchDuration: 60,      // длительность основного времени, с
    overtimeDuration: 20,   // длительность овертайма, с
    winBoundary: 100,       // граница победы (|pos| >= 100)
    overtimeBoundary: 40,   // граница победы в овертайме
    tieMargin: 3,           // если |pos| < tieMargin по истечении времени -> овертайм
    drawMargin: 1,          // если |pos| < drawMargin в конце овертайма -> ничья
    countdown: 3,           // обратный отсчёт перед стартом, с

    pullPower: 22,          // импульс одного тяга
    pullCost: 7,            // расход выносливости за тяг
    pullMinInterval: 0.15,  // минимальный интервал между тягами, с (≈6.6 тягов/с)

    surgePower: 70,         // импульс рывка
    surgeCost: 35,          // расход выносливости за рывок
    surgeCooldown: 4,       // перезарядка рывка, с

    regenIdle: 9,           // восстановление/с, если не тянул idleDelay секунд
    regenPulling: 2,        // восстановление/с во время активной тяги
    regenBrace: 28,         // восстановление/с в упоре
    idleDelay: 0.6,

    braceDamping: 0.45,     // множитель входящей силы для того, кто в упоре
    exhaustThreshold: 20,   // выход из истощения при stamina >= threshold
    exhaustPower: 0.3,      // множитель силы в истощении

    beatPeriod: 1.2,        // период ритма, с
    beatWindow: 0.11,       // окно попадания в ритм (± с)
    beatBonus: 1.6,         // множитель силы при попадании в ритм

    friction: 3.2,          // затухание скорости каната
    training: false         // режим тренировки: нет победы по границе
  };

  var DIR = { L: -1, R: 1 };
  var OTHER = { L: 'R', R: 'L' };

  function makeSide() {
    return {
      stamina: 100,
      bracing: false,
      exhausted: false,
      lastPullAt: -10,
      surgeReadyAt: 0,
      pulls: 0,
      beatHits: 0,
      surges: 0,
      exhaustedTime: 0,
      braceTime: 0,
      lastAction: null
    };
  }

  function TugOfWar(opts) {
    this.cfg = Object.assign({}, DEFAULTS, opts || {});
    this.reset();
  }

  TugOfWar.DEFAULTS = DEFAULTS;
  TugOfWar.DIR = DIR;
  TugOfWar.OTHER = OTHER;

  TugOfWar.prototype.reset = function () {
    this.phase = 'idle';       // idle | countdown | playing | overtime | finished
    this.time = 0;
    this.pos = 0;              // -100..100, отрицательное — преимущество левой стороны
    this.vel = 0;
    this.countdownLeft = 0;
    this.overtimeLeft = 0;
    this.sides = { L: makeSide(), R: makeSide() };
    this.queue = [];
    this.events = [];
    this.winner = null;        // 'L' | 'R' | null
    this.reason = null;        // boundary | time | overtime | draw | training
    this.tickCount = 0;
    this.maxLead = { L: 0, R: 0 };
  };

  TugOfWar.prototype.emit = function (ev) { this.events.push(ev); };

  TugOfWar.prototype.isActive = function () {
    return this.phase === 'playing' || this.phase === 'overtime';
  };

  TugOfWar.prototype.start = function () {
    if (this.phase !== 'idle') return false;
    this.phase = 'countdown';
    this.countdownLeft = this.cfg.countdown;
    this.queue = [];
    this.emit({ type: 'countdown', n: this.cfg.countdown });
    return true;
  };

  /** Поставить действие в очередь. Возвращает false, если сейчас действия не принимаются. */
  TugOfWar.prototype.act = function (side, type) {
    if (!DIR[side]) return false;
    if (!this.isActive()) return false;
    if (type !== 'pull' && type !== 'surge') return false;
    this.queue.push({ side: side, type: type });
    return true;
  };

  /** Включить/выключить упор. Пока сторона в упоре, она не может тянуть. */
  TugOfWar.prototype.setBrace = function (side, on) {
    var s = this.sides[side];
    if (!s) return false;
    if (!this.isActive()) { s.bracing = false; return false; }
    s.bracing = !!on;
    return true;
  };

  TugOfWar.prototype.timeLeft = function () {
    if (this.phase === 'overtime') return Math.max(0, this.overtimeLeft);
    if (this.phase === 'finished' && this.reason !== 'boundary') return 0;
    return Math.max(0, this.cfg.matchDuration - this.time);
  };

  /** Фаза ритма 0..1: курсор движется слева направо, «удар» — в середине (0.5). */
  TugOfWar.prototype.beatPhase = function (t) {
    if (t === undefined) t = this.time;
    var p = this.cfg.beatPeriod;
    var m = ((t % p) + p) % p;
    return m / p;
  };

  TugOfWar.prototype.beatDistance = function (t) {
    if (t === undefined) t = this.time;
    var p = this.cfg.beatPeriod;
    var m = ((t % p) + p) % p;
    return Math.abs(m - p / 2);
  };

  TugOfWar.prototype.isOnBeat = function (t) {
    return this.beatDistance(t) <= this.cfg.beatWindow;
  };

  /** Время следующего удара ритма (центр окна) после момента t. */
  TugOfWar.prototype.nextBeatTime = function (t) {
    if (t === undefined) t = this.time;
    var p = this.cfg.beatPeriod;
    var m = ((t % p) + p) % p;
    var half = p / 2;
    return m <= half ? t + (half - m) : t + (p - m) + half;
  };

  TugOfWar.prototype.currentBoundary = function () {
    return this.phase === 'overtime' ? this.cfg.overtimeBoundary : this.cfg.winBoundary;
  };

  TugOfWar.prototype.finish = function (winner, reason) {
    this.phase = 'finished';
    this.winner = winner;
    this.reason = reason;
    this.sides.L.bracing = false;
    this.sides.R.bracing = false;
    this.queue = [];
    this.emit({ type: 'end', winner: winner, reason: reason });
  };

  TugOfWar.prototype.applyAction = function (a) {
    var cfg = this.cfg;
    var s = this.sides[a.side];
    var o = this.sides[OTHER[a.side]];
    var t = this.time;

    if (s.bracing) { this.emit({ type: 'denied', side: a.side, action: a.type, why: 'bracing' }); return; }

    var onBeat = this.isOnBeat(t);
    var power, cost;

    if (a.type === 'pull') {
      if (t - s.lastPullAt < cfg.pullMinInterval) return; // ограничение частоты — лишние нажатия не считаются
      power = cfg.pullPower;
      cost = cfg.pullCost;
    } else { // surge
      if (t < s.surgeReadyAt) { this.emit({ type: 'denied', side: a.side, action: 'surge', why: 'cooldown' }); return; }
      if (s.stamina < cfg.surgeCost) { this.emit({ type: 'denied', side: a.side, action: 'surge', why: 'stamina' }); return; }
      power = cfg.surgePower;
      cost = cfg.surgeCost;
      s.surgeReadyAt = t + cfg.surgeCooldown;
      s.surges++;
    }

    if (s.exhausted) power *= cfg.exhaustPower;
    if (onBeat) { power *= cfg.beatBonus; s.beatHits++; }
    if (o.bracing) power *= cfg.braceDamping;

    s.stamina = Math.max(0, s.stamina - cost);
    var becameExhausted = false;
    if (s.stamina <= 0 && !s.exhausted) { s.exhausted = true; becameExhausted = true; }

    this.vel += DIR[a.side] * power;
    s.pulls++;
    s.lastPullAt = t;
    s.lastAction = { type: a.type, power: power, at: t, onBeat: onBeat };

    this.emit({ type: a.type, side: a.side, power: power, onBeat: onBeat, damped: o.bracing });
    if (becameExhausted) this.emit({ type: 'exhausted', side: a.side });
  };

  TugOfWar.prototype.tick = function (dt) {
    var cfg = this.cfg;
    this.events = [];

    if (this.phase === 'countdown') {
      var before = Math.ceil(this.countdownLeft);
      this.countdownLeft -= dt;
      var after = Math.ceil(this.countdownLeft);
      if (after < before && after > 0) this.emit({ type: 'countdown', n: after });
      if (this.countdownLeft <= 0) {
        this.phase = 'playing';
        this.time = 0;
        this.queue = [];
        this.emit({ type: 'start' });
      }
      return this.events;
    }

    if (!this.isActive()) { this.queue = []; return this.events; }

    this.time += dt;
    if (this.phase === 'overtime') this.overtimeLeft -= dt;

    // Действия
    var q = this.queue; this.queue = [];
    for (var i = 0; i < q.length; i++) this.applyAction(q[i]);

    // Выносливость
    var sidesArr = ['L', 'R'];
    for (var k = 0; k < 2; k++) {
      var side = sidesArr[k];
      var s = this.sides[side];
      var r;
      if (s.bracing) { r = cfg.regenBrace; s.braceTime += dt; }
      else if (this.time - s.lastPullAt >= cfg.idleDelay) r = cfg.regenIdle;
      else r = cfg.regenPulling;
      s.stamina = Math.min(100, s.stamina + r * dt);
      if (s.exhausted) {
        s.exhaustedTime += dt;
        if (s.stamina >= cfg.exhaustThreshold) { s.exhausted = false; this.emit({ type: 'recovered', side: side }); }
      }
    }

    // Физика каната
    this.vel *= Math.exp(-cfg.friction * dt);
    this.pos += this.vel * dt;
    var limit = cfg.winBoundary;
    if (this.pos < -limit) this.pos = -limit;
    if (this.pos > limit) this.pos = limit;
    if (-this.pos > this.maxLead.L) this.maxLead.L = -this.pos;
    if (this.pos > this.maxLead.R) this.maxLead.R = this.pos;

    // Победа по границе
    if (!cfg.training) {
      var b = this.currentBoundary();
      if (this.pos <= -b) { this.pos = -b; this.finish('L', 'boundary'); this.tickCount++; return this.events; }
      if (this.pos >= b) { this.pos = b; this.finish('R', 'boundary'); this.tickCount++; return this.events; }
    }

    // Истечение времени
    if (this.phase === 'playing' && this.time >= cfg.matchDuration) {
      if (cfg.training) this.finish(null, 'training');
      else if (Math.abs(this.pos) >= cfg.tieMargin) this.finish(this.pos < 0 ? 'L' : 'R', 'time');
      else { this.phase = 'overtime'; this.overtimeLeft = cfg.overtimeDuration; this.emit({ type: 'overtime' }); }
    } else if (this.phase === 'overtime' && this.overtimeLeft <= 0) {
      if (Math.abs(this.pos) < cfg.drawMargin) this.finish(null, 'draw');
      else this.finish(this.pos < 0 ? 'L' : 'R', 'overtime');
    }

    this.tickCount++;
    return this.events;
  };

  /** Снимок состояния для отображения/ботов (только чтение). */
  TugOfWar.prototype.snapshot = function () {
    return {
      phase: this.phase,
      time: this.time,
      timeLeft: this.timeLeft(),
      pos: this.pos,
      vel: this.vel,
      winner: this.winner,
      reason: this.reason,
      sides: this.sides,
      beatPhase: this.beatPhase(),
      onBeat: this.isOnBeat(),
      boundary: this.currentBoundary(),
      countdownLeft: this.countdownLeft
    };
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = TugOfWar;
  else root.TugOfWar = TugOfWar;
})(typeof window !== 'undefined' ? window : globalThis);
