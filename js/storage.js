/* Локальное хранилище: настройки, статистика, история матчей, профиль, Pro-режим. */
(function (root) {
  'use strict';
  var PREFIX = 'kanat.';

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(PREFIX + key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch (e) { /* приватный режим и т.п. */ }
  }

  var DEFAULT_SETTINGS = {
    playerName: 'Игрок',
    p2Name: 'Игрок 2',
    difficulty: 'medium',
    bestOf: 1,
    duration: 60,
    sound: true,
    theme: 'yard'
  };

  function emptyStats() {
    return {
      byDifficulty: { easy: { w: 0, l: 0, d: 0 }, medium: { w: 0, l: 0, d: 0 }, hard: { w: 0, l: 0, d: 0 } },
      pvp: { matches: 0, p1: 0, p2: 0, d: 0 },
      streak: { current: 0, best: 0 },
      rhythmBest: { hits: 0, total: 0, accuracy: 0 },
      totalPulls: 0,
      totalBeatHits: 0,
      totalMatches: 0
    };
  }

  var Storage = {
    getSettings: function () { return Object.assign({}, DEFAULT_SETTINGS, read('settings', {})); },
    saveSettings: function (s) { write('settings', s); },

    getStats: function () { return Object.assign(emptyStats(), read('stats', {})); },
    saveStats: function (s) { write('stats', s); },

    getHistory: function () { return read('history', []); },
    addHistory: function (entry) {
      var h = this.getHistory();
      h.unshift(entry);
      if (h.length > 50) h.length = 50;
      write('history', h);
    },

    isTutorialDone: function () { return !!read('tutorialDone', false); },
    setTutorialDone: function (v) { write('tutorialDone', !!v); },

    getPro: function () { return read('pro', { enabled: false, at: null }); },
    setPro: function (v) { write('pro', v); },

    clearAll: function () {
      try {
        Object.keys(localStorage).forEach(function (k) { if (k.indexOf(PREFIX) === 0) localStorage.removeItem(k); });
      } catch (e) { /* ignore */ }
    },

    /** Записать результат матча в статистику и историю. */
    recordMatch: function (info) {
      var stats = this.getStats();
      stats.totalMatches++;
      stats.totalPulls += info.pulls.L + info.pulls.R;
      stats.totalBeatHits += info.beatHits.L + info.beatHits.R;
      if (info.mode === 'bot') {
        var d = stats.byDifficulty[info.difficulty] || (stats.byDifficulty[info.difficulty] = { w: 0, l: 0, d: 0 });
        if (info.winner === 'L') { d.w++; stats.streak.current++; if (stats.streak.current > stats.streak.best) stats.streak.best = stats.streak.current; }
        else if (info.winner === 'R') { d.l++; stats.streak.current = 0; }
        else { d.d++; }
      } else if (info.mode === 'pvp') {
        stats.pvp.matches++;
        if (info.winner === 'L') stats.pvp.p1++; else if (info.winner === 'R') stats.pvp.p2++; else stats.pvp.d++;
      }
      this.saveStats(stats);
      this.addHistory(info);
      return stats;
    },

    recordRhythm: function (hits, total) {
      var stats = this.getStats();
      var acc = total ? hits / total : 0;
      var isBest = hits > stats.rhythmBest.hits || (hits === stats.rhythmBest.hits && acc > stats.rhythmBest.accuracy);
      if (isBest) stats.rhythmBest = { hits: hits, total: total, accuracy: acc };
      this.saveStats(stats);
      return isBest;
    }
  };

  root.Storage = Storage;
})(window);
