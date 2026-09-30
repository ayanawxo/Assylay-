/*
 * Компьютерный соперник. Действует только через публичный API движка
 * (act / setBrace), поэтому подчиняется тем же ограничениям, что и человек:
 * тратит выносливость, ждёт перезарядку рывка, не может тянуть в упоре.
 * Уровни отличаются скоростью реакции, темпом, точностью ритма и тактикой.
 */
(function (root) {
  'use strict';

  var LEVELS = {
    easy: {
      label: 'Лёгкий',
      think: 0.25,          // как часто бот принимает решения, с
      interval: 0.34,       // базовый интервал между тягами, с (~3/с)
      jitter: 0.5,
      rhythmSkill: 0.15,    // вероятность целиться в ритм
      beatError: 0.16,      // ошибка попадания в ритм, с
      braceAt: 8,           // включить упор при выносливости <= braceAt
      braceUntil: 45,       // выйти из упора при выносливости >= braceUntil
      braceChance: 0.4,
      surgeReserve: 0,      // сколько выносливости оставить сверх стоимости рывка
      surgeSmart: false,    // рывок по ситуации (иначе — случайно)
      surgeRandomPerSec: 0.15,
      surgeOnBeat: false,
      respectBrace: false,  // прекращать тягу, когда соперник в упоре
      pauseWhenLeading: 0   // отдыхать при перевесе больше этого значения (0 = нет)
    },
    medium: {
      label: 'Средний',
      think: 0.12,
      interval: 0.21,       // ~4.8/с
      jitter: 0.25,
      rhythmSkill: 0.55,
      beatError: 0.07,
      braceAt: 18,
      braceUntil: 65,
      braceChance: 0.8,
      surgeReserve: 5,
      surgeSmart: true,
      surgeRandomPerSec: 0.05,
      surgeOnBeat: false,
      respectBrace: true,
      pauseWhenLeading: 0
    },
    hard: {
      label: 'Сложный',
      think: 0.05,
      interval: 0.18,       // ~5.5/с
      jitter: 0.1,
      rhythmSkill: 0.85,
      beatError: 0.04,
      braceAt: 24,
      braceUntil: 78,
      braceChance: 1,
      surgeReserve: 10,
      surgeSmart: true,
      surgeRandomPerSec: 0.02,
      surgeOnBeat: true,
      respectBrace: true,
      pauseWhenLeading: 70
    }
  };

  function Bot(side, difficulty, rng) {
    this.side = side;
    this.other = side === 'L' ? 'R' : 'L';
    this.level = LEVELS[difficulty] ? difficulty : 'medium';
    this.cfg = LEVELS[this.level];
    this.rng = rng || Math.random;
    this.reset();
  }

  Bot.LEVELS = LEVELS;

  Bot.prototype.reset = function () {
    // случайный сдвиг «мышления», чтобы боты не принимали решения синхронно
    this.nextThinkAt = this.rng() * this.cfg.think;
    this.nextPullAt = 0;
    this.aimedBeat = null;
  };

  Bot.prototype.gauss = function () {
    // приближение нормального распределения
    var r = this.rng, s = 0;
    for (var i = 0; i < 4; i++) s += r();
    return (s - 2) * 1.2;
  };

  Bot.prototype.update = function (game, dt) {
    if (!game.isActive()) { this.reset(); return; }
    var t = game.time;
    if (t < this.nextThinkAt) return;
    var cfg = this.cfg;
    this.nextThinkAt = t + cfg.think;

    var dir = game.constructor.DIR[this.side];
    var me = game.sides[this.side];
    var op = game.sides[this.other];
    var lead = dir * game.pos;                 // > 0 — бот выигрывает
    var timeLeft = game.timeLeft();
    var boundary = game.currentBoundary();
    var desperate = lead < -boundary * 0.6;     // почти проиграл — тянуть любой ценой
    var closing = timeLeft < 6 && lead < 0;     // время уходит, а бот позади

    // 1. Упор: восстанавливаем силы, пока не станет достаточно
    if (me.bracing) {
      var release = me.stamina >= cfg.braceUntil || (desperate && me.stamina > 30) || (closing && me.stamina > 20);
      if (release) game.setBrace(this.side, false);
      else return;
    } else if (me.stamina <= cfg.braceAt && !desperate && !closing && this.rng() < cfg.braceChance) {
      game.setBrace(this.side, true);
      return;
    }

    // 2. Экономия: соперник в упоре — тянуть почти бесполезно
    if (cfg.respectBrace && op.bracing && !desperate && !closing && lead > -boundary * 0.5) return;

    // 3. Отдых при большом перевесе (только сложный бот копит силы для добивания)
    if (cfg.pauseWhenLeading && lead > cfg.pauseWhenLeading && me.stamina < 60 && timeLeft > 8) return;

    // 4. Рывок
    var surgeCost = game.cfg.surgeCost;
    if (t >= me.surgeReadyAt && me.stamina >= surgeCost + cfg.surgeReserve) {
      var want = false;
      if (cfg.surgeSmart) {
        want = op.exhausted || op.stamina < 20 || lead > boundary * 0.55 || desperate || closing;
        if (op.bracing) want = false;
      }
      if (!want && this.rng() < cfg.surgeRandomPerSec * cfg.think) want = true;
      if (want) {
        if (!cfg.surgeOnBeat || game.beatDistance(t) <= game.cfg.beatWindow * 0.8) {
          game.act(this.side, 'surge');
          this.nextPullAt = t + cfg.interval;
          return;
        }
      }
    }

    // 5. Обычная тяга с попыткой попасть в ритм
    if (t >= this.nextPullAt) {
      var nextBeat = game.nextBeatTime(t);
      var interval = cfg.interval * (1 + (this.rng() - 0.5) * cfg.jitter);
      if (this.aimedBeat === null && nextBeat - t <= interval && this.rng() < cfg.rhythmSkill) {
        // подождать до удара ритма, но не дольше одного интервала
        this.aimedBeat = nextBeat + this.gauss() * cfg.beatError;
        this.nextPullAt = this.aimedBeat;
        if (this.nextPullAt > t) return;
      }
      this.aimedBeat = null;
      game.act(this.side, 'pull');
      this.nextPullAt = t + interval;
    }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Bot;
  else root.Bot = Bot;
})(typeof window !== 'undefined' ? window : globalThis);
