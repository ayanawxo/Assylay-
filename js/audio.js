/* Звук на WebAudio без внешних файлов. */
(function (root) {
  'use strict';
  var ctx = null, enabled = true, master = null;

  function ensure() {
    if (ctx) return ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    return ctx;
  }

  function tone(freq, dur, type, vol, slideTo) {
    if (!enabled) return;
    var c = ensure(); if (!c) return;
    if (c.state === 'suspended') c.resume();
    var o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, c.currentTime);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur);
    g.gain.setValueAtTime(vol || 0.5, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
    o.connect(g); g.connect(master);
    o.start(); o.stop(c.currentTime + dur + 0.02);
  }

  function noise(dur, vol) {
    if (!enabled) return;
    var c = ensure(); if (!c) return;
    var buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    var src = c.createBufferSource(); src.buffer = buf;
    var g = c.createGain(); g.gain.value = vol || 0.3;
    var f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    src.connect(f); f.connect(g); g.connect(master);
    src.start();
  }

  root.Sound = {
    setEnabled: function (v) { enabled = !!v; },
    unlock: function () { var c = ensure(); if (c && c.state === 'suspended') c.resume(); },
    pull: function (onBeat, side) { tone(onBeat ? 660 : 330, 0.08, 'triangle', onBeat ? 0.6 : 0.35, onBeat ? 990 : 260); noise(0.05, 0.15); },
    surge: function () { tone(120, 0.35, 'sawtooth', 0.6, 50); noise(0.25, 0.4); },
    denied: function () { tone(180, 0.12, 'square', 0.15, 120); },
    beat: function () { tone(1200, 0.03, 'sine', 0.12); },
    exhausted: function () { tone(220, 0.4, 'sine', 0.4, 90); },
    countdown: function (n) { tone(n === 0 ? 880 : 440, n === 0 ? 0.5 : 0.15, 'square', 0.35); },
    overtime: function () { tone(500, 0.2, 'square', 0.3); setTimeout(function () { tone(700, 0.3, 'square', 0.3); }, 200); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { tone(f, 0.35, 'triangle', 0.45); }, i * 130); }); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { setTimeout(function () { tone(f, 0.4, 'sine', 0.4); }, i * 220); }); },
    click: function () { tone(500, 0.05, 'sine', 0.2); }
  };
})(window);
