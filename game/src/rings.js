// DAWN CANYON RUN — rings.js
// The mission course: twelve large golden rings hung along the canyon in order, each facing the
// course direction, plus the finish gate over the runway. The next ring pulses, carries a
// vertical beacon pillar of light so it can be spotted from far down the valley, and turns
// green and fades once threaded. Pass detection watches the plane cross the ring's plane
// inside its radius.
(function () {
  'use strict';

  var DCR = window.DCR || (window.DCR = {});
  var CONFIG = DCR.CONFIG;
  var MISSION = CONFIG.mission;

  // Course table: z of each ring, a sideways offset from the centreline and a height above the
  // valley floor, chosen so the line of rings sweeps with the canyon bends and climbs gently.
  var RING_COURSE = [
    { z: 620, dx: 0, dy: 30 },
    { z: 260, dx: -18, dy: 34 },
    { z: -120, dx: 14, dy: 30 },
    { z: -520, dx: -10, dy: 38 },
    { z: -900, dx: 20, dy: 33 },
    { z: -1280, dx: -22, dy: 40 },
    { z: -1640, dx: 8, dy: 32 },
    { z: -1980, dx: -14, dy: 42 },
    { z: -2300, dx: 18, dy: 34 },
    { z: -2580, dx: -8, dy: 38 },
    { z: -2840, dx: 12, dy: 32 },
    { z: -3080, dx: 0, dy: 36 },
  ];

  var rings = [];        // { mesh, beacon, position, normal, passed, fade }
  var finishGate = null; // { group, z, x, y, armedMaterial }
  var pulseTime = 0;

  function ringPosition(spec) {
    var x = CONFIG.canyonCenterX(spec.z) + spec.dx;
    var floorY = DCR.world.terrainHeightAt(x, spec.z);
    return new THREE.Vector3(x, floorY + spec.dy, spec.z);
  }

  function buildRings(scene) {
    rings = [];
    var goldMaterial = function () {
      return new THREE.MeshStandardMaterial({
        color: CONFIG.colors.ringGold, emissive: 0xa86e00, emissiveIntensity: 0.55,
        flatShading: true, roughness: 0.35, metalness: 0.35,
      });
    };
    var ringGeometry = new THREE.TorusGeometry(MISSION.ringRadius, 1.6, 10, 30);

    RING_COURSE.forEach(function (spec, index) {
      var position = ringPosition(spec);
      var heading = CONFIG.courseHeadingAt(spec.z);
      var normal = new THREE.Vector3(Math.sin(heading), 0, -Math.cos(heading));
      var mesh = new THREE.Mesh(ringGeometry, goldMaterial());
      mesh.name = 'Ring' + (index + 1);
      mesh.position.copy(position);
      mesh.rotation.y = -heading;
      scene.add(mesh);

      // Beacon: a tall, additive, double-sided pillar through the ring centre. Only the next
      // ring's beacon is lit; the rest stay hidden so the course reads one target at a time.
      var beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(2.2, 2.2, 340, 10, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xffc95e, transparent: true, opacity: 0.16,
          blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false,
        })
      );
      beacon.position.copy(position);
      beacon.visible = false;
      scene.add(beacon);

      rings.push({ mesh: mesh, beacon: beacon, position: position, normal: normal, passed: false, fade: 0 });
    });
    buildFinishGate(scene);
    return rings;
  }

  // The finish gate: two striped pylons and a glowing banner across the near end of the runway,
  // dim until all twelve rings are threaded, then lit gold with its own beacon.
  function buildFinishGate(scene) {
    var runway = CONFIG.runway;
    var group = new THREE.Group();
    group.name = 'FinishGate';
    var gateZ = runway.zNear + 24;
    var gateY = runway.groundHeight;
    var pylonMaterial = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, flatShading: true, roughness: 0.7 });
    var stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xd43a2a, flatShading: true, roughness: 0.7 });
    [-1, 1].forEach(function (side) {
      for (var i = 0; i < 5; i += 1) {
        var block = new THREE.Mesh(new THREE.BoxGeometry(1.6, 4.6, 1.6), i % 2 ? stripeMaterial : pylonMaterial);
        block.position.set(runway.centerX + side * 21, gateY + 2.3 + i * 4.6, gateZ);
        group.add(block);
      }
    });
    var bannerMaterial = new THREE.MeshStandardMaterial({
      color: 0x8a8a8a, emissive: 0x000000, flatShading: true, roughness: 0.6,
    });
    var banner = new THREE.Mesh(new THREE.BoxGeometry(43.6, 3.2, 0.8), bannerMaterial);
    banner.position.set(runway.centerX, gateY + 24.6, gateZ);
    group.add(banner);
    scene.add(group);

    var beacon = new THREE.Mesh(
      new THREE.CylinderGeometry(3, 3, 340, 10, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0x7dd7ff, transparent: true, opacity: 0.14,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, fog: false,
      })
    );
    beacon.position.set(runway.centerX, gateY + 170, gateZ);
    beacon.visible = false;
    scene.add(beacon);

    finishGate = {
      group: group, bannerMaterial: bannerMaterial, beacon: beacon,
      position: new THREE.Vector3(runway.centerX, gateY + 13, gateZ),
      z: gateZ, armed: false,
    };
    return finishGate;
  }

  // Light the next target: pulse its emissive, show its beacon, arm the gate at the end.
  function updateRingHighlights(nextIndex, dt) {
    pulseTime += dt;
    var pulse = 0.65 + Math.sin(pulseTime * 4.2) * 0.35;
    rings.forEach(function (ring, index) {
      var isNext = index === nextIndex;
      ring.beacon.visible = isNext;
      if (ring.passed) {
        if (ring.fade < 1) {
          ring.fade = Math.min(1, ring.fade + dt * 0.7);
          ring.mesh.material.opacity = 1 - ring.fade;
          ring.mesh.visible = ring.fade < 1;
        }
      } else if (isNext) {
        ring.mesh.material.emissiveIntensity = 0.6 + pulse * 0.9;
        var scale = 1 + Math.sin(pulseTime * 4.2) * 0.03;
        ring.mesh.scale.setScalar(scale);
      } else {
        ring.mesh.material.emissiveIntensity = 0.4;
        ring.mesh.scale.setScalar(1);
      }
    });
    if (finishGate) {
      finishGate.beacon.visible = finishGate.armed;
      if (finishGate.armed) {
        finishGate.bannerMaterial.emissive.setHex(0xa86e00);
        finishGate.bannerMaterial.emissiveIntensity = 0.5 + pulse * 0.6;
        finishGate.bannerMaterial.color.setHex(0xffb52e);
      }
    }
  }

  // Mark a ring threaded: green flash, then it fades away in updateRingHighlights.
  function markRingPassed(index) {
    var ring = rings[index];
    if (!ring || ring.passed) return;
    ring.passed = true;
    ring.fade = 0;
    ring.mesh.material = ring.mesh.material.clone();
    ring.mesh.material.color.setHex(CONFIG.colors.ringPassed);
    ring.mesh.material.emissive.setHex(0x1d7a3f);
    ring.mesh.material.emissiveIntensity = 0.9;
    ring.mesh.material.transparent = true;
    ring.beacon.visible = false;
  }

  // Signed distance of a point along the ring's axis: negative before the plane of the ring
  // (approaching from the south), positive once through — the course is flown northward, so a
  // pass is the sign flip from negative to positive.
  function signedDistanceToRing(index, point) {
    var ring = rings[index];
    if (!ring) return 0;
    var dx = point.x - ring.position.x;
    var dy = point.y - ring.position.y;
    var dz = point.z - ring.position.z;
    return dx * ring.normal.x + dy * ring.normal.y + dz * ring.normal.z;
  }

  // True when the plane crosses ring `index`'s plane between the last frame and this one, in
  // the course direction, and passes within the ring's radius of its centre.
  function checkRingPass(index, previousPoint, point) {
    var ring = rings[index];
    if (!ring || ring.passed) return false;
    var before = signedDistanceToRing(index, previousPoint);
    var after = signedDistanceToRing(index, point);
    if (before >= 0 || after < 0) return false;
    var radial = point.clone().sub(ring.position);
    var along = radial.dot(ring.normal);
    radial.addScaledVector(ring.normal, -along);
    return radial.length() < MISSION.ringRadius * 0.98;
  }

  function armFinishGate() {
    if (finishGate) finishGate.armed = true;
  }

  // True when the plane crosses the finish gate's z plane inside the pylons and below the
  // banner, travelling north.
  function checkFinishCrossing(previousPoint, point) {
    if (!finishGate || !finishGate.armed) return false;
    if (previousPoint.z <= finishGate.z || point.z > finishGate.z) return false;
    var runway = CONFIG.runway;
    return Math.abs(point.x - runway.centerX) < 21 && point.y < runway.groundHeight + 27;
  }

  function resetRings() {
    rings.forEach(function (ring) {
      ring.passed = false;
      ring.fade = 0;
      ring.mesh.visible = true;
      ring.mesh.material = new THREE.MeshStandardMaterial({
        color: CONFIG.colors.ringGold, emissive: 0xa86e00, emissiveIntensity: 0.55,
        flatShading: true, roughness: 0.35, metalness: 0.35,
      });
    });
    if (finishGate) {
      finishGate.armed = false;
      finishGate.bannerMaterial.emissive.setHex(0x000000);
      finishGate.bannerMaterial.color.setHex(0x8a8a8a);
      finishGate.beacon.visible = false;
    }
  }

  function getRing(index) {
    return rings[index];
  }

  function ringCount() {
    return rings.length;
  }

  DCR.rings = {
    buildRings: buildRings,
    updateRingHighlights: updateRingHighlights,
    markRingPassed: markRingPassed,
    checkRingPass: checkRingPass,
    signedDistanceToRing: signedDistanceToRing,
    armFinishGate: armFinishGate,
    checkFinishCrossing: checkFinishCrossing,
    resetRings: resetRings,
    getRing: getRing,
    ringCount: ringCount,
    course: RING_COURSE,
  };
})();
