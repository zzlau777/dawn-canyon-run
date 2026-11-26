// DAWN CANYON RUN — config.js
// Every tuning constant for the game lives here: world size, the canyon course, flight model
// numbers, scoring and the dawn palette. The other files read these through the shared DCR
// namespace so a classic <script> page needs no modules or build step.
(function () {
  'use strict';

  var DCR = window.DCR || (window.DCR = {});

  // The canyon centreline: a gentle S-curve the river, the valley floor and the ring course all
  // follow. North is -z. South of z = RUNWAY.straightenStart the curve eases into a straight so
  // the runway can sit on it.
  var RUNWAY = {
    centerX: 0,          // filled in below once the curve constant is known
    zNear: 1000,         // finish-gate end of the strip
    zFar: 1560,          // far threshold
    width: 26,
    groundHeight: 6,     // the flattened plateau height the strip is painted on
    straightenStart: 850,
    straightenEnd: 1150,
  };

  function rawCenterX(z) {
    return 250 * Math.sin(z * 0.0016) + 120 * Math.sin(z * 0.0042 + 1.3);
  }

  RUNWAY.centerX = rawCenterX(1150);

  function smoothstep(edge0, edge1, x) {
    var t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  // x of the valley centreline at a given z; straight over the runway, winding to the north.
  function canyonCenterX(z) {
    if (z <= RUNWAY.straightenStart) return rawCenterX(z);
    var t = smoothstep(RUNWAY.straightenStart, RUNWAY.straightenEnd, z);
    return rawCenterX(z) * (1 - t) + RUNWAY.centerX * t;
  }

  // Compass heading (radians, 0 = north, clockwise) of the course direction at z.
  function courseHeadingAt(z) {
    var ahead = canyonCenterX(z - 40) - canyonCenterX(z + 40);
    return Math.atan2(ahead, 80);
  }

  DCR.CONFIG = {
    worldSeed: 20261126,

    // Terrain sheet: x east, z south. The course runs from the runway (z ~ +1300) north to
    // z ~ -3100 where the last ring hangs.
    terrain: {
      width: 4600,
      length: 5600,
      centerZ: -800,
      segmentsX: 184,
      segmentsZ: 224,
      valleyHalfWidth: 150,
      wallRun: 430,
      wallBaseHeight: 95,
      wallNoiseHeight: 75,
      floorHeight: 4,
    },

    runway: RUNWAY,
    canyonCenterX: canyonCenterX,
    courseHeadingAt: courseHeadingAt,
    smoothstep: smoothstep,

    flight: {
      maxThrustAccel: 22,       // m/s^2 at full throttle
      boostMultiplier: 1.55,
      dragCoefficient: 0.0035,
      gravity: 9.8,
      stallSpeed: 24,           // m/s; below this the wing stops holding the plane up
      maxSpeed: 96,
      cruiseSpeed: 46,
      pitchRate: 1.05,          // rad/s at full stick
      rollRate: 2.4,            // rad/s at full stick
      rudderRate: 0.5,          // rad/s
      turnAuthority: 2.05,      // multiplier on the banked-turn rate
      ceiling: 330,             // soft altitude ceiling, metres
      groundClearance: 2.3,     // metres between the terrain and the plane's belly
    },

    mission: {
      ringCount: 12,
      ringRadius: 16,
      ringPoints: 1000,
      crashPenaltySeconds: 10,
      parSeconds: 300,          // finishing inside par earns a time bonus
      timeBonusPerSecond: 10,
      gradeS: 200,
      gradeA: 260,
      gradeB: 340,
    },

    // Dawn palette.
    colors: {
      skyTop: 0x2e4a7a,
      skyHorizon: 0xff9a5c,
      skyLow: 0xffd9a0,
      fog: 0xf2b98a,
      sun: 0xffe3ae,
      terrainSand: [0.76, 0.63, 0.42],
      terrainGrass: [0.36, 0.55, 0.27],
      terrainRock: [0.48, 0.40, 0.33],
      terrainSnow: [0.95, 0.96, 0.97],
      river: 0x3d7ab8,
      planeBody: 0xff5a1f,
      planeAccent: 0xffd24d,
      ringGold: 0xffb52e,
      ringPassed: 0x37d67a,
    },
  };
})();
