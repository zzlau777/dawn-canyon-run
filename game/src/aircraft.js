// DAWN CANYON RUN — aircraft.js
// The player's low-poly propeller plane, built entirely from Three.js primitives: a tapered
// fuselage, straight wing and tailplane, fin and rudder, a glazed canopy, a two-blade propeller
// that spins with RPM, and fixed landing gear with a tail wheel. Bright orange with a yellow
// wing stripe so it reads clearly against the green and rock of the canyon at any distance.
(function () {
  'use strict';

  var DCR = window.DCR || (window.DCR = {});
  var CONFIG = DCR.CONFIG;

  var bodyMaterial = null;
  var accentMaterial = null;
  var darkMaterial = null;
  var propeller = null;

  function materials() {
    if (!bodyMaterial) {
      bodyMaterial = new THREE.MeshStandardMaterial({ color: CONFIG.colors.planeBody, flatShading: true, roughness: 0.55, metalness: 0.08 });
      accentMaterial = new THREE.MeshStandardMaterial({ color: CONFIG.colors.planeAccent, flatShading: true, roughness: 0.5 });
      darkMaterial = new THREE.MeshStandardMaterial({ color: 0x23272e, flatShading: true, roughness: 0.8 });
    }
    return { body: bodyMaterial, accent: accentMaterial, dark: darkMaterial };
  }

  function box(width, height, depth, material, x, y, z) {
    var mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    mesh.position.set(x, y, z);
    return mesh;
  }

  // Build the plane. The model faces -z (nose at -z), spans about 11 m wingtip to wingtip, and
  // its origin sits at the centre of the fuselage, roughly the centre of gravity.
  function buildAircraft() {
    var mats = materials();
    var plane = new THREE.Group();
    plane.name = 'DawnRunner';

    // Fuselage: a stretched, tapered octahedron reads as a rounded low-poly body.
    var fuselage = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 1.02, 7.6, 8), mats.body);
    fuselage.rotation.x = Math.PI / 2;
    fuselage.scale.y = 1;
    plane.add(fuselage);
    // Nose cowling.
    var cowling = new THREE.Mesh(new THREE.CylinderGeometry(1.04, 0.9, 1.1, 8), mats.accent);
    cowling.rotation.x = Math.PI / 2;
    cowling.position.z = -3.9;
    plane.add(cowling);

    // Main wing with a yellow centre stripe, set a little ahead of the origin.
    var wing = box(11, 0.28, 1.9, mats.body, 0, -0.25, -0.7);
    plane.add(wing);
    var stripe = box(3.4, 0.32, 1.94, mats.accent, 0, -0.25, -0.7);
    plane.add(stripe);
    // Wingtip caps.
    plane.add(box(0.5, 0.34, 1.9, mats.accent, -5.4, -0.25, -0.7));
    plane.add(box(0.5, 0.34, 1.9, mats.accent, 5.4, -0.25, -0.7));

    // Tail: horizontal stabiliser and a tall fin with rudder, in accent yellow.
    plane.add(box(4.4, 0.22, 1.2, mats.accent, 0, 0.25, 3.6));
    var fin = box(0.24, 1.9, 1.5, mats.accent, 0, 1.05, 3.55);
    plane.add(fin);

    // Canopy: a dark glazed bubble over the wing.
    var canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.78, 10, 8),
      new THREE.MeshStandardMaterial({ color: 0x2c4a63, flatShading: true, roughness: 0.25, metalness: 0.3 })
    );
    canopy.scale.set(0.85, 0.75, 1.6);
    canopy.position.set(0, 0.72, -0.5);
    plane.add(canopy);

    // Propeller: two blades and a spinner cone on the nose, spun by spinPropeller(rpm).
    propeller = new THREE.Group();
    propeller.name = 'Propeller';
    var blade = box(0.34, 4.6, 0.12, mats.dark, 0, 0, 0);
    propeller.add(blade);
    var spinner = new THREE.Mesh(new THREE.ConeGeometry(0.42, 1.0, 8), mats.accent);
    spinner.rotation.x = -Math.PI / 2;
    spinner.position.z = -0.3;
    propeller.add(spinner);
    propeller.position.z = -4.55;
    plane.add(propeller);

    // The blur disc a spinning prop shows in a photograph: a faint dark circle that sells the
    // motion even in a frozen frame.
    var propDisc = new THREE.Mesh(
      new THREE.CircleGeometry(2.35, 24),
      new THREE.MeshBasicMaterial({ color: 0x14171c, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false })
    );
    propDisc.position.z = -4.5;
    plane.add(propDisc);

    // Fixed landing gear: two main legs with wheels and a small tail wheel.
    [-1, 1].forEach(function (side) {
      var leg = box(0.18, 1.3, 0.18, mats.dark, side * 1.5, -1.0, -0.9);
      leg.rotation.z = side * 0.25;
      plane.add(leg);
      var wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.3, 10), mats.dark);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(side * 1.72, -1.62, -0.9);
      plane.add(wheel);
    });
    var tailWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8), mats.dark);
    tailWheel.rotation.z = Math.PI / 2;
    tailWheel.position.set(0, -0.72, 3.7);
    plane.add(tailWheel);

    return plane;
  }

  // Advance the propeller for this frame; rpm in [0, 1] and dt in seconds.
  function spinPropeller(rpm, dt) {
    if (propeller) propeller.rotation.z -= (2 + rpm * 55) * dt;
  }

  // Freeze the propeller at an angle (the screenshot staging uses a diagonal, as a camera
  // catching a real prop mid-turn would).
  function setPropellerAngle(radians) {
    if (propeller) propeller.rotation.z = radians;
  }

  // Forward unit vector for a heading/pitch pair (heading 0 = north = -z, pitch up positive).
  function forwardVector(heading, pitch, out) {
    var cosPitch = Math.cos(pitch);
    out.set(Math.sin(heading) * cosPitch, Math.sin(pitch), -Math.cos(heading) * cosPitch);
    return out;
  }

  // Point a plane group along heading/pitch/roll using the YXZ order (yaw, then pitch, then
  // roll) so banking looks like banking rather than a barrel around the view axis.
  function orientAircraft(plane, heading, pitch, roll) {
    plane.rotation.order = 'YXZ';
    plane.rotation.y = -heading;
    plane.rotation.x = pitch;
    plane.rotation.z = -roll;
  }

  DCR.aircraft = {
    buildAircraft: buildAircraft,
    spinPropeller: spinPropeller,
    setPropellerAngle: setPropellerAngle,
    forwardVector: forwardVector,
    orientAircraft: orientAircraft,
  };
})();
