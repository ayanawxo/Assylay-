/* Оркестрация: экраны, игровой цикл, HUD, обучение, серии, статистика. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var STEP = 1 / 60;

  var settings = Storage.getSettings();
  var pro = Storage.getPro();
  var game = null, bot = null, renderer = null, input = null;
  var mode = 'bot';              // bot | pvp | rhythm | tutorial
  var series = null;             // { target, wins: {L,R}, round }
  var rafId = null, lastFrame = 0, accumulator = 0;
  var resultTimer = null, finished = false;
  var tutorial = null;

  var REASONS = {
    boundary: 'Канат пересёк границу',
    time: 'Время вышло — флажок на половине соперника',
    overtime: 'Овертайм: флажок на половине соперника',
    draw: 'Ничья — флажок остался в центре',
    training: 'Тренировка завершена'
  };

  /* ---------- Утилиты ---------- */
  function show(id) { Array.prototype.forEach.call(document.querySelectorAll('.screen'), function (s) { s.classList.remove('active'); }); $(id).classList.add('active'); }
  function toast(msg) { var t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.t); toast.t = setTimeout(function () { t.classList.add('hidden'); }, 2200); }
  function openModal(id) { $(id).classList.remove('hidden'); }
  function closeModal(id) { $(id).classList.add('hidden'); }
  function confirmDlg(text, cb) {
    $('confirm-text').textContent = text; openModal('modal-confirm');
    $('confirm-yes').onclick = function () { closeModal('modal-confirm'); cb(true); };
    $('confirm-no').onclick = function () { closeModal('modal-confirm'); cb(false); };
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function names() {
    if (mode === 'pvp') return { L: settings.playerName, R: settings.p2Name };
    if (mode === 'bot') return { L: settings.playerName, R: 'Бот · ' + Bot.LEVELS[settings.difficulty].label };
    return { L: settings.playerName, R: '—' };
  }

  /* ---------- Меню ---------- */
  function initMenu() {
    $('menu-player-name').textContent = settings.playerName;
    $('opt-bestof').value = String(settings.bestOf);
    $('opt-duration').value = String(settings.duration);
    $('opt-sound').checked = !!settings.sound;
    Sound.setEnabled(settings.sound);
    Array.prototype.forEach.call(document.querySelectorAll('#difficulty-opts .chip'), function (ch) {
      ch.classList.toggle('active', ch.getAttribute('data-diff') === settings.difficulty);
      ch.addEventListener('click', function (e) {
        e.stopPropagation();
        settings.difficulty = ch.getAttribute('data-diff'); Storage.saveSettings(settings);
        Array.prototype.forEach.call(document.querySelectorAll('#difficulty-opts .chip'), function (c) { c.classList.toggle('active', c === ch); });
        Sound.click();
      });
    });
    $('opt-bestof').addEventListener('change', function () { settings.bestOf = parseInt(this.value, 10); Storage.saveSettings(settings); });
    $('opt-duration').addEventListener('change', function () { settings.duration = parseInt(this.value, 10); Storage.saveSettings(settings); });
    $('opt-sound').addEventListener('change', function () { settings.sound = this.checked; Sound.setEnabled(settings.sound); Storage.saveSettings(settings); });

    $('btn-play-bot').addEventListener('click', function () { Sound.unlock(); startSeries('bot'); });
    $('btn-play-pvp').addEventListener('click', function () { Sound.unlock(); startSeries('pvp'); });
    $('btn-play-rhythm').addEventListener('click', function () { Sound.unlock(); startSeries('rhythm'); });
    $('btn-tutorial').addEventListener('click', function () { Sound.unlock(); startTutorial(); });
    $('btn-rules').addEventListener('click', function () { openModal('modal-rules'); });
    $('btn-stats').addEventListener('click', function () { renderStats(); openModal('modal-stats'); });
    $('btn-settings').addEventListener('click', openSettings);
    $('link-rename').addEventListener('click', function (e) { e.preventDefault(); openSettings(); });
    $('btn-shop').addEventListener('click', function () { renderShop(); openModal('modal-shop'); });
    Array.prototype.forEach.call(document.querySelectorAll('.modal-close'), function (b) {
      b.addEventListener('click', function () { closeModal(b.closest('.modal').id); });
    });
    $('btn-save-settings').addEventListener('click', function () {
      settings.playerName = ($('set-name').value.trim() || 'Игрок').slice(0, 16);
      settings.p2Name = ($('set-p2name').value.trim() || 'Игрок 2').slice(0, 16);
      Storage.saveSettings(settings); $('menu-player-name').textContent = settings.playerName;
      closeModal('modal-settings'); toast('Сохранено');
    });
    $('btn-clear-data').addEventListener('click', function () {
      confirmDlg('Удалить статистику, историю и настройки в этом браузере?', function (ok) {
        if (!ok) return; Storage.clearAll(); settings = Storage.getSettings(); pro = Storage.getPro(); initMenuValues(); renderStats(); toast('Данные очищены');
      });
    });
    $('btn-buy-pro').addEventListener('click', function () {
      if (pro.enabled) { toast('Pro уже открыт'); return; }
      confirmDlg('ТЕСТОВЫЙ РЕЖИМ ОПЛАТЫ. Реальные деньги не списываются. Открыть Pro-оформление в этом браузере?', function (ok) {
        if (!ok) return; pro = { enabled: true, at: Date.now() }; Storage.setPro(pro); renderShop(); toast('Pro открыт (тестовый режим)');
      });
    });
  }
  function initMenuValues() {
    $('menu-player-name').textContent = settings.playerName;
    $('opt-bestof').value = String(settings.bestOf); $('opt-duration').value = String(settings.duration); $('opt-sound').checked = !!settings.sound;
    Array.prototype.forEach.call(document.querySelectorAll('#difficulty-opts .chip'), function (c) { c.classList.toggle('active', c.getAttribute('data-diff') === settings.difficulty); });
  }
  function openSettings() { $('set-name').value = settings.playerName; $('set-p2name').value = settings.p2Name; openModal('modal-settings'); }

  /* ---------- Статистика ---------- */
  function renderStats() {
    var st = Storage.getStats(), h = Storage.getHistory();
    var totalW = 0, totalL = 0, totalD = 0;
    ['easy', 'medium', 'hard'].forEach(function (d) { totalW += st.byDifficulty[d].w; totalL += st.byDifficulty[d].l; totalD += st.byDifficulty[d].d; });
    var acc = st.totalPulls ? Math.round(st.totalBeatHits / st.totalPulls * 100) : 0;
    var html = '<div class="stat-tiles">' +
      '<div class="stat-tile"><b>' + st.totalMatches + '</b><span>матчей сыграно</span></div>' +
      '<div class="stat-tile"><b>' + totalW + ' / ' + totalL + ' / ' + totalD + '</b><span>против бота: П / Пор / Н</span></div>' +
      '<div class="stat-tile"><b>' + st.streak.current + ' (макс ' + st.streak.best + ')</b><span>серия побед</span></div>' +
      '<div class="stat-tile"><b>' + acc + '%</b><span>тягов в ритм</span></div>' +
      '<div class="stat-tile"><b>' + st.rhythmBest.hits + '</b><span>рекорд ритм-тренировки' + (st.rhythmBest.total ? ' (' + Math.round(st.rhythmBest.accuracy * 100) + '%)' : '') + '</span></div>' +
      '</div>' +
      '<table class="stats-table"><tr><th>Сложность</th><th>Победы</th><th>Поражения</th><th>Ничьи</th></tr>' +
      ['easy', 'medium', 'hard'].map(function (d) { var r = st.byDifficulty[d]; return '<tr><td>' + Bot.LEVELS[d].label + '</td><td>' + r.w + '</td><td>' + r.l + '</td><td>' + r.d + '</td></tr>'; }).join('') +
      '<tr><td>Вдвоём</td><td colspan="3">' + st.pvp.matches + ' матчей · ' + st.pvp.p1 + ' : ' + st.pvp.p2 + (st.pvp.d ? ' · ничьих ' + st.pvp.d : '') + '</td></tr></table>';
    $('stats-body').innerHTML = html;
    $('history-body').innerHTML = h.length ? h.slice(0, 20).map(function (m) {
      var cls = m.winner === 'L' ? 'w' : (m.winner === 'R' ? 'l' : 'd');
      var res = m.mode === 'rhythm' ? ('ритм: ' + m.beatHits.L + ' попаданий') : (m.winner === null ? 'Ничья' : (m.winner === 'L' ? 'Победа ' : 'Победа ') + esc(m.winner === 'L' ? m.p1 : m.p2));
      var d = new Date(m.at);
      return '<div class="history-row"><span class="' + cls + '">' + res + '</span><span class="meta">' + esc(m.p1) + ' vs ' + esc(m.p2) + ' · ' + Math.round(m.duration) + ' с · ' + d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) + '</span></div>';
    }).join('') : '<div class="hint">Пока нет сыгранных матчей.</div>';
  }

  /* ---------- Магазин оформления ---------- */
  function renderShop() {
    var grid = $('theme-grid'); grid.innerHTML = '';
    $('pro-status').textContent = pro.enabled ? '★ Pro активен (тестовый режим) — все арены открыты' : 'Бесплатный доступ: одна арена. Pro открывает ещё две.';
    $('pro-status').className = 'pro-status' + (pro.enabled ? ' on' : '');
    $('btn-buy-pro').classList.toggle('hidden', pro.enabled);
    Object.keys(Renderer.THEMES).forEach(function (key) {
      var t = Renderer.THEMES[key], locked = t.pro && !pro.enabled;
      var card = document.createElement('button');
      card.className = 'theme-card' + (settings.theme === key ? ' active' : '') + (locked ? ' locked' : '');
      card.innerHTML = '<div class="theme-preview" style="background:linear-gradient(180deg,' + t.sky[0] + ' 0 60%,' + t.ground + ' 60%)"></div><span class="theme-name">' + t.name + '</span><span class="theme-tag">' + (t.pro ? (locked ? '🔒 Pro' : '★ Pro') : 'Бесплатно') + '</span>';
      card.addEventListener('click', function () {
        if (locked) { toast('Эта арена доступна в Pro (тестовый режим)'); return; }
        settings.theme = key; Storage.saveSettings(settings); renderShop(); Sound.click();
      });
      grid.appendChild(card);
    });
  }

  /* ---------- Игра ---------- */
  function buildGame(opts) {
    game = new TugOfWar(Object.assign({ matchDuration: settings.duration }, opts || {}));
    bot = mode === 'bot' ? new Bot('R', settings.difficulty) : null;
    finished = false;
    clearTimeout(resultTimer);
    renderer.popups = []; renderer.particles = [];
    renderer.names = names();
    renderer.setTheme(settings.theme);
    $('hud-name-L').textContent = renderer.names.L; $('hud-name-R').textContent = renderer.names.R;
    $('controls').classList.toggle('solo', mode !== 'pvp');
    $('overlay-result').classList.add('hidden');
    $('controls').classList.remove('hidden'); $('beat-wrap').classList.remove('hidden');
    renderer.resize();
    $('overlay-countdown').classList.remove('hidden');
    $('countdown-num').textContent = String(game.cfg.countdown);
    $('hud-series').textContent = series && series.target > 1 ? 'Раунд ' + series.round + ' · счёт ' + series.wins.L + ' : ' + series.wins.R : '';
    input.mode = mode === 'pvp' ? 'pvp' : 'bot';
    input.releaseAll();
    input.enabled = true;
    game.start();
    updateHUD();
  }

  function startSeries(m) {
    mode = m;
    var target = m === 'bot' || m === 'pvp' ? Math.ceil(settings.bestOf / 2) : 1;
    series = { target: target, wins: { L: 0, R: 0 }, round: 1, bestOf: settings.bestOf };
    tutorial = null;
    show('screen-game');
    $('tutorial-box').classList.add('hidden');
    $('controls').classList.remove('hidden'); $('beat-wrap').classList.remove('hidden');
    renderer.resize();
    if (m === 'rhythm') buildGame({ matchDuration: 20, training: true, countdown: 3 });
    else buildGame();
    startLoop();
  }

  function startLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    lastFrame = performance.now(); accumulator = 0;
    rafId = requestAnimationFrame(frame);
  }
  function stopLoop() { if (rafId) cancelAnimationFrame(rafId); rafId = null; }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    var dt = Math.min(0.25, (now - lastFrame) / 1000); lastFrame = now;
    accumulator += dt;
    var allEvents = [];
    while (accumulator >= STEP) {           // фиксированный шаг логики
      if (bot) bot.update(game, STEP);
      if (tutorial) tutorial.tick();
      var ev = game.tick(STEP);
      if (ev.length) allEvents = allEvents.concat(ev);
      accumulator -= STEP;
    }
    if (allEvents.length) handleEvents(allEvents);
    renderer.update(dt);
    renderer.draw(game, now);
    updateHUD();
  }

  var lastBeatIdx = -1;
  function handleEvents(events) {
    renderer.handleEvents(events, game);
    events.forEach(function (ev) {
      switch (ev.type) {
        case 'countdown': $('countdown-num').textContent = String(ev.n); $('countdown-num').style.animation = 'none'; void $('countdown-num').offsetWidth; $('countdown-num').style.animation = ''; Sound.countdown(ev.n); break;
        case 'start': $('overlay-countdown').classList.add('hidden'); Sound.countdown(0); break;
        case 'pull': if (mode !== 'bot' || ev.side === 'L') Sound.pull(ev.onBeat, ev.side); else if (ev.onBeat) Sound.beat(); break;
        case 'surge': Sound.surge(); break;
        case 'denied': if (ev.action === 'surge' && (mode !== 'bot' || ev.side === 'L')) Sound.denied(); break;
        case 'exhausted': if (mode !== 'bot' || ev.side === 'L') Sound.exhausted(); break;
        case 'overtime': Sound.overtime(); $('hud-sub').textContent = 'ОВЕРТАЙМ · граница ±40'; break;
        case 'end': onMatchEnd(ev); break;
      }
    });
  }

  function fmtTime(t) { return Math.ceil(t).toString(); }
  function updateHUD() {
    var tl = game.timeLeft();
    var timer = $('hud-timer');
    if (mode === 'tutorial') { timer.textContent = '🎓'; timer.className = 'hud-timer'; $('hud-sub').textContent = 'обучение'; }
    else {
      timer.textContent = game.phase === 'countdown' ? fmtTime(game.cfg.matchDuration) : fmtTime(tl);
      timer.className = 'hud-timer' + (game.phase === 'overtime' ? ' overtime' : (tl <= 10 && game.isActive() ? ' urgent' : ''));
      if (game.phase === 'playing') $('hud-sub').textContent = mode === 'rhythm' ? 'ритм-тренировка' : 'до конца матча';
    }
    ['L', 'R'].forEach(function (side) {
      var s = game.sides[side];
      var fill = $('stamina-' + side);
      fill.style.width = s.stamina + '%';
      fill.className = 'bar-fill' + (s.exhausted ? ' exhausted' : (s.stamina < 30 ? ' low' : ''));
      $('stamina-' + side + '-txt').textContent = Math.round(s.stamina);
      var cd = Math.max(0, s.surgeReadyAt - game.time), ready = cd <= 0 && s.stamina >= game.cfg.surgeCost;
      $('surge-' + side).style.width = (cd > 0 ? (1 - cd / game.cfg.surgeCooldown) * 100 : 100) + '%';
      $('surge-' + side).style.opacity = ready ? 1 : 0.45;
      var stateEl = $('state-' + side);
      stateEl.textContent = s.bracing ? 'УПОР — восстановление' : (s.exhausted ? 'ВЫДОХСЯ' : (ready && game.isActive() ? 'рывок готов' : ''));
      stateEl.style.color = s.exhausted ? '#ff5c5c' : (s.bracing ? '#a5b4fc' : '#ffcc00');
      var pad = $('pad-' + side);
      if (pad) {
        var sb = pad.querySelector('.surge'), pb = pad.querySelector('.pull');
        sb.classList.toggle('disabled', !ready || s.bracing);
        pb.classList.toggle('disabled', s.bracing);
      }
    });
    // ритм
    var ph = game.isActive() ? game.beatPhase() : 0.0;
    $('beat-cursor').style.left = (ph * 100) + '%';
    $('beat-cursor').parentNode.classList.toggle('hit', game.isActive() && game.isOnBeat());
    // положение на шкале
    var lim = game.cfg.winBoundary;
    $('lead-marker').style.left = (50 + game.pos / lim * 50) + '%';
    if (mode === 'rhythm') { $('hud-name-R').textContent = 'В ритм: ' + game.sides.L.beatHits + ' / ' + game.sides.L.pulls; }
  }

  function onMatchEnd(ev) {
    finished = true;
    input.enabled = false; input.releaseAll();
    if (tutorial) return;
    var n = names();
    var entry = {
      at: Date.now(), mode: mode, difficulty: mode === 'bot' ? settings.difficulty : null,
      p1: n.L, p2: n.R, winner: ev.winner, reason: ev.reason, duration: game.time,
      pulls: { L: game.sides.L.pulls, R: game.sides.R.pulls }, beatHits: { L: game.sides.L.beatHits, R: game.sides.R.beatHits },
      surges: { L: game.sides.L.surges, R: game.sides.R.surges }, finalPos: game.pos
    };
    var isBest = false;
    if (mode === 'rhythm') { isBest = Storage.recordRhythm(entry.beatHits.L, entry.pulls.L); Storage.addHistory(entry); }
    else { Storage.recordMatch(entry); if (ev.winner) series.wins[ev.winner]++; }
    if (mode === 'rhythm') Sound.win();
    else if (mode === 'bot') { if (ev.winner === 'L') Sound.win(); else if (ev.winner === 'R') Sound.lose(); }
    else Sound.win();
    resultTimer = setTimeout(function () { showResult(ev, entry, isBest); }, 1100);
  }

  function showResult(ev, entry, isBest) {
    var title = $('result-title'), n = names();
    title.className = 'result-title';
    if (mode === 'rhythm') { title.textContent = entry.beatHits.L + ' в ритм' + (isBest ? ' — рекорд!' : ''); title.classList.add('win'); }
    else if (ev.winner === null) title.textContent = 'Ничья';
    else if (mode === 'bot') { title.textContent = ev.winner === 'L' ? 'Победа!' : 'Поражение'; title.classList.add(ev.winner === 'L' ? 'win' : 'lose'); }
    else { title.textContent = 'Победил ' + (ev.winner === 'L' ? n.L : n.R); title.classList.add('win'); }
    $('result-reason').textContent = mode === 'rhythm' ? ('Точность ' + (entry.pulls.L ? Math.round(entry.beatHits.L / entry.pulls.L * 100) : 0) + '% из ' + entry.pulls.L + ' тягов') : REASONS[ev.reason] || '';
    var L = game.sides.L, R = game.sides.R;
    var pct = function (s) { return s.pulls ? Math.round(s.beatHits / s.pulls * 100) + '%' : '—'; };
    $('result-table').innerHTML = mode === 'rhythm' ? '' :
      '<tr><th></th><th>' + esc(n.L) + '</th><th>' + esc(n.R) + '</th></tr>' +
      '<tr><td>Тягов</td><td>' + L.pulls + '</td><td>' + R.pulls + '</td></tr>' +
      '<tr><td>В ритм</td><td>' + pct(L) + '</td><td>' + pct(R) + '</td></tr>' +
      '<tr><td>Рывков</td><td>' + L.surges + '</td><td>' + R.surges + '</td></tr>' +
      '<tr><td>Выдохся, с</td><td>' + L.exhaustedTime.toFixed(1) + '</td><td>' + R.exhaustedTime.toFixed(1) + '</td></tr>' +
      '<tr><td>В упоре, с</td><td>' + L.braceTime.toFixed(1) + '</td><td>' + R.braceTime.toFixed(1) + '</td></tr>';
    var seriesOver = series.target > 1 && (series.wins.L >= series.target || series.wins.R >= series.target);
    var seriesText = '';
    if (series.target > 1) {
      seriesText = 'Серия: ' + series.wins.L + ' : ' + series.wins.R;
      if (seriesOver) seriesText += ' — серию выиграл ' + (series.wins.L > series.wins.R ? n.L : n.R) + '!';
    }
    $('result-series').textContent = seriesText;
    $('btn-next-round').classList.toggle('hidden', !(series.target > 1 && !seriesOver));
    $('btn-rematch').classList.toggle('hidden', series.target > 1 && !seriesOver);
    $('btn-rematch').textContent = mode === 'rhythm' ? 'Ещё раз' : (seriesOver ? 'Новая серия' : 'Реванш');
    $('overlay-result').classList.remove('hidden');
    $('controls').classList.add('hidden'); $('beat-wrap').classList.add('hidden');
    renderer.resize();
  }

  function toMenu() {
    stopLoop(); input.enabled = false; input.releaseAll(); tutorial = null; clearTimeout(resultTimer);
    $('tutorial-box').classList.add('hidden');
    show('screen-menu'); initMenuValues();
  }

  /* ---------- Обучение ---------- */
  function startTutorial() {
    mode = 'tutorial'; series = { target: 1, wins: { L: 0, R: 0 }, round: 1 };
    show('screen-game'); renderer.resize();
    $('tutorial-box').classList.remove('hidden');
    buildGame({ matchDuration: 9999, training: true, countdown: 1 });
    $('hud-name-R').textContent = 'Тренер'; renderer.names.R = 'Тренер';
    var steps = [
      { text: 'Шаг 1. Тяни канат: нажимай A (или кнопку «Тянуть») — 6 раз. Заметь: каждый тяг тратит выносливость (зелёная полоса).', total: 6, progress: function () { return game.sides.L.pulls; } },
      { text: 'Шаг 2. Ритм. Внизу бегает курсор. Нажимай ТЯНУТЬ, когда он в зелёной зоне — попади 3 раза. Такой тяг в 1.6 раза сильнее.', total: 3, progress: function () { return game.sides.L.beatHits - this.base; }, start: function () { this.base = game.sides.L.beatHits; } },
      { text: 'Шаг 3. Упор. Ты устал — удерживай S (кнопку «Упор»), пока выносливость не поднимется до 80. В упоре нельзя тянуть, зато силы возвращаются быстро, а тяги соперника вдвое слабее.', total: 1, start: function () { game.sides.L.stamina = Math.min(game.sides.L.stamina, 25); }, progress: function () { return game.sides.L.stamina >= 80 ? 1 : 0; }, bar: function () { return Math.min(1, game.sides.L.stamina / 80); } },
      { text: 'Шаг 4. Рывок. Нажми D («Рывок»): мощный тяг за 35 выносливости с перезарядкой 4 с. Лучший момент — когда соперник выдохся, и ещё лучше — в ритм.', total: 1, progress: function () { return game.sides.L.surges; } },
      { text: 'Готово! Помни: не спамь, тяни в ритм, восстанавливайся в упоре и добивай рывком. Удачи в матче.', total: 0, done: true }
    ];
    var idx = 0, doneAt = 0;
    tutorial = {
      tick: function () {
        if (!game.isActive()) return;
        var st = steps[idx];
        if (st.done) {
          if (!doneAt) doneAt = game.time;
          if (game.time - doneAt > 3) { finishTutorial(); }
          return;
        }
        var p = st.progress();
        var frac = st.bar ? st.bar() : Math.min(1, p / st.total);
        $('tutorial-progress-fill').style.width = (frac * 100) + '%';
        if (p >= st.total) { idx++; showStep(); Sound.click(); }
      }
    };
    function showStep() {
      var st = steps[idx];
      if (st.start) st.start();
      $('tutorial-step').textContent = st.done ? 'ОБУЧЕНИЕ ПРОЙДЕНО' : 'ШАГ ' + (idx + 1) + ' ИЗ 4';
      $('tutorial-text').textContent = st.text;
      $('tutorial-progress-fill').style.width = '0%';
      if (st.done) { $('tutorial-progress-fill').style.width = '100%'; }
    }
    function finishTutorial() {
      Storage.setTutorialDone(true);
      tutorial = null;
      toMenu(); toast('Обучение пройдено. Попробуй лёгкого бота!');
    }
    $('btn-tutorial-skip').onclick = function () { Storage.setTutorialDone(true); toMenu(); };
    showStep();
    startLoop();
  }

  /* ---------- Инициализация ---------- */
  function init() {
    renderer = new Renderer($('arena'));
    input = new Input({
      onPull: function (side) { if (game) game.act(side, 'pull'); },
      onSurge: function (side) { if (game) game.act(side, 'surge'); },
      onBrace: function (side, on) { if (game) game.setBrace(side, on); }
    });
    input.bindButtons($('controls'));
    initMenu();
    window.addEventListener('resize', function () { renderer.resize(); });
    document.addEventListener('visibilitychange', function () { if (document.hidden && input) input.releaseAll(); });

    $('btn-rematch').addEventListener('click', function () {
      Sound.click();
      var seriesOver = series.target > 1 && (series.wins.L >= series.target || series.wins.R >= series.target);
      if (seriesOver || series.target === 1) series = { target: series.target, wins: { L: 0, R: 0 }, round: 1 };
      if (mode === 'rhythm') buildGame({ matchDuration: 20, training: true }); else buildGame();
    });
    $('btn-next-round').addEventListener('click', function () { Sound.click(); series.round++; buildGame(); });
    $('btn-to-menu').addEventListener('click', toMenu);
    $('btn-exit').addEventListener('click', function () {
      if (finished || !game || !game.isActive()) { toMenu(); return; }
      input.releaseAll();
      confirmDlg('Прервать матч и выйти в меню? Результат не сохранится.', function (ok) { if (ok) toMenu(); });
    });
    window.addEventListener('keydown', function (e) {
      if (e.code === 'Escape' && $('screen-game').classList.contains('active')) $('btn-exit').click();
      if ((e.code === 'Enter' || e.code === 'Space') && !$('overlay-result').classList.contains('hidden')) {
        e.preventDefault();
        var next = $('btn-next-round');
        if (!next.classList.contains('hidden')) next.click(); else $('btn-rematch').click();
      }
    });

    if (!Storage.isTutorialDone()) {
      setTimeout(function () { toast('Первый раз? Загляни в «Обучение» — это 30 секунд.'); }, 800);
    }
    // холостой рендер меню не нужен: canvas рисуется только на игровом экране
  }

  document.addEventListener('DOMContentLoaded', init);
})();
