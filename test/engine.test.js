// Запуск: node test/engine.test.js
const assert = require('assert');
const TugOfWar = require('../js/engine.js');
const Bot = require('../js/bot.js');
const STEP = 1 / 60;

function run(game, seconds, fn) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) { if (fn) fn(i); game.tick(STEP); }
}
function skipCountdown(game) { game.start(); run(game, game.cfg.countdown + STEP); assert.strictEqual(game.phase, 'playing'); }

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('✓', name); }

test('действия до старта игнорируются', () => {
  const g = new TugOfWar();
  assert.strictEqual(g.act('L', 'pull'), false);
  g.start();
  assert.strictEqual(g.phase, 'countdown');
  assert.strictEqual(g.act('L', 'pull'), false);
  g.setBrace('L', true);
  assert.strictEqual(g.sides.L.bracing, false);
  run(g, g.cfg.countdown + STEP);
  assert.strictEqual(g.phase, 'playing');
  assert.strictEqual(g.pos, 0);
});

test('тяг двигает канат в свою сторону и тратит выносливость', () => {
  const g = new TugOfWar();
  skipCountdown(g);
  g.act('L', 'pull');
  g.tick(STEP);
  assert.ok(g.pos < 0);
  assert.ok(g.sides.L.stamina < 100);
  assert.strictEqual(g.sides.L.pulls, 1);
});

test('ограничение частоты: спам нажатий не даёт больше тягов', () => {
  const g = new TugOfWar();
  skipCountdown(g);
  run(g, 1, () => { g.act('L', 'pull'); g.act('L', 'pull'); g.act('L', 'pull'); });
  const maxPulls = Math.ceil(1 / g.cfg.pullMinInterval) + 1;
  assert.ok(g.sides.L.pulls <= maxPulls, 'pulls=' + g.sides.L.pulls);
});

test('истощение: без выносливости сила падает, спам не помогает', () => {
  const g = new TugOfWar();
  skipCountdown(g);
  run(g, 4, () => g.act('L', 'pull'));
  assert.ok(g.sides.L.exhausted);
  assert.ok(g.sides.L.stamina < 20);
  const before = g.pos;
  g.act('L', 'pull'); g.tick(STEP);
  const normal = g.cfg.pullPower * STEP;
  assert.ok(before - g.pos < normal, 'истощённый тяг слабее обычного');
});

test('упор: нельзя тянуть, быстро восстанавливается, входящая сила ослаблена', () => {
  const g = new TugOfWar({ beatWindow: 0 });
  skipCountdown(g);
  run(g, 2, () => g.act('L', 'pull'));
  const st = g.sides.L.stamina;
  g.setBrace('L', true);
  g.act('L', 'pull'); g.tick(STEP);
  assert.strictEqual(g.sides.L.pulls, Math.round(g.sides.L.pulls));
  const pullsBefore = g.sides.L.pulls;
  g.act('L', 'pull'); g.tick(STEP);
  assert.strictEqual(g.sides.L.pulls, pullsBefore, 'в упоре тяг не засчитан');
  run(g, 1);
  assert.ok(g.sides.L.stamina > st + 20, 'упор восстанавливает быстрее');
  // входящая сила: сравниваем скорость от одного тяга R с упором и без
  const g2 = new TugOfWar({ beatWindow: 0 }); skipCountdown(g2);
  g2.act('R', 'pull'); g2.tick(STEP); const vFree = g2.vel;
  g.vel = 0; g.act('R', 'pull'); g.tick(STEP);
  assert.ok(g.vel < vFree * 0.6, 'упор гасит силу соперника');
});

test('рывок: стоимость, перезарядка, отказ без сил', () => {
  const g = new TugOfWar();
  skipCountdown(g);
  g.act('L', 'surge'); g.tick(STEP);
  assert.strictEqual(g.sides.L.surges, 1);
  assert.ok(g.sides.L.stamina <= 100 - g.cfg.surgeCost + 1);
  g.act('L', 'surge'); g.tick(STEP);
  assert.strictEqual(g.sides.L.surges, 1, 'на перезарядке рывок не проходит');
  run(g, g.cfg.surgeCooldown + 0.1);
  g.sides.L.stamina = 10;
  g.act('L', 'surge'); g.tick(STEP);
  assert.strictEqual(g.sides.L.surges, 1, 'без выносливости рывок не проходит');
});

