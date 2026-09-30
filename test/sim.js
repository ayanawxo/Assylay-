// Симуляция баланса: node test/sim.js [матчей]
const TugOfWar = require('../js/engine.js');
const Bot = require('../js/bot.js');
const STEP = 1 / 60;
const N = parseInt(process.argv[2] || '200', 10);
const levels = ['easy', 'medium', 'hard'];

function play(a, b) {
  const g = new TugOfWar();
  const ba = new Bot('L', a), bb = new Bot('R', b);
  g.start();
  let ticks = 0;
  while (g.phase !== 'finished' && ticks < 60 * 200) {
    ba.update(g, STEP); bb.update(g, STEP); g.tick(STEP); ticks++;
  }
  return { winner: g.winner, reason: g.reason, time: g.time, pulls: [g.sides.L.pulls, g.sides.R.pulls], beat: [g.sides.L.beatHits, g.sides.R.beatHits] };
}

for (const a of levels) for (const b of levels) {
  const res = { L: 0, R: 0, draw: 0 }, reasons = {}; let t = 0;
  for (let i = 0; i < N; i++) {
    const r = play(a, b);
    res[r.winner || 'draw']++; reasons[r.reason] = (reasons[r.reason] || 0) + 1; t += r.time;
  }
  console.log(`${a.padEnd(6)} vs ${b.padEnd(6)}  L ${(res.L / N * 100).toFixed(0).padStart(3)}%  R ${(res.R / N * 100).toFixed(0).padStart(3)}%  draw ${(res.draw / N * 100).toFixed(0).padStart(2)}%  avg ${(t / N).toFixed(1)}s  ${JSON.stringify(reasons)}`);
}
