// DAWN CANYON RUN — main.js
// The game itself: boot, the flight model, the chase camera, the mission state machine
// (title -> ready -> flying -> finished, with pause and crash/respawn), scoring and grades.
// Physics is an honest arcade model: thrust fights drag and the gravity component along the
// flight path, lift holds the plane up only above the stall speed, banking turns the plane,
// and the ground is exactly the height field the terrain mesh was built from.
(function () {
  'use strict';

  var DCR = window.DCR || (window.DCR = {});
  var CONFIG = DCR.CONFIG;
  var FLIGHT = CONFIG.flight;
  var MISSION = CONFIG.mission;

  var renderer = null;
  var scene = null;
  var camera = null;
  var plane = null;
  var clock = null;

  var state = null;
  var cameraLookTarget = new THREE.Vector3();
  var previousPosition = new THREE.Vector3();
  var forwardScratch = new THREE.Vector3();

  function freshState() {
    return {
      mode: 'title',           // title | ready | flying | paused | finished | shot
      position: new THREE.Vector3(),
      heading: 0, pitch: 0, roll: 0,
      speed: 0, throttle: 0, boost: false,
      verticalSpeed: 0,
      onGround: true,
      stalling: false,
      ringsPassed: 0,
      score: 0,
      elapsed: 0,              // seconds since takeoff
      penaltySeconds: 0,       // crash penalties, folded into the displayed time
      timerStarted: false,
      crashes: 0,
      invulnerable: 0,         // seconds of crash immunity after a respawn
      orbitAngle: 0,
      finishedSnapshot: null,
    };
  }

  // Put the plane on the runway threshold, engine idling, facing north.
  function resetFlight() {
    var runway = CONFIG.runway;
    DCR.rings.resetRings();
    state.position.set(runway.centerX, runway.groundHeight + 0.3 + FLIGHT.groundClearance, runway.zFar - 60);
    state.heading = 0;
    state.pitch = 0;
    state.roll = 0;
    state.speed = 0;
    state.throttle = 0;
    state.verticalSpeed = 0;
    state.onGround = true;
    state.stalling = false;
    state.ringsPassed = 0;
    state.score = 0;
    state.elapsed = 0;
    state.penaltySeconds = 0;
    state.timerStarted = false;
    state.crashes = 0;
    state.invulnerable = 0;
    state.finishedSnapshot = null;
    previousPosition.copy(state.position);
    snapCameraBehindPlane();
  }

  function displayedTime() {
    return state.elapsed + state.penaltySeconds;
  }

  function setOverlay(id, visible) {
    document.getElementById(id).classList.toggle('hidden', !visible);
  }

  function flashMessage(text, subtext, seconds) {
    DCR.hud.showCenterMessage(text, subtext, seconds);
    document.getElementById('status').textContent = text + (subtext ? ' ' + subtext : '');
  }

  // ---- flight model ---------------------------------------------------------

  function stepFlight(dt) {
    var input = DCR.input;
    var wasOnGround = state.onGround;

    // Throttle lever.
    state.throttle = Math.max(0, Math.min(1, state.throttle + input.throttleInput() * dt * 0.55));
    state.boost = input.boostHeld() && state.throttle > 0.05;

    // Stick: control authority grows with airspeed, so the plane is mushy at a crawl and
    // crisp at cruise, like the real thing.
    var authority = Math.max(0.25, Math.min(1, state.speed / 42));
    var pitchStick = input.pitchInput();
    var rollStick = input.rollInput();
    state.pitch += pitchStick * FLIGHT.pitchRate * authority * dt;
    if (state.onGround) {
      state.pitch = Math.max(0, Math.min(0.3, state.pitch));
    } else {
      state.pitch = Math.max(-1.0, Math.min(1.0, state.pitch));
    }
    state.roll += rollStick * FLIGHT.rollRate * (0.35 + 0.65 * authority) * dt;
    state.roll = Math.max(-1.25, Math.min(1.25, state.roll));
    if (!state.onGround && Math.abs(rollStick) < 0.05) {
      // Wings drift back toward level hands-off.
      state.roll -= state.roll * Math.min(1, dt * 1.1);
    }

    // Heading: a banked wing turns the plane; the rudder adds a flat yaw.
    var turnRate = Math.sin(state.roll) * (FLIGHT.gravity / Math.max(state.speed, 16)) * FLIGHT.turnAuthority;
    state.heading += (turnRate + input.rudderInput() * FLIGHT.rudderRate * authority) * dt;

    // Speed: thrust against drag and the slope of the flight path.
    var thrust = state.throttle * FLIGHT.maxThrustAccel * (state.boost ? FLIGHT.boostMultiplier : 1);
    var drag = FLIGHT.dragCoefficient * state.speed * state.speed;
    var slope = state.onGround ? 0 : FLIGHT.gravity * Math.sin(state.pitch);
    var rolling = state.onGround && state.throttle < 0.05 ? 2.2 : 0;
    state.speed += (thrust - drag - slope - rolling) * dt;
    state.speed = Math.max(0, Math.min(FLIGHT.maxSpeed, state.speed));

    // Lift and stall: below the stall speed the wing lets go — the nose drops, the plane
    // sinks, and the HUD shouts about it.
    var lift = CONFIG.smoothstep(FLIGHT.stallSpeed * 0.82, FLIGHT.stallSpeed * 1.3, state.speed);
    state.stalling = !state.onGround && state.speed < FLIGHT.stallSpeed;
    if (state.stalling) {
      state.pitch -= dt * 0.5 * (1 - state.speed / FLIGHT.stallSpeed);
      state.pitch = Math.max(-0.55, state.pitch);
    }

    DCR.aircraft.forwardVector(state.heading, state.pitch, forwardScratch);
    var sink = state.onGround ? 0 : (1 - lift) * 13;
    state.verticalSpeed = forwardScratch.y * state.speed - sink;

    previousPosition.copy(state.position);
    state.position.addScaledVector(forwardScratch, state.speed * dt);
    state.position.y -= sink * dt;

    // Soft ceiling: thin air up there, the plane just stops climbing.
    if (state.position.y > FLIGHT.ceiling) state.position.y = FLIGHT.ceiling;

    handleGroundContact(wasOnGround);
    if (state.mode !== 'flying' && state.mode !== 'ready') return;

    // Timer runs from takeoff.
    if (!state.onGround && !state.timerStarted) state.timerStarted = true;
    if (state.timerStarted) state.elapsed += dt;
    if (state.invulnerable > 0) state.invulnerable -= dt;

    checkMissionProgress();
    DCR.audio.setEngineRpm(state.throttle * (state.boost ? 1 : 0.92));
  }

  function runwaySurfaceAt(x, z) {
    var runway = CONFIG.runway;
    var onStrip = Math.abs(x - runway.centerX) < runway.width / 2 + 3 &&
      z > runway.zNear - 6 && z < runway.zFar + 6;
    return onStrip ? runway.groundHeight + 0.3 : null;
  }

  function handleGroundContact(wasOnGround) {
    var x = state.position.x;
    var z = state.position.z;
    var stripHeight = runwaySurfaceAt(x, z);
    var groundHeight = stripHeight !== null ? stripHeight : DCR.world.terrainHeightAt(x, z);
    var floorY = groundHeight + FLIGHT.groundClearance;

    // Rolling on the strip: pinned to the surface until rotation speed with the nose up.
    if (wasOnGround && stripHeight !== null) {
      if (state.speed > FLIGHT.stallSpeed * 1.08 && state.pitch >= 0.13) {
        state.onGround = false;
        return;
      }
      state.position.y = floorY;
      state.verticalSpeed = 0;
      state.onGround = true;
      return;
    }

    if (state.position.y > floorY) {
      state.onGround = false;
      return;
    }
    // Touching. A gentle arrival on the strip is a landing; anything else is a crash.
    var gentle = state.verticalSpeed > -9.5 && state.pitch > -0.18;
    if (stripHeight !== null && gentle) {
      state.position.y = floorY;
      state.verticalSpeed = 0;
      state.onGround = true;
      if (!wasOnGround && state.timerStarted &&
          state.ringsPassed >= MISSION.ringCount && state.speed < 9) {
        finishMission();
      }
      return;
    }
    state.position.y = floorY;
    if (state.invulnerable <= 0 && (state.speed > 6 || !state.onGround)) {
      crashPlane();
    } else {
      state.onGround = true;
    }
  }

  // Crash: a thud, ten seconds on the clock, and a respawn at the last ring threaded (or back
  // on the runway if none), already moving at a safe speed.
  function crashPlane() {
    state.crashes += 1;
    state.penaltySeconds += MISSION.crashPenaltySeconds;
    DCR.audio.playCrashThud();
    flashMessage('CRASHED', '+' + MISSION.crashPenaltySeconds + 's penalty — back to the last ring', 2.4);
    var runway = CONFIG.runway;
    if (state.ringsPassed > 0) {
      var ring = DCR.rings.getRing(state.ringsPassed - 1);
      state.position.copy(ring.position);
      state.position.z += 26;
      state.position.y += 4;
      state.heading = CONFIG.courseHeadingAt(ring.position.z);
    } else {
      state.position.set(runway.centerX, runway.groundHeight + 0.3 + FLIGHT.groundClearance + 26, runway.zFar - 200);
      state.heading = 0;
    }
    state.pitch = 0;
    state.roll = 0;
    state.speed = FLIGHT.cruiseSpeed * 0.85;
    state.throttle = 0.6;
    state.onGround = false;
    state.invulnerable = 1.6;
    previousPosition.copy(state.position);
    snapCameraBehindPlane();
  }

  function checkMissionProgress() {
    if (state.ringsPassed < MISSION.ringCount) {
      var index = state.ringsPassed;
      if (DCR.rings.checkRingPass(index, previousPosition, state.position)) {
        state.ringsPassed += 1;
        state.score += MISSION.ringPoints;
        DCR.rings.markRingPassed(index);
        DCR.audio.playRingChime();
        if (state.ringsPassed >= MISSION.ringCount) {
          DCR.rings.armFinishGate();
          flashMessage('ALL RINGS!', 'Dive through the finish gate over the runway', 2.6);
        } else {
          flashMessage('RING ' + state.ringsPassed, '+' + MISSION.ringPoints, 1.6);
        }
      }
      return;
    }
    if (DCR.rings.checkFinishCrossing(previousPosition, state.position)) finishMission();
  }

  function gradeForTime(seconds) {
    if (seconds <= MISSION.gradeS) return 'S';
    if (seconds <= MISSION.gradeA) return 'A';
    if (seconds <= MISSION.gradeB) return 'B';
    return 'C';
  }

  function finishMission() {
    if (state.mode === 'finished') return;
    state.mode = 'finished';
    var time = displayedTime();
    var bonus = Math.max(0, Math.round((MISSION.parSeconds - time) * MISSION.timeBonusPerSecond));
    state.score += bonus;
    state.finishedSnapshot = {
      time: time, bonus: bonus, grade: gradeForTime(time), score: state.score,
    };
    document.getElementById('finalTime').textContent = DCR.hud.formatClock(time);
    document.getElementById('finalRings').textContent = state.ringsPassed + '/' + MISSION.ringCount;
    document.getElementById('finalScore').textContent = String(state.score) + (bonus ? '  (incl. +' + bonus + ' time bonus)' : '');
    document.getElementById('finalGrade').textContent = state.finishedSnapshot.grade;
    setOverlay('resultsScreen', true);
    DCR.audio.playFinishJingle();
    flashMessage('MISSION COMPLETE', 'Grade ' + state.finishedSnapshot.grade, 3);
  }

  // In the finished state the plane flies on hands-off while the results card is up.
  function stepFinished(dt) {
    state.pitch -= state.pitch * Math.min(1, dt * 1.5);
    state.roll -= state.roll * Math.min(1, dt * 1.5);
    state.throttle = 0.5;
    state.speed += (FLIGHT.cruiseSpeed - state.speed) * Math.min(1, dt * 0.4);
    DCR.aircraft.forwardVector(state.heading, state.pitch, forwardScratch);
    previousPosition.copy(state.position);
    state.position.addScaledVector(forwardScratch, state.speed * dt);
    var floorY = DCR.world.terrainHeightAt(state.position.x, state.position.z) + FLIGHT.groundClearance + 12;
    if (state.position.y < floorY) state.position.y = floorY;
    DCR.audio.setEngineRpm(0.45);
  }

  // ---- title orbit ----------------------------------------------------------

  function stepTitleOrbit(dt) {
    state.orbitAngle += dt * 0.11;
    var runway = CONFIG.runway;
    var centreX = runway.centerX + 30;
    var centreZ = 980;
    var radius = 300;
    var a = state.orbitAngle;
    state.position.set(centreX + Math.sin(a) * radius, 0, centreZ + Math.cos(a) * radius);
    state.position.y = DCR.world.terrainHeightAt(state.position.x, state.position.z) + 74;
    var vx = Math.cos(a);
    var vz = -Math.sin(a);
    state.heading = Math.atan2(vx, -vz);
    state.pitch = 0.02;
    state.roll = 0.3;
    state.speed = FLIGHT.cruiseSpeed;
    state.throttle = 0.62;
  }

  // ---- camera ---------------------------------------------------------------

  function chaseOffset(out) {
    var euler = new THREE.Euler(state.pitch * 0.38, -state.heading, 0, 'YXZ');
    var quaternion = new THREE.Quaternion().setFromEuler(euler);
    out.set(0, 3.6, 11.8).applyQuaternion(quaternion);
    return out;
  }

  var offsetScratch = new THREE.Vector3();
  var desiredScratch = new THREE.Vector3();

  // The camera inherits a share of the plane's bank, so a hard turn tilts the horizon in the
  // frame the way it does from a real chase plane.
  var CAMERA_ROLL_SHARE = 0.5;

  function snapCameraBehindPlane() {
    chaseOffset(offsetScratch);
    camera.position.copy(state.position).add(offsetScratch);
    DCR.aircraft.forwardVector(state.heading, state.pitch, forwardScratch);
    cameraLookTarget.copy(state.position).addScaledVector(forwardScratch, 16);
    cameraLookTarget.y += 1.4;
    camera.lookAt(cameraLookTarget);
    camera.rotateZ(-state.roll * CAMERA_ROLL_SHARE);
  }

  function updateCamera(dt) {
    chaseOffset(offsetScratch);
    desiredScratch.copy(state.position).add(offsetScratch);
    var blend = 1 - Math.exp(-dt * 4.2);
    camera.position.lerp(desiredScratch, blend);
    DCR.aircraft.forwardVector(state.heading, state.pitch, forwardScratch);
    desiredScratch.copy(state.position).addScaledVector(forwardScratch, 16);
    desiredScratch.y += 1.4;
    cameraLookTarget.lerp(desiredScratch, 1 - Math.exp(-dt * 6));
    camera.lookAt(cameraLookTarget);
    camera.rotateZ(-state.roll * CAMERA_ROLL_SHARE);
    var targetFov = 60 + (state.speed / FLIGHT.maxSpeed) * 13;
    if (Math.abs(camera.fov - targetFov) > 0.05) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 3);
      camera.updateProjectionMatrix();
    }
  }

  // ---- HUD snapshot ---------------------------------------------------------

  function buildFlightSnapshot() {
    var target = null;
    var label = 'FINISH GATE';
    if (state.ringsPassed < MISSION.ringCount) {
      target = DCR.rings.getRing(state.ringsPassed).position;
      label = 'NEXT RING';
    } else if (state.mode !== 'finished') {
      target = new THREE.Vector3(CONFIG.runway.centerX, CONFIG.runway.groundHeight + 13, CONFIG.runway.zNear + 24);
    }
    var distance = 0;
    var relativeBearing = 0;
    if (target) {
      var dx = target.x - state.position.x;
      var dz = target.z - state.position.z;
      distance = Math.sqrt(dx * dx + dz * dz + Math.pow(target.y - state.position.y, 2));
      var bearing = Math.atan2(dx, -dz);
      relativeBearing = (bearing - state.heading) * 180 / Math.PI;
    }
    return {
      altitudeFeet: Math.max(0, state.position.y * 3.28084),
      speedKnots: state.speed * 1.94384,
      stallKnots: FLIGHT.stallSpeed * 1.94384,
      headingDeg: ((state.heading * 180 / Math.PI) % 360 + 360) % 360,
      verticalFpm: state.verticalSpeed * 196.85,
      pitch: state.pitch,
      roll: state.roll,
      throttle: state.throttle,
      rpm: Math.min(1, state.throttle * (state.boost ? 1.12 : 1)),
      boost: state.boost,
      ringsPassed: state.ringsPassed,
      ringTotal: MISSION.ringCount,
      elapsedSeconds: displayedTime(),
      score: state.score,
      nextTargetLabel: label,
      nextTargetDistance: distance,
      nextTargetBearingDeg: relativeBearing,
      stalling: state.stalling,
    };
  }

  // ---- mode flow ------------------------------------------------------------

  function startMission() {
    DCR.audio.ensureAudioStarted();
    resetFlight();
    state.mode = 'ready';
    setOverlay('titleScreen', false);
    setOverlay('resultsScreen', false);
    setOverlay('pauseScreen', false);
    DCR.hud.setHudVisible(true);
    flashMessage('TAKE OFF', 'W for throttle — thread all 12 rings', 2.4);
  }

  function togglePause() {
    if (state.mode === 'flying' || state.mode === 'ready') {
      state.mode = 'paused';
      setOverlay('pauseScreen', true);
      DCR.audio.stopEngine();
    } else if (state.mode === 'paused') {
      state.mode = state.timerStarted ? 'flying' : 'ready';
      setOverlay('pauseScreen', false);
      DCR.audio.ensureAudioStarted();
    }
  }

  function toggleMute() {
    var muted = DCR.audio.setMuted(!DCR.audio.isMuted());
    flashMessage(muted ? 'SOUND OFF' : 'SOUND ON', '', 1.1);
  }

  // ---- boot and loop ----------------------------------------------------------

  function boot() {
    var canvas = document.getElementById('gameCanvas');
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.5, 14000);
    camera.position.set(0, 80, 1500);

    DCR.world.buildWorld(scene);
    plane = DCR.aircraft.buildAircraft();
    scene.add(plane);
    DCR.rings.buildRings(scene);
    DCR.hud.initHud();
    DCR.input.initInput(canvas);
    DCR.input.on('pause', togglePause);
    DCR.input.on('mute', toggleMute);
    DCR.input.on('restart', function () {
      if (state.mode === 'flying' || state.mode === 'ready' || state.mode === 'finished') startMission();
    });
    document.getElementById('startButton').addEventListener('click', startMission);
    document.getElementById('resumeButton').addEventListener('click', togglePause);
    document.getElementById('restartButton').addEventListener('click', startMission);
    window.addEventListener('resize', function () {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    state = freshState();
    resetFlight();
    state.mode = 'title';
    DCR.game.state = state;
    clock = new THREE.Clock();
    renderer.setAnimationLoop(tick);
  }

  function tick() {
    var dt = Math.min(clock.getDelta(), 0.05);
    if (state.mode === 'title') {
      stepTitleOrbit(dt);
    } else if (state.mode === 'ready' || state.mode === 'flying') {
      if (state.mode === 'ready' && !state.onGround) state.mode = 'flying';
      stepFlight(dt);
    } else if (state.mode === 'finished') {
      stepFinished(dt);
    }
    if (state.mode !== 'paused' && state.mode !== 'shot') {
      DCR.aircraft.orientAircraft(plane, state.heading, state.pitch, state.roll);
      plane.position.copy(state.position);
      DCR.aircraft.spinPropeller(state.throttle, dt);
      DCR.rings.updateRingHighlights(state.ringsPassed, dt);
      updateCamera(dt);
    }
    if (state.mode === 'ready' || state.mode === 'flying' || state.mode === 'finished') {
      DCR.hud.updateHud(buildFlightSnapshot());
    }
    renderer.render(scene, camera);
  }

  // Hooks the screenshot staging in shots.js drives: pose the plane, set the mission numbers,
  // and render one composed frame.
  function stagePose(options) {
    if (!state) return;
    state.mode = 'shot';
    setOverlay('titleScreen', false);
    setOverlay('pauseScreen', false);
    setOverlay('resultsScreen', !!options.showResults);
    DCR.hud.setHudVisible(true);
    DCR.rings.resetRings();
    for (var i = 0; i < options.ringsPassed; i += 1) DCR.rings.markRingPassed(i);
    if (options.ringsPassed >= MISSION.ringCount) DCR.rings.armFinishGate();
    state.ringsPassed = options.ringsPassed;
    state.position.copy(options.position);
    state.heading = options.heading;
    state.pitch = options.pitch;
    state.roll = options.roll;
    state.speed = options.speed;
    state.throttle = options.throttle;
    state.verticalSpeed = options.verticalSpeed || 0;
    state.elapsed = options.elapsed;
    state.penaltySeconds = 0;
    state.score = options.score;
    state.stalling = !!options.stalling;
    state.boost = !!options.boost;
    state.onGround = false;
    if (options.showResults) {
      state.finishedSnapshot = { time: options.elapsed, bonus: 0, grade: options.grade, score: options.score };
      document.getElementById('finalTime').textContent = DCR.hud.formatClock(options.elapsed);
      document.getElementById('finalRings').textContent = options.ringsPassed + '/' + MISSION.ringCount;
      document.getElementById('finalScore').textContent = String(options.score);
      document.getElementById('finalGrade').textContent = options.grade;
    }
    DCR.aircraft.orientAircraft(plane, state.heading, state.pitch, state.roll);
    DCR.aircraft.setPropellerAngle(0.7);
    plane.position.copy(state.position);
    DCR.rings.updateRingHighlights(state.ringsPassed, 0.9);
    snapCameraBehindPlane();
    DCR.hud.updateHud(buildFlightSnapshot());
    renderer.render(scene, camera);
  }

  DCR.game = {
    boot: boot,
    state: null, // replaced below once boot runs
    stagePose: stagePose,
    startMission: startMission,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
