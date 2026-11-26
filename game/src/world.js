// DAWN CANYON RUN — world.js
// Builds the whole dawn canyon as one THREE.Group: a gradient sky dome with a glowing sun, a
// flat-shaded procedural terrain sheet carved into a winding valley, a river ribbon along the
// valley floor, the runway plateau with markings, threshold lights and buildings, instanced
// pines and rocks, drifting cloud blobs and a ring of distant peaks. Also owns
// terrainHeightAt(x, z), the single height field the flight model collides with — the mesh is
// displaced by exactly this function, so what you see is what you hit.
(function () {
  'use strict';

  var DCR = window.DCR || (window.DCR = {});
  var CONFIG = DCR.CONFIG;
  var T = CONFIG.terrain;
  var noise = DCR.random.valueNoise2D;
  var fbm = DCR.random.fbmNoise2D;
  var smoothstep = CONFIG.smoothstep;

  // Height of the ground at (x, z), in metres. Valley floor near the centreline, walls rising
  // with distance from it, a flattened plateau under the runway, and the sheet's rim climbing
  // into the mountain ring so the horizon never shows an edge.
  function terrainHeightAt(x, z) {
    var centreX = CONFIG.canyonCenterX(z);
    var distance = Math.abs(x - centreX);

    var floor = T.floorHeight + noise(x, z, 260, 3) * 3.2;

    var wallT = smoothstep(T.valleyHalfWidth, T.valleyHalfWidth + T.wallRun, distance);
    var wall = wallT * (T.wallBaseHeight + fbm(x, z, 620, 7) * T.wallNoiseHeight + wallT * 65);

    // Gentle shoulders far out on the plateau, then the rim mountains.
    var plateau = smoothstep(700, 1700, distance) * (10 + fbm(x, z, 900, 11) * 26);
    var rim = smoothstep(2100, 2900, Math.max(Math.abs(x), Math.abs(z - T.centerZ))) * 320;

    var height = floor + wall + plateau + rim;

    // Flatten the runway plateau: blend to the strip's ground height inside its apron.
    var runway = CONFIG.runway;
    var apron = Math.min(
      1 - smoothstep(30, 52, Math.abs(x - runway.centerX)),
      smoothstep(runway.zNear - 90, runway.zNear + 10, z) * (1 - smoothstep(runway.zFar - 10, runway.zFar + 90, z))
    );
    if (apron > 0) height = height * (1 - apron) + runway.groundHeight * apron;
    return height;
  }

  // Terrain colour from height and slope: sand on the valley floor, grass on the gentle ground,
  // rock on the steep and high, snow on the peaks.
  function terrainColorAt(x, z, height, slope) {
    var sand = CONFIG.colors.terrainSand;
    var grass = CONFIG.colors.terrainGrass;
    var rock = CONFIG.colors.terrainRock;
    var snow = CONFIG.colors.terrainSnow;
    var grassMix = smoothstep(10, 42, height) * (1 - smoothstep(0.35, 0.75, slope));
    var rockMix = smoothstep(0.45, 0.8, slope) + smoothstep(120, 200, height) * 0.6;
    rockMix = Math.min(1, rockMix);
    var snowMix = smoothstep(215, 280, height) * (1 - smoothstep(0.7, 1.0, slope));
    var r = sand[0] + (grass[0] - sand[0]) * grassMix;
    var g = sand[1] + (grass[1] - sand[1]) * grassMix;
    var b = sand[2] + (grass[2] - sand[2]) * grassMix;
    r += (rock[0] - r) * rockMix;
    g += (rock[1] - g) * rockMix;
    b += (rock[2] - b) * rockMix;
    // A whisper of variation so the flat shading does not band.
    var vary = 0.94 + noise(x, z, 90, 21) * 0.12;
    r = Math.min(1, (r + (snow[0] - r) * snowMix) * vary);
    g = Math.min(1, (g + (snow[1] - g) * snowMix) * vary);
    b = Math.min(1, (b + (snow[2] - b) * snowMix) * vary);
    return [r, g, b];
  }

  function buildTerrain() {
    var geometry = new THREE.PlaneGeometry(T.width, T.length, T.segmentsX, T.segmentsZ);
    geometry.rotateX(-Math.PI / 2);
    var positions = geometry.attributes.position;
    var colors = new Float32Array(positions.count * 3);
    for (var i = 0; i < positions.count; i += 1) {
      var x = positions.getX(i);
      var z = positions.getZ(i) + T.centerZ;
      var height = terrainHeightAt(x, z);
      positions.setY(i, height);
      positions.setZ(i, z);
      // Slope from a small forward difference; enough for colour, the flat shading does the rest.
      var slope = Math.abs(terrainHeightAt(x + 14, z) - height) / 14 +
        Math.abs(terrainHeightAt(x, z + 14) - height) / 14;
      var color = terrainColorAt(x, z, height, slope * 0.5);
      colors[i * 3] = color[0];
      colors[i * 3 + 1] = color[1];
      colors[i * 3 + 2] = color[2];
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    var material = new THREE.MeshStandardMaterial({
      vertexColors: true, flatShading: true, roughness: 1, metalness: 0,
    });
    var mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'CanyonTerrain';
    return mesh;
  }

  // The river: a ribbon following the centreline at floor height, rebuilt from the same path
  // the rings use, so it always winds through the valley bottom. It starts just north of the
  // finish gate — the runway plateau sits on the valley floor where the river would run.
  function buildRiver() {
    var step = 46;
    var zStart = 940;
    var zEnd = -3480;
    var segments = Math.floor((zStart - zEnd) / step);
    var positions = [];
    var indices = [];
    for (var i = 0; i <= segments; i += 1) {
      var z = zStart - i * step;
      var cx = CONFIG.canyonCenterX(z);
      var y = terrainHeightAt(cx, z) + 0.7;
      var halfWidth = 17;
      positions.push(cx - halfWidth, y, z, cx + halfWidth, y, z);
      if (i < segments) {
        var a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    var geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    var material = new THREE.MeshPhongMaterial({
      color: CONFIG.colors.river, shininess: 90, specular: 0x99c4e8,
      transparent: true, opacity: 0.94, emissive: 0x10283e,
    });
    var mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'CanyonRiver';
    return mesh;
  }

  // The runway: a dark strip on the plateau with painted centreline dashes, threshold bars and
  // edge lines, small emissive threshold/edge lights, and a hangar, tower and hut beside it.
  function buildRunway() {
    var runway = CONFIG.runway;
    var group = new THREE.Group();
    group.name = 'Runway';
    var groundY = runway.groundHeight;
    var length = runway.zFar - runway.zNear;
    var centreZ = (runway.zNear + runway.zFar) / 2;

    var strip = new THREE.Mesh(
      new THREE.BoxGeometry(runway.width, 0.3, length),
      new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.95 })
    );
    strip.position.set(runway.centerX, groundY + 0.15, centreZ);
    group.add(strip);

    var paintMaterial = new THREE.MeshBasicMaterial({ color: 0xf4f6f2 });
    // Centreline dashes.
    for (var dz = -length / 2 + 30; dz < length / 2 - 20; dz += 44) {
      var dash = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.34, 20), paintMaterial);
      dash.position.set(runway.centerX, groundY + 0.16, centreZ + dz);
      group.add(dash);
    }
    // Threshold bars at both ends.
    [-1, 1].forEach(function (endSign) {
      for (var bar = -3; bar <= 3; bar += 1) {
        if (bar === 0) continue;
        var threshold = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.34, 14), paintMaterial);
        threshold.position.set(runway.centerX + bar * 3.1, groundY + 0.16, centreZ + endSign * (length / 2 - 12));
        group.add(threshold);
      }
    });
    // Edge lines.
    [-1, 1].forEach(function (side) {
      var edge = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.34, length - 8), paintMaterial);
      edge.position.set(runway.centerX + side * (runway.width / 2 - 1), groundY + 0.16, centreZ);
      group.add(edge);
    });

    // Lights: green threshold row at the near (south-facing approach) end, red at the far end,
    // amber edge lights down both sides — small emissive spheres on short posts.
    var lightGeometry = new THREE.SphereGeometry(0.55, 8, 6);
    function addLight(x, z, color) {
      var bulb = new THREE.Mesh(lightGeometry, new THREE.MeshBasicMaterial({ color: color }));
      bulb.position.set(x, groundY + 1.0, z);
      group.add(bulb);
    }
    for (var lx = -3; lx <= 3; lx += 1) {
      addLight(runway.centerX + lx * 3.6, runway.zNear + 2, 0x2eff7a);
      addLight(runway.centerX + lx * 3.6, runway.zFar - 2, 0xff4444);
    }
    for (var lz = runway.zNear + 26; lz < runway.zFar - 10; lz += 52) {
      addLight(runway.centerX - runway.width / 2 - 1.6, lz, 0xffc46b);
      addLight(runway.centerX + runway.width / 2 + 1.6, lz, 0xffc46b);
    }

    // Buildings: a hangar with a curved roof, a small control tower and a fuel hut, set on the
    // east apron where the title-screen orbit can see them.
    var wallMaterial = new THREE.MeshStandardMaterial({ color: 0xcfd4d8, flatShading: true, roughness: 0.9 });
    var roofMaterial = new THREE.MeshStandardMaterial({ color: 0x8a4b2d, flatShading: true, roughness: 0.9 });
    var hangar = new THREE.Mesh(new THREE.BoxGeometry(22, 7, 16), wallMaterial);
    hangar.position.set(runway.centerX + 34, groundY + 3.5, runway.zFar - 60);
    group.add(hangar);
    var hangarRoof = new THREE.Mesh(new THREE.CylinderGeometry(11.4, 11.4, 16.4, 12, 1, false, 0, Math.PI), roofMaterial);
    hangarRoof.rotation.z = Math.PI / 2;
    hangarRoof.rotation.y = Math.PI / 2;
    hangarRoof.position.set(runway.centerX + 34, groundY + 7, runway.zFar - 60);
    group.add(hangarRoof);

    var tower = new THREE.Mesh(new THREE.BoxGeometry(5, 13, 5), wallMaterial);
    tower.position.set(runway.centerX - 30, groundY + 6.5, runway.zNear + 66);
    group.add(tower);
    var towerCab = new THREE.Mesh(
      new THREE.BoxGeometry(7.5, 3, 7.5),
      new THREE.MeshStandardMaterial({ color: 0x3d6f8e, flatShading: true, roughness: 0.4, emissive: 0x1d3a4a })
    );
    towerCab.position.set(runway.centerX - 30, groundY + 14.5, runway.zNear + 66);
    group.add(towerCab);

    var hut = new THREE.Mesh(new THREE.BoxGeometry(8, 3.6, 6), roofMaterial);
    hut.position.set(runway.centerX + 30, groundY + 1.8, runway.zNear + 40);
    group.add(hut);

    return group;
  }

  // Pines and rocks as two InstancedMeshes each: a few hundred scatter points kept off the
  // river, off the runway apron and on ground gentle enough to stand on.
  function scatterPoints(count, accept) {
    var random = DCR.random.createSeededRandom(CONFIG.worldSeed + count * 131);
    var points = [];
    var attempts = 0;
    while (points.length < count && attempts < count * 14) {
      attempts += 1;
      var x = (random() * 2 - 1) * 2150;
      var z = -3480 + random() * 5380;
      var height = terrainHeightAt(x, z);
      var slope = Math.abs(terrainHeightAt(x + 10, z) - height) / 10 +
        Math.abs(terrainHeightAt(x, z + 10) - height) / 10;
      var point = { x: x, z: z, height: height, slope: slope, scale: 0.8 + random() * 0.9, spin: random() * Math.PI * 2 };
      if (accept(point)) points.push(point);
    }
    return points;
  }

  function offCourse(point) {
    var runway = CONFIG.runway;
    if (Math.abs(point.x - runway.centerX) < 46 && point.z > runway.zNear - 70 && point.z < runway.zFar + 70) return false;
    if (Math.abs(point.x - CONFIG.canyonCenterX(point.z)) < 30) return false; // the river
    return true;
  }

  function buildVegetation() {
    var group = new THREE.Group();
    group.name = 'PinesAndRocks';
    var dummy = new THREE.Object3D();

    var pinePoints = scatterPoints(420, function (p) {
      return offCourse(p) && p.height > 7 && p.height < 120 && p.slope < 0.55;
    });
    var trunkMesh = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.45, 0.7, 3, 5),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2f, flatShading: true, roughness: 1 }),
      pinePoints.length
    );
    var foliageMesh = new THREE.InstancedMesh(
      new THREE.ConeGeometry(3.4, 10, 6),
      new THREE.MeshStandardMaterial({ color: 0x2f6b35, flatShading: true, roughness: 1 }),
      pinePoints.length
    );
    var foliageColor = new THREE.Color();
    pinePoints.forEach(function (p, i) {
      dummy.position.set(p.x, p.height + 1.2 * p.scale, p.z);
      dummy.scale.setScalar(p.scale);
      dummy.rotation.set(0, p.spin, 0);
      dummy.updateMatrix();
      trunkMesh.setMatrixAt(i, dummy.matrix);
      dummy.position.y = p.height + (3 + 4.6) * p.scale;
      dummy.updateMatrix();
      foliageMesh.setMatrixAt(i, dummy.matrix);
      foliageColor.setHSL(0.33 + (i % 7) * 0.006, 0.5, 0.26 + (i % 5) * 0.02);
      foliageMesh.setColorAt(i, foliageColor);
    });
    group.add(trunkMesh);
    group.add(foliageMesh);

    var rockPoints = scatterPoints(170, function (p) {
      return offCourse(p) && p.height > 6 && p.slope >= 0.3;
    });
    var rockMesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(2.4, 0),
      new THREE.MeshStandardMaterial({ color: 0x7d7268, flatShading: true, roughness: 1 }),
      rockPoints.length
    );
    rockPoints.forEach(function (p, i) {
      dummy.position.set(p.x, p.height + 0.6, p.z);
      dummy.scale.set(p.scale * (0.8 + (i % 3) * 0.3), p.scale * 0.75, p.scale);
      dummy.rotation.set(p.spin, p.spin * 1.7, 0);
      dummy.updateMatrix();
      rockMesh.setMatrixAt(i, dummy.matrix);
    });
    group.add(rockMesh);
    return group;
  }

  // Flat cloud blobs: clusters of squashed spheres high above the canyon, lit warm by the dawn.
  function buildClouds() {
    var group = new THREE.Group();
    group.name = 'Clouds';
    var random = DCR.random.createSeededRandom(CONFIG.worldSeed + 77);
    var material = new THREE.MeshLambertMaterial({ color: 0xfff1dd, transparent: true, opacity: 0.82 });
    for (var c = 0; c < 16; c += 1) {
      var cloud = new THREE.Group();
      var puffs = 3 + Math.floor(random() * 3);
      for (var p = 0; p < puffs; p += 1) {
        var radius = 22 + random() * 30;
        var puff = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), material);
        puff.position.set((random() - 0.5) * 90, (random() - 0.5) * 8, (random() - 0.5) * 40);
        puff.scale.y = 0.32;
        cloud.add(puff);
      }
      cloud.position.set((random() * 2 - 1) * 2400, 300 + random() * 130, -3200 + random() * 5000);
      group.add(cloud);
    }
    return group;
  }

  // A ring of big snow-capped peaks closing the horizon beyond the terrain sheet.
  function buildMountainRing() {
    var group = new THREE.Group();
    group.name = 'MountainRing';
    var random = DCR.random.createSeededRandom(CONFIG.worldSeed + 913);
    var rockMaterial = new THREE.MeshStandardMaterial({ color: 0x77685c, flatShading: true, roughness: 1 });
    var snowMaterial = new THREE.MeshStandardMaterial({ color: 0xf2f5f7, flatShading: true, roughness: 0.9 });
    for (var i = 0; i < 14; i += 1) {
      var angle = (i / 14) * Math.PI * 2 + random() * 0.2;
      var radius = 3050 + random() * 500;
      var height = 430 + random() * 260;
      var peak = new THREE.Mesh(new THREE.ConeGeometry(360 + random() * 190, height, 6), rockMaterial);
      peak.position.set(Math.sin(angle) * radius, height / 2 - 30, T.centerZ + Math.cos(angle) * radius);
      peak.rotation.y = random() * Math.PI;
      group.add(peak);
      var cap = new THREE.Mesh(new THREE.ConeGeometry(150 + random() * 60, height * 0.34, 6), snowMaterial);
      cap.position.set(peak.position.x, height - 30 - height * 0.17 + height * 0.17, peak.position.z);
      cap.position.y = height * 0.83 - 30;
      cap.rotation.y = peak.rotation.y;
      group.add(cap);
    }
    return group;
  }

  // The sky: a big inverted sphere painted with a vertical dawn gradient, plus a sun disc sprite
  // low in the south-east where the light comes from.
  function buildSky() {
    var group = new THREE.Group();
    group.name = 'DawnSky';
    var canvas = document.createElement('canvas');
    canvas.width = 4;
    canvas.height = 256;
    var ctx = canvas.getContext('2d');
    var gradient = ctx.createLinearGradient(0, 0, 0, 256);
    gradient.addColorStop(0.0, '#2e4a7a');
    gradient.addColorStop(0.42, '#7a6a9a');
    gradient.addColorStop(0.62, '#e88a5c');
    gradient.addColorStop(0.74, '#ff9a5c');
    gradient.addColorStop(0.82, '#ffd9a0');
    gradient.addColorStop(1.0, '#ffd9a0');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 4, 256);
    var texture = new THREE.CanvasTexture(canvas);
    var dome = new THREE.Mesh(
      new THREE.SphereGeometry(6500, 24, 16),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide, fog: false, depthWrite: false })
    );
    dome.position.z = T.centerZ;
    group.add(dome);

    var sunCanvas = document.createElement('canvas');
    sunCanvas.width = 128;
    sunCanvas.height = 128;
    var sunCtx = sunCanvas.getContext('2d');
    var glow = sunCtx.createRadialGradient(64, 64, 4, 64, 64, 64);
    glow.addColorStop(0, 'rgba(255, 240, 200, 1)');
    glow.addColorStop(0.25, 'rgba(255, 214, 140, 0.85)');
    glow.addColorStop(1, 'rgba(255, 170, 90, 0)');
    sunCtx.fillStyle = glow;
    sunCtx.fillRect(0, 0, 128, 128);
    var sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(sunCanvas), fog: false, depthWrite: false, transparent: true,
    }));
    sun.scale.setScalar(1500);
    sun.position.set(2600, 620, 3400);
    group.add(sun);
    return group;
  }

  // Assemble the world and its lights into the scene.
  function buildWorld(scene) {
    scene.fog = new THREE.Fog(CONFIG.colors.fog, 500, 4600);
    var hemi = new THREE.HemisphereLight(0xbfd0ff, 0x8a6a4a, 0.8);
    scene.add(hemi);
    var sunLight = new THREE.DirectionalLight(0xffd9a8, 1.15);
    sunLight.position.set(900, 700, 1500);
    scene.add(sunLight);
    var fill = new THREE.DirectionalLight(0x9ab4ff, 0.25);
    fill.position.set(-800, 500, -1200);
    scene.add(fill);

    var world = new THREE.Group();
    world.name = 'DawnCanyon';
    world.add(buildSky());
    world.add(buildTerrain());
    world.add(buildRiver());
    world.add(buildRunway());
    world.add(buildVegetation());
    world.add(buildClouds());
    world.add(buildMountainRing());
    scene.add(world);
    return world;
  }

  DCR.world = {
    terrainHeightAt: terrainHeightAt,
    buildWorld: buildWorld,
  };
})();
