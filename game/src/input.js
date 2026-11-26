// DAWN CANYON RUN — input.js
// Keyboard and mouse state for the flight controls. The game loop polls the axes each frame;
// discrete presses (pause, mute, restart) fire callbacks the main file registers. Mouse steering
// blends with the keys: while the pointer is over the canvas, its offset from the centre asks
// for pitch and roll toward the pointer.
(function () {
  'use strict';

  var DCR = window.DCR || (window.DCR = {});

  var keysDown = {};
  var mouse = { active: false, x: 0, y: 0 }; // x, y in [-1, 1], 0 = centre of the canvas
  var handlers = { pause: null, mute: null, restart: null, anyKey: null };

  var GAME_KEYS = {
    ArrowUp: true, ArrowDown: true, ArrowLeft: true, ArrowRight: true,
    KeyW: true, KeyS: true, KeyA: true, KeyD: true, Space: true,
  };

  function onKeyDown(event) {
    if (GAME_KEYS[event.code]) event.preventDefault();
    if (event.repeat) return;
    keysDown[event.code] = true;
    if (handlers.anyKey) handlers.anyKey(event.code);
    if (event.code === 'KeyP' || event.code === 'Escape') { if (handlers.pause) handlers.pause(); }
    if (event.code === 'KeyM') { if (handlers.mute) handlers.mute(); }
    if (event.code === 'KeyR') { if (handlers.restart) handlers.restart(); }
  }

  function onKeyUp(event) {
    keysDown[event.code] = false;
  }

  function onMouseMove(event) {
    var rect = event.target.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    mouse.active = true;
  }

  function onMouseLeave() {
    mouse.active = false;
    mouse.x = 0;
    mouse.y = 0;
  }

  function clampAxis(value) {
    return Math.max(-1, Math.min(1, value));
  }

  // Pitch stick in [-1, 1]: +1 = climb (Up arrow or pointer above centre), -1 = dive.
  function pitchInput() {
    var value = 0;
    if (keysDown.ArrowUp) value += 1;
    if (keysDown.ArrowDown) value -= 1;
    if (mouse.active && Math.abs(mouse.y) > 0.08) value += -mouse.y * 0.9;
    return clampAxis(value);
  }

  // Roll stick in [-1, 1]: +1 = bank right (Right arrow or pointer right of centre).
  function rollInput() {
    var value = 0;
    if (keysDown.ArrowRight) value += 1;
    if (keysDown.ArrowLeft) value -= 1;
    if (mouse.active && Math.abs(mouse.x) > 0.08) value += mouse.x * 0.9;
    return clampAxis(value);
  }

  // Rudder in [-1, 1]: +1 = yaw right (D), -1 = yaw left (A).
  function rudderInput() {
    var value = 0;
    if (keysDown.KeyD) value += 1;
    if (keysDown.KeyA) value -= 1;
    return value;
  }

  // Throttle lever in [-1, 1]: W pushes it up, S pulls it down.
  function throttleInput() {
    var value = 0;
    if (keysDown.KeyW) value += 1;
    if (keysDown.KeyS) value -= 1;
    return value;
  }

  function boostHeld() {
    return !!(keysDown.ShiftLeft || keysDown.ShiftRight);
  }

  function isDown(code) {
    return !!keysDown[code];
  }

  // Attach listeners; call once at boot with the canvas the mouse steers over.
  function initInput(canvas) {
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);
  }

  function on(action, handler) {
    handlers[action] = handler;
  }

  DCR.input = {
    initInput: initInput,
    on: on,
    pitchInput: pitchInput,
    rollInput: rollInput,
    rudderInput: rudderInput,
    throttleInput: throttleInput,
    boostHeld: boostHeld,
    isDown: isDown,
  };
})();