test('попадание в ритм усиливает тяг', () => {
  const g = new TugOfWar();
  skipCountdown(g);
  // ждём момент удара
  while (!g.isOnBeat()) g.tick(STEP);
  g.act('L', 'pull'); g.tick(STEP);
  assert.strictEqual(g.sides.L.beatHits, 1);
  const g2 = new TugOfWar(); skipCountdown(g2);
  while (g2.isOnBeat()) g2.tick(STEP);
  g2.act('L', 'pull'); g2.tick(STEP);
  assert.strictEqual(g2.sides.L.beatHits, 0);
  assert.ok(Math.abs(g.vel) > Math.abs(g2.vel) * 1.3);
});

test('победа по границе и остановка после финиша', () => {
  const g = new TugOfWar();
  skipCountdown(g);
  let ended = false;
  run(g, 30, () => { if (g.phase === 'finished') ended = true; else g.act('R', 'pull'); });
  assert.ok(ended);
  assert.strictEqual(g.winner, 'R');
  assert.strictEqual(g.reason, 'boundary');
  const pos = g.pos, pulls = g.sides.R.pulls;
  assert.strictEqual(g.act('R', 'pull'), false);
  assert.strictEqual(g.act('L', 'pull'), false);
  run(g, 1, () => g.act('L', 'pull'));
  assert.strictEqual(g.pos, pos);
  assert.strictEqual(g.sides.R.pulls, pulls);
});

test('истечение времени: победа по положению, овертайм и ничья', () => {
  const g = new TugOfWar({ matchDuration: 5 });
  skipCountdown(g);
  g.act('L', 'pull'); run(g, 5.1);
  assert.strictEqual(g.phase, 'finished');
  assert.strictEqual(g.winner, 'L');
  assert.strictEqual(g.reason, 'time');

  const g2 = new TugOfWar({ matchDuration: 2, overtimeDuration: 2 });
  skipCountdown(g2);
  run(g2, 2.1);
  assert.strictEqual(g2.phase, 'overtime');
  run(g2, 2.1);
  assert.strictEqual(g2.phase, 'finished');
  assert.strictEqual(g2.winner, null);
  assert.strictEqual(g2.reason, 'draw');

  const g3 = new TugOfWar({ matchDuration: 2, overtimeDuration: 5 });
  skipCountdown(g3);
  run(g3, 2.1);
  assert.strictEqual(g3.phase, 'overtime');
  run(g3, 5, () => g3.act('R', 'pull'));
  assert.strictEqual(g3.winner, 'R');
  assert.ok(g3.reason === 'boundary' || g3.reason === 'overtime');
});

test('reset даёт чистое состояние', () => {
  const g = new TugOfWar();
  skipCountdown(g);
  run(g, 3, () => g.act('L', 'pull'));
  g.reset();
  assert.strictEqual(g.phase, 'idle');
  assert.strictEqual(g.pos, 0);
  assert.strictEqual(g.sides.L.stamina, 100);
  assert.strictEqual(g.sides.L.pulls, 0);
});

test('бот играет по правилам и доводит матч до результата', () => {
  const g = new TugOfWar({ matchDuration: 60 });
  const b1 = new Bot('L', 'hard'), b2 = new Bot('R', 'easy');
  skipCountdown(g);
  let maxPullsPerSec = 0, window = [];
  run(g, 90, () => {
    if (g.phase === 'finished') return;
    b1.update(g, STEP); b2.update(g, STEP);
    window.push(g.sides.L.pulls);
    if (window.length > 60) { window.shift(); maxPullsPerSec = Math.max(maxPullsPerSec, window[59] - window[0]); }
  });
  assert.strictEqual(g.phase, 'finished');
  assert.ok(g.sides.L.stamina >= 0 && g.sides.L.stamina <= 100);
  assert.ok(maxPullsPerSec <= Math.ceil(1 / g.cfg.pullMinInterval) + 1, 'бот не превышает лимит частоты: ' + maxPullsPerSec);
});

console.log('\nВсе тесты пройдены:', passed);
