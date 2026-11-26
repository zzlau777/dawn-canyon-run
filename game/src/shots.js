// DAWN CANYON RUN — shots.js
// Deterministic screenshot staging behind ?shot=cover|rings|bank|final. Each scene poses the
// real plane over the real seeded canyon with fixed mission numbers, exactly as a moment of
// play would look, and freezes the game (main.js parks the state machine in 'shot' mode) so
// the frame is identical on every load. The maker's screenshots are captured from these scenes
// in a real browser; nothing here draws anything the game itself would not draw.
(function () {
  'use strict';

  var DCR = window.DCR || (window.DCR = {});
  var params = new URLSearchParams(window.location.search);
  var shotName = params.get('shot');
  if (!shotName) return;

  // Position `back` metres before ring `index`, lined up on the course heading.
  function approachPose(index, back, heightOffset) {
    var ring = DCR.rings.getRing(index);
    var heading = DCR.CONFIG.courseHeadingAt(ring.position.z);
    var forward = new THREE.Vector3(Math.sin(heading), 0, -Math.cos(heading));
    var position = ring.position.clone().addScaledVector(forward, -back);
    position.y += heightOffset;
    return { position: position, heading: heading };
  }

  var SCENES = {
    // Just airborne off the runway, the strip still below, the finish gate ahead and the
    // first golden ring glowing up the valley: the whole game in one frame.
    cover: function () {
      var runway = DCR.CONFIG.runway;
      return {
        position: new THREE.Vector3(runway.centerX, runway.groundHeight + 38, runway.zNear + 210),
        heading: 0, pitch: -0.05, roll: 0.06,
        speed: 52, throttle: 0.78, verticalSpeed: 240,
        ringsPassed: 0, elapsed: 5, score: 0,
      };
    },
    // Closing on ring five over the river, four already threaded.
    rings: function () {
      var pose = approachPose(4, 62, 2);
      return {
        position: pose.position, heading: pose.heading, pitch: 0.02, roll: -0.12,
        speed: 57, throttle: 0.85, verticalSpeed: 90,
        ringsPassed: 4, elapsed: 96, score: 4000,
      };
    },
    // Hard bank into ring seven: horizon tilted, attitude ball rolled with the plane.
    bank: function () {
      var pose = approachPose(6, 58, 1);
      return {
        position: pose.position, heading: pose.heading - 0.28, pitch: 0.07, roll: 0.92,
        speed: 55, throttle: 0.8, verticalSpeed: 320,
        ringsPassed: 6, elapsed: 141, score: 6000,
      };
    },
    // All twelve rings threaded and the gate crossed: results over the runway scene.
    final: function () {
      var runway = DCR.CONFIG.runway;
      return {
        position: new THREE.Vector3(runway.centerX + 6, runway.groundHeight + 30, runway.zNear + 150),
        heading: 0, pitch: -0.02, roll: 0.05,
        speed: 44, throttle: 0.55, verticalSpeed: 0,
        ringsPassed: 12, elapsed: 192, score: 15800,
        showResults: true, grade: 'A',
      };
    },
  };

  function stage() {
    if (!DCR.game || !DCR.game.state || !DCR.rings.getRing(0)) {
      window.setTimeout(stage, 40);
      return;
    }
    var build = SCENES[shotName] || SCENES.cover;
    DCR.game.stagePose(build());
    // Let a few real frames render (propeller, beacon pulse, gauge needles all settle into
    // their staged values), then tell the screenshot harness the frame is ready.
    var frames = 0;
    function settle() {
      frames += 1;
      if (frames >= 4) {
        window.__shotReady = true;
        return;
      }
      window.requestAnimationFrame(settle);
    }
    window.requestAnimationFrame(settle);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', stage);
  } else {
    stage();
  }
})();
