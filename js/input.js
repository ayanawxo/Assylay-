/*
 * Ввод: клавиатура + сенсорные кнопки. Тяг засчитывается только на переход
 * «отпущено -> нажато» (авто-повтор при удержании клавиши игнорируется),
 * упор — пока кнопка удерживается.
 */
(function (root) {
  'use strict';

  var KEYMAP = {
    KeyA: { side: 'L', action: 'pull' },
    KeyS: { side: 'L', action: 'brace' },
    KeyD: { side: 'L', action: 'surge' },
    Space: { side: 'L', action: 'pull', soloOnly: true },
    ShiftLeft: { side: 'L', action: 'brace', soloOnly: true },
    KeyJ: { side: 'R', action: 'pull' },
    KeyK: { side: 'R', action: 'brace' },
    KeyL: { side: 'R', action: 'surge' },
    ArrowLeft: { side: 'R', action: 'pull', soloOnly: false },
    ArrowDown: { side: 'R', action: 'brace', soloOnly: false },
    ArrowRight: { side: 'R', action: 'surge', soloOnly: false }
  };

  function Input(handlers) {
    this.h = handlers;          // { onPull(side), onSurge(side), onBrace(side, on) }
    this.enabled = false;
    this.mode = 'bot';          // bot | pvp | training
    this.down = {};             // code -> true
    this.braceHeld = { L: 0, R: 0 }; // счётчик источников удержания
    var self = this;

    root.addEventListener('keydown', function (e) {
      if (!self.enabled) return;
      var m = KEYMAP[e.code];
      if (!m) return;
      if (self.mode !== 'pvp' && m.side === 'R') return;
      if (self.mode === 'pvp' && m.soloOnly) return;
      e.preventDefault();
      if (e.repeat || self.down[e.code]) return;  // защита от удержания/автоповтора
      self.down[e.code] = true;
      self.dispatch(m.side, m.action, true);
    });
    root.addEventListener('keyup', function (e) {
      var m = KEYMAP[e.code];
      if (!m) return;
      if (!self.down[e.code]) return;
      delete self.down[e.code];
      if (m.action === 'brace') self.dispatch(m.side, 'brace', false);
    });
    root.addEventListener('blur', function () { self.releaseAll(); });
  }

  Input.prototype.dispatch = function (side, action, pressed) {
    if (action === 'pull') { if (pressed) this.h.onPull(side); }
    else if (action === 'surge') { if (pressed) this.h.onSurge(side); }
    else if (action === 'brace') {
      this.braceHeld[side] = Math.max(0, this.braceHeld[side] + (pressed ? 1 : -1));
      this.h.onBrace(side, this.braceHeld[side] > 0);
    }
  };

  Input.prototype.releaseAll = function () {
    this.down = {};
    this.braceHeld = { L: 0, R: 0 };
    this.h.onBrace('L', false);
    this.h.onBrace('R', false);
  };

  /** Привязать сенсорные/мышиные кнопки внутри контейнера. */
  Input.prototype.bindButtons = function (container) {
    var self = this;
    var btns = container.querySelectorAll('[data-side][data-action]');
    Array.prototype.forEach.call(btns, function (btn) {
      var side = btn.getAttribute('data-side'), action = btn.getAttribute('data-action');
      var activePointer = null;
      btn.addEventListener('pointerdown', function (e) {
        if (!self.enabled) return;
        e.preventDefault();
        if (activePointer !== null) return;  // второй палец на той же кнопке не даёт второй тяг
        activePointer = e.pointerId;
        try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
        btn.classList.add('pressed');
        self.dispatch(side, action, true);
      });
      var release = function (e) {
        if (activePointer === null || (e && e.pointerId !== activePointer)) return;
        activePointer = null;
        btn.classList.remove('pressed');
        if (action === 'brace') self.dispatch(side, 'brace', false);
      };
      btn.addEventListener('pointerup', release);
      btn.addEventListener('pointercancel', release);
      btn.addEventListener('lostpointercapture', release);
      btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    });
  };

  root.Input = Input;
  root.Input.KEYMAP = KEYMAP;
})(window);
