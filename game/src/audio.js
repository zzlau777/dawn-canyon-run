// DAWN CANYON RUN — audio.js
// A tiny WebAudio synth: a propeller engine hum whose pitch and roughness follow RPM, a chime
// when a ring is threaded, a crash thud and a short success jingle at the finish gate. No audio
// files, no network. The context is created lazily on the first user gesture (START click), as
// browsers require; M toggles mute.
(function () {
  'use strict';

  var DCR = window.DCR || (window.DCR = {});

  var context = null;
  var masterGain = null;
  var engineOscillator = null;
  var engineSubOscillator = null;
  var engineGain = null;
  var muted = false;

  // Create the context and the always-running engine nodes. Safe to call more than once.
  function ensureAudioStarted() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return;
    }
    var AudioCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtor) return;
    context = new AudioCtor();
    masterGain = context.createGain();
    masterGain.gain.value = muted ? 0 : 0.5;
    masterGain.connect(context.destination);

    // Engine: a sawtooth for the prop buzz plus a sine an octave down for body, both through a
    // low-pass so the hum stays warm. Gain and frequency are driven per frame by setEngineRpm.
    engineOscillator = context.createOscillator();
    engineOscillator.type = 'sawtooth';
    engineSubOscillator = context.createOscillator();
    engineSubOscillator.type = 'sine';
    var engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = context.createGain();
    engineGain.gain.value = 0;
    engineOscillator.connect(engineFilter);
    engineSubOscillator.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(masterGain);
    engineOscillator.start();
    engineSubOscillator.start();
  }

  // rpm in [0, 1] (throttle-driven). Called every frame while flying.
  function setEngineRpm(rpm) {
    if (!context || !engineOscillator) return;
    var now = context.currentTime;
    var frequency = 55 + rpm * 105;
    engineOscillator.frequency.setTargetAtTime(frequency, now, 0.06);
    engineSubOscillator.frequency.setTargetAtTime(frequency * 0.5, now, 0.06);
    engineGain.gain.setTargetAtTime(0.015 + rpm * 0.11, now, 0.09);
  }

  function stopEngine() {
    if (!context || !engineGain) return;
    engineGain.gain.setTargetAtTime(0, context.currentTime, 0.08);
  }

  // One short enveloped tone; helper for the chime and the jingle notes.
  function playTone(frequency, startOffset, duration, peak, type) {
    if (!context || muted) return;
    var start = context.currentTime + startOffset;
    var oscillator = context.createOscillator();
    oscillator.type = type || 'sine';
    oscillator.frequency.value = frequency;
    var gain = context.createGain();
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(masterGain);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  // Two bright notes when a ring is threaded.
  function playRingChime() {
    playTone(1318.5, 0, 0.35, 0.22, 'sine');
    playTone(1760.0, 0.07, 0.5, 0.18, 'sine');
  }

  // A low thud when the plane hits the ground.
  function playCrashThud() {
    if (!context || muted) return;
    playTone(70, 0, 0.4, 0.5, 'triangle');
    playTone(46, 0.02, 0.55, 0.4, 'sine');
  }

  // A rising four-note arpeggio at the finish gate.
  function playFinishJingle() {
    var notes = [523.25, 659.25, 783.99, 1046.5];
    for (var i = 0; i < notes.length; i += 1) {
      playTone(notes[i], i * 0.11, 0.6, 0.2, 'triangle');
    }
    playTone(1318.5, 0.48, 0.9, 0.16, 'sine');
  }

  function setMuted(value) {
    muted = value;
    if (masterGain && context) {
      masterGain.gain.setTargetAtTime(muted ? 0 : 0.5, context.currentTime, 0.03);
    }
    return muted;
  }

  function isMuted() {
    return muted;
  }

  DCR.audio = {
    ensureAudioStarted: ensureAudioStarted,
    setEngineRpm: setEngineRpm,
    stopEngine: stopEngine,
    playRingChime: playRingChime,
    playCrashThud: playCrashThud,
    playFinishJingle: playFinishJingle,
    setMuted: setMuted,
    isMuted: isMuted,
  };
})();
