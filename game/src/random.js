// DAWN CANYON RUN — random.js
// Deterministic randomness: a mulberry32 generator for scattering trees, rocks and clouds, and
// a hash-based value-noise field for the terrain. Both are pure functions of the world seed, so
// the canyon is identical on every load and in every screenshot.
(function () {
  'use strict';

  var DCR = window.DCR || (window.DCR = {});

  // mulberry32: tiny fast seeded PRNG. Returns a function producing floats in [0, 1).
  function createSeededRandom(seed) {
    var state = seed >>> 0;
    return function nextRandom() {
      state = (state + 0x6d2b79f5) >>> 0;
      var t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Integer lattice hash -> [0, 1). Pure function of the coordinates and a salt, so the terrain
  // height field can be sampled anywhere, any number of times, with the same answer.
  function latticeHash(ix, iz, salt) {
    var n = Math.sin(ix * 127.1 + iz * 311.7 + salt * 74.7) * 43758.5453123;
    return n - Math.floor(n);
  }

  function bilinear(ix, iz, fx, fz, salt) {
    var v00 = latticeHash(ix, iz, salt);
    var v10 = latticeHash(ix + 1, iz, salt);
    var v01 = latticeHash(ix, iz + 1, salt);
    var v11 = latticeHash(ix + 1, iz + 1, salt);
    var sx = fx * fx * (3 - 2 * fx);
    var sz = fz * fz * (3 - 2 * fz);
    return (v00 * (1 - sx) + v10 * sx) * (1 - sz) + (v01 * (1 - sx) + v11 * sx) * sz;
  }

  // Smooth value noise in [0, 1) at world scale: sample(x, z) with a wavelength in metres.
  function valueNoise2D(x, z, wavelength, salt) {
    var gx = x / wavelength;
    var gz = z / wavelength;
    var ix = Math.floor(gx);
    var iz = Math.floor(gz);
    return bilinear(ix, iz, gx - ix, gz - iz, salt);
  }

  // Two-octave noise for ridges and wall detail, still in [0, 1).
  function fbmNoise2D(x, z, wavelength, salt) {
    return valueNoise2D(x, z, wavelength, salt) * 0.65 + valueNoise2D(x, z, wavelength * 0.37, salt + 5) * 0.35;
  }

  DCR.random = {
    createSeededRandom: createSeededRandom,
    valueNoise2D: valueNoise2D,
    fbmNoise2D: fbmNoise2D,
  };
})();
