/* Отрисовка сцены на canvas. Не меняет состояние игры — только читает его. */
(function (root) {
  'use strict';

  var THEMES = {
    yard: {
      name: 'Школьный двор', pro: false,
      sky: ['#8fd3ff', '#dff3ff'], ground: '#7cb342', groundDark: '#5d8f2f', line: '#fff',
      rope: '#c9a46b', ropeDark: '#8a6a3a', flag: '#ff3d57',
      teamL: '#2f7cf6', teamR: '#f6512f', skin: '#f5cba7', accent: '#ffcc00', decor: 'school'
    },
    stadium: {
      name: 'Ночной стадион', pro: true,
      sky: ['#0b1a3a', '#1d3b78'], ground: '#2e8b57', groundDark: '#1f6b41', line: '#e8f0ff',
      rope: '#e0d3b8', ropeDark: '#8f8266', flag: '#ffd400',
      teamL: '#38bdf8', teamR: '#fb7185', skin: '#f5cba7', accent: '#ffd400', decor: 'lights'
    },
    beach: {
      name: 'Пляж', pro: true,
      sky: ['#ffb36b', '#ffe6c2'], ground: '#f2d49b', groundDark: '#d9b877', line: '#7a5c2e',
      rope: '#6b4a2a', ropeDark: '#3f2a14', flag: '#2fb37c',
      teamL: '#0ea5e9', teamR: '#ef4444', skin: '#e8b88a', accent: '#ff7a00', decor: 'sea'
    }
  };

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.W = 960; this.H = 440;
    this.theme = THEMES.yard;
    this.popups = [];
    this.particles = [];
    this.shake = 0;
    this.pulse = { L: 0, R: 0 };
    this.names = { L: 'Игрок', R: 'Компьютер' };
    this.resize();
  }

  Renderer.THEMES = THEMES;

  Renderer.prototype.setTheme = function (key) { this.theme = THEMES[key] || THEMES.yard; };

  Renderer.prototype.resize = function () {
    var rect = this.canvas.getBoundingClientRect();
    var dpr = Math.min(root.devicePixelRatio || 1, 2);
    var w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
    if (this.canvas.width !== w * dpr || this.canvas.height !== h * dpr) {
      this.canvas.width = w * dpr; this.canvas.height = h * dpr;
    }
    this.scale = Math.min(w / this.W, h / this.H);
    this.offX = (w - this.W * this.scale) / 2;
    this.offY = (h - this.H * this.scale) / 2;
    this.dpr = dpr;
  };

  Renderer.prototype.handleEvents = function (events, game) {
    var self = this;
    events.forEach(function (ev) {
      var x = self.ropeX(game.pos);
      if (ev.type === 'pull') {
        self.pulse[ev.side] = 1;
        if (ev.onBeat) self.popup(x + (ev.side === 'L' ? -90 : 90), 210, 'В РИТМ!', '#ffd400', 1.1);
        if (ev.damped) self.popup(x + (ev.side === 'L' ? -90 : 90), 250, 'УПОР', '#cbd5e1', 0.6);
      } else if (ev.type === 'surge') {
        self.pulse[ev.side] = 1.6; self.shake = 8;
        self.popup(x + (ev.side === 'L' ? -90 : 90), 200, ev.onBeat ? 'РЫВОК ×РИТМ!' : 'РЫВОК!', ev.onBeat ? '#ffd400' : '#fff', 1.3);
        self.burst(x, 330, ev.side === 'L' ? -1 : 1);
      } else if (ev.type === 'exhausted') {
        self.popup(x + (ev.side === 'L' ? -160 : 160), 230, 'ВЫДОХСЯ', '#ff5c5c', 1.4);
      } else if (ev.type === 'recovered') {
        self.popup(x + (ev.side === 'L' ? -160 : 160), 230, 'СНОВА В СТРОЮ', '#8ef58e', 1.0);
      } else if (ev.type === 'denied' && ev.action === 'surge') {
        self.popup(x + (ev.side === 'L' ? -90 : 90), 240, ev.why === 'cooldown' ? 'ПЕРЕЗАРЯДКА' : (ev.why === 'stamina' ? 'НЕТ СИЛ' : 'В УПОРЕ'), '#ffb4b4', 0.7);
      } else if (ev.type === 'overtime') {
        self.popup(480, 120, 'ОВЕРТАЙМ! Граница ближе', '#ffd400', 2.2);
      }
    });
  };

  Renderer.prototype.popup = function (x, y, text, color, ttl) {
    this.popups.push({ x: x, y: y, text: text, color: color, ttl: ttl, max: ttl });
    if (this.popups.length > 12) this.popups.shift();
  };

  Renderer.prototype.burst = function (x, y, dir) {
    for (var i = 0; i < 18; i++) {
      this.particles.push({ x: x, y: y, vx: (Math.random() * 200 + 60) * dir * (Math.random() < 0.2 ? -0.4 : 1), vy: -Math.random() * 180 - 40, ttl: 0.7 + Math.random() * 0.4, r: 2 + Math.random() * 3 });
    }
  };

  Renderer.prototype.ropeX = function (pos) { return this.W / 2 + pos * 3.0; };

  Renderer.prototype.update = function (dt) {
    for (var i = this.popups.length - 1; i >= 0; i--) { var p = this.popups[i]; p.ttl -= dt; p.y -= 28 * dt; if (p.ttl <= 0) this.popups.splice(i, 1); }
    for (var j = this.particles.length - 1; j >= 0; j--) { var q = this.particles[j]; q.ttl -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 500 * dt; if (q.ttl <= 0) this.particles.splice(j, 1); }
    this.pulse.L = Math.max(0, this.pulse.L - dt * 4);
    this.pulse.R = Math.max(0, this.pulse.R - dt * 4);
    this.shake = Math.max(0, this.shake - dt * 30);
  };

  Renderer.prototype.draw = function (game, now) {
    var c = this.ctx, T = this.theme, W = this.W, H = this.H;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.translate(this.offX, this.offY);
    c.scale(this.scale, this.scale);
    if (this.shake > 0) c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);

    // Видимая область в логических координатах (холст может быть выше/шире сцены)
    var vx0 = -this.offX / this.scale, vy0 = -this.offY / this.scale;
    var vw = this.canvas.width / this.dpr / this.scale, vh = this.canvas.height / this.dpr / this.scale;
    var vx1 = vx0 + vw, vy1 = vy0 + vh;

    // Небо и фон
    var g = c.createLinearGradient(0, vy0, 0, H);
    g.addColorStop(0, T.sky[0]); g.addColorStop(1, T.sky[1]);
    c.fillStyle = g; c.fillRect(vx0 - 2, vy0 - 2, vw + 4, vh + 4);
    this.drawDecor(c, T, now);

    // Земля
    var groundY = 330;
    c.fillStyle = T.ground; c.fillRect(vx0 - 2, groundY, vw + 4, vy1 - groundY + 2);
    c.fillStyle = T.groundDark; c.fillRect(vx0 - 2, groundY, vw + 4, 6);

    // Линии границ и центр
    var boundary = game.currentBoundary();
    var bl = this.ropeX(-boundary), br = this.ropeX(boundary), cx = this.ropeX(0);
    c.strokeStyle = T.line; c.lineWidth = 4; c.setLineDash([]);
    [bl, br].forEach(function (x) { c.beginPath(); c.moveTo(x, groundY + 4); c.lineTo(x, vy1); c.stroke(); });
    c.globalAlpha = 0.5; c.setLineDash([10, 8]); c.lineWidth = 2;
    c.beginPath(); c.moveTo(cx, groundY + 4); c.lineTo(cx, vy1); c.stroke();
    c.setLineDash([]); c.globalAlpha = 1;
    // Полосы «своя зона» у границ
    c.globalAlpha = 0.18;
    c.fillStyle = T.teamL; c.fillRect(vx0 - 2, groundY + 6, bl - vx0 + 2, vy1 - groundY);
    c.fillStyle = T.teamR; c.fillRect(br, groundY + 6, vx1 - br + 2, vy1 - groundY);
    c.globalAlpha = 1;

    // Канат
    var rx = this.ropeX(game.pos), ropeY = 300;
    var sag = 10 + Math.abs(game.vel) * 0.05;
    c.lineWidth = 12; c.strokeStyle = T.ropeDark; c.lineCap = 'round';
    c.beginPath(); c.moveTo(rx - 330, ropeY); c.quadraticCurveTo(rx, ropeY + sag, rx + 330, ropeY); c.stroke();
    c.lineWidth = 8; c.strokeStyle = T.rope;
    c.beginPath(); c.moveTo(rx - 330, ropeY); c.quadraticCurveTo(rx, ropeY + sag, rx + 330, ropeY); c.stroke();
    // Штрихи плетения
    c.strokeStyle = T.ropeDark; c.lineWidth = 2; c.globalAlpha = 0.5;
    for (var i = -320; i <= 320; i += 14) {
      var t = (i + 330) / 660; var yy = ropeY + 2 * (1 - t) * t * sag;
      c.beginPath(); c.moveTo(rx + i - 3, yy - 4); c.lineTo(rx + i + 3, yy + 4); c.stroke();
    }
    c.globalAlpha = 1;
    // Флажок-отметка
    c.fillStyle = T.flag;
    c.beginPath(); c.moveTo(rx, ropeY + sag / 2 - 2); c.lineTo(rx, ropeY + sag / 2 - 40); c.lineTo(rx + 26, ropeY + sag / 2 - 31); c.lineTo(rx, ropeY + sag / 2 - 22); c.closePath(); c.fill();
    c.strokeStyle = '#222'; c.lineWidth = 3; c.beginPath(); c.moveTo(rx, ropeY + sag / 2 + 4); c.lineTo(rx, ropeY + sag / 2 - 40); c.stroke();

    // Команды
    this.drawTeam(c, game, 'L', rx, groundY, now);
    this.drawTeam(c, game, 'R', rx, groundY, now);

    // Частицы
    c.fillStyle = 'rgba(120,90,50,0.6)';
    this.particles.forEach(function (p) { c.globalAlpha = Math.max(0, p.ttl); c.beginPath(); c.arc(p.x, p.y, p.r, 0, Math.PI * 2); c.fill(); });
    c.globalAlpha = 1;

    // Всплывающие подписи
    c.textAlign = 'center'; c.font = 'bold 22px "Segoe UI", Roboto, Arial, sans-serif';
    this.popups.forEach(function (p) {
      c.globalAlpha = Math.min(1, p.ttl / p.max * 2);
      c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.6)'; c.strokeText(p.text, p.x, p.y);
      c.fillStyle = p.color; c.fillText(p.text, p.x, p.y);
    });
    c.globalAlpha = 1;

    // Подписи зон
    c.font = 'bold 14px "Segoe UI", Roboto, Arial, sans-serif'; c.fillStyle = 'rgba(255,255,255,0.85)';
    c.textAlign = 'left'; c.fillText('◀ победа ' + this.names.L, 12, groundY + 28);
    c.textAlign = 'right'; c.fillText('победа ' + this.names.R + ' ▶', W - 12, groundY + 28);

    // Финиш / обратный отсчёт рисуются DOM-оверлеями
  };

  Renderer.prototype.drawDecor = function (c, T, now) {
    var W = this.W;
    if (T.decor === 'school') {
      // солнце и облака
      c.fillStyle = '#fff59d'; c.beginPath(); c.arc(820, 70, 36, 0, Math.PI * 2); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.9)';
      [[120, 80, 1], [420, 50, 0.8], [660, 110, 0.7]].forEach(function (cl) {
        var x = cl[0] + Math.sin(now / 4000 + cl[0]) * 10, y = cl[1], s = cl[2];
        c.beginPath(); c.arc(x, y, 22 * s, 0, Math.PI * 2); c.arc(x + 28 * s, y - 8 * s, 28 * s, 0, Math.PI * 2); c.arc(x + 60 * s, y, 22 * s, 0, Math.PI * 2); c.fill();
      });
      // школа вдалеке
      c.fillStyle = '#e8b78a'; c.fillRect(60, 220, 220, 110); c.fillStyle = '#b5563b'; c.fillRect(50, 205, 240, 18);
      c.fillStyle = '#7dd3fc'; for (var i = 0; i < 4; i++) c.fillRect(80 + i * 52, 240, 30, 30);
      c.fillStyle = '#6b4f2a'; c.fillRect(160, 285, 30, 45);
      // забор справа
      c.fillStyle = '#d7ccc8'; for (var j = 0; j < 12; j++) c.fillRect(700 + j * 22, 280, 10, 50);
      c.fillRect(700, 290, 264, 6); c.fillRect(700, 312, 264, 6);
    } else if (T.decor === 'lights') {
      c.fillStyle = 'rgba(255,255,255,0.8)';
      for (var k = 0; k < 40; k++) { var sx = (k * 137) % W, sy = (k * 71) % 200; c.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(now / 700 + k)); c.fillRect(sx, sy, 2, 2); }
      c.globalAlpha = 1;
      // трибуны
      c.fillStyle = '#243b6b'; c.fillRect(-600, 200, W + 1200, 130);
      for (var r = 0; r < 4; r++) { c.fillStyle = r % 2 ? '#2e4a85' : '#1c325e'; c.fillRect(-600, 200 + r * 32, W + 1200, 32); }
      // прожекторы
      [140, 820].forEach(function (x) {
        c.fillStyle = '#8899bb'; c.fillRect(x - 4, 60, 8, 270); c.fillStyle = '#ffffcc';
        c.globalAlpha = 0.9; c.fillRect(x - 40, 50, 80, 20);
        c.globalAlpha = 0.12; c.beginPath(); c.moveTo(x - 40, 70); c.lineTo(x + 40, 70); c.lineTo(x + 260 * (x < 480 ? 1 : -1), 330); c.lineTo(x - 260 * (x < 480 ? 1 : -1) * 0.2, 330); c.closePath(); c.fill();
        c.globalAlpha = 1;
      });
    } else if (T.decor === 'sea') {
      c.fillStyle = '#ffb347'; c.beginPath(); c.arc(760, 190, 60, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#3aa7d6'; c.fillRect(-600, 200, W + 1200, 130);
      c.fillStyle = 'rgba(255,255,255,0.35)';
      for (var w = 0; w < 6; w++) { var wx = ((now / 30 + w * 180) % (W + 200)) - 100; c.fillRect(wx, 230 + w * 15, 80, 3); }
      // пальма
      c.fillStyle = '#8b5a2b'; c.fillRect(120, 150, 14, 180);
      c.fillStyle = '#2e9e4f';
      for (var a = 0; a < 6; a++) { c.beginPath(); c.ellipse(127, 150, 70, 16, a * Math.PI / 6, 0, Math.PI * 2); c.fill(); }
    }
  };

  Renderer.prototype.drawTeam = function (c, game, side, rx, groundY, now) {
    var T = this.theme, dir = side === 'L' ? -1 : 1, s = game.sides[side];
    var color = side === 'L' ? T.teamL : T.teamR;
    var pulse = this.pulse[side];
    var active = game.isActive();
    var sinceAction = game.time - s.lastPullAt;
    var pulling = active && sinceAction < 0.35;
    var lean = 0;
    if (s.bracing) lean = 0.55;               // сильно откинулся назад, ноги упёрты
    else if (pulling) lean = 0.35 + pulse * 0.25;
    else if (s.exhausted) lean = -0.15;       // сгорбился вперёд
    else lean = 0.18;
    var bob = Math.sin(now / 250 + (side === 'L' ? 0 : 1)) * (s.exhausted ? 3 : 1.5);

    for (var i = 0; i < 3; i++) {
      var x = rx + dir * (55 + i * 48);
      var y = groundY + bob;
      var l = lean * (1 - i * 0.08);
      var hipX = x, hipY = y - 48;
      var shoulderX = hipX + dir * Math.sin(l) * 40 * -1, shoulderY = hipY - Math.cos(l) * 40;
      var headX = shoulderX - dir * Math.sin(l) * 14, headY = shoulderY - 14;
      // тень
      c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath(); c.ellipse(x, y + 2, 22, 6, 0, 0, Math.PI * 2); c.fill();
      // ноги
      c.strokeStyle = '#1f2937'; c.lineWidth = 7; c.lineCap = 'round';
      var spread = s.bracing ? 26 : 16;
      c.beginPath(); c.moveTo(hipX, hipY); c.lineTo(x - dir * spread, y); c.stroke();
      c.beginPath(); c.moveTo(hipX, hipY); c.lineTo(x + dir * (spread * 0.6), y); c.stroke();
      // тело
      c.strokeStyle = color; c.lineWidth = 14;
      c.beginPath(); c.moveTo(hipX, hipY); c.lineTo(shoulderX, shoulderY); c.stroke();
      // руки к канату
      c.strokeStyle = T.skin; c.lineWidth = 6;
      var gripX = rx + dir * (30 + i * 48), gripY = 300 + 4;
      c.beginPath(); c.moveTo(shoulderX, shoulderY + 4); c.lineTo(gripX, gripY); c.stroke();
      c.beginPath(); c.moveTo(shoulderX, shoulderY + 10); c.lineTo(gripX + dir * 8, gripY + 2); c.stroke();
      // голова
      c.fillStyle = T.skin; c.beginPath(); c.arc(headX, headY, 12, 0, Math.PI * 2); c.fill();
      // повязка цвета команды
      c.strokeStyle = color; c.lineWidth = 4; c.beginPath(); c.arc(headX, headY - 3, 12, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
      // выражение: пот при истощении
      if (s.exhausted && i === 0) {
        c.fillStyle = '#7dd3fc'; c.beginPath(); c.arc(headX + dir * 14, headY - 4 + (now / 60) % 12, 3, 0, Math.PI * 2); c.fill();
      }
    }
    // индикатор упора
    if (s.bracing) {
      c.fillStyle = 'rgba(255,255,255,0.9)'; c.font = 'bold 16px "Segoe UI", Roboto, Arial, sans-serif'; c.textAlign = 'center';
      c.fillText('УПОР', rx + dir * 150, groundY - 110);
    }
  };

  root.Renderer = Renderer;
})(window);
