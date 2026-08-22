const THREE = window.THREE;

const M_TO_SCENE = 1 / 100;

const _rocketCorrQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const _rocketGroundOffset = 0.55 * 1.4;

const state = {
  activeSite: 'Sutherland',
  activeWind: 'moderate',
  playing: false,
  frameIdx: 0,
  playbackTime: 0,
  speed: 1,
  viewMode: 'follow',
  showTrajectories: false,
  trajectory: null,
  displaySites: ['Sutherland', 'SaxaVord', 'Prestwick', 'Snowdonia', 'Cornwall'],
};

const canvas = document.getElementById('canvas3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x01020a, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 12000);
camera.position.set(6, 3, 22);
camera.lookAt(0, 8, 0);

const ambientLight = new THREE.AmbientLight(0x08091a, 2.5);
scene.add(ambientLight);

const sunLight = new THREE.DirectionalLight(0xfff4e0, 2.8);
sunLight.position.set(80, 60, 40);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(2048, 2048);
sunLight.shadow.camera.near = 0.1;
sunLight.shadow.camera.far = 200;
sunLight.shadow.camera.left = -30;
sunLight.shadow.camera.right = 30;
sunLight.shadow.camera.top = 30;
sunLight.shadow.camera.bottom = -30;
scene.add(sunLight);

const fillLight = new THREE.DirectionalLight(0x2255aa, 0.6);
fillLight.position.set(-20, -10, -15);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x004488, 0.4);
rimLight.position.set(-60, 30, -40);
scene.add(rimLight);

function createStarField() {
  const count = 10000;
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(1 - Math.random() * 1.6);
    const r = 2000 + Math.random() * 1000;
    positions[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i*3+2] = r * Math.cos(phi);
    const brightness = 0.3 + Math.random() * 0.7;
    const warm = Math.random();
    colors[i*3]   = brightness * (0.85 + warm * 0.15);
    colors[i*3+1] = brightness * (0.88 + warm * 0.05);
    colors[i*3+2] = brightness;
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.8, vertexColors: true, sizeAttenuation: true });
  scene.add(new THREE.Points(geom, mat));

  const brightCount = 200;
  const bGeom = new THREE.BufferGeometry();
  const bPos = new Float32Array(brightCount * 3);
  for (let i = 0; i < brightCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(1 - Math.random() * 1.4);
    const r = 1800;
    bPos[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    bPos[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    bPos[i*3+2] = r * Math.cos(phi);
  }
  bGeom.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
  const bMat = new THREE.PointsMaterial({ size: 2.5, color: 0xffffff, sizeAttenuation: true, transparent: true, opacity: 0.9 });
  scene.add(new THREE.Points(bGeom, bMat));
}
createStarField();

function createGround() {
  const SIZE = 220;
  const SEGS = 440;
  const geom = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);

  const hash = (x, y) => {
    const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return s - Math.floor(s);
  };
  const vnoise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi,        yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi),     b = hash(xi + 1, yi);
    const c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a * (1 - u) * (1 - v) + b * u * (1 - v)
         + c * (1 - u) * v       + d * u * v;
  };
  const fbm = (x, y) => {
    let n = 0, amp = 1, f = 0.09, norm = 0;
    for (let i = 0; i < 7; i++) {
      n += vnoise(x * f, y * f) * amp;
      norm += amp; amp *= 0.52; f *= 2.05;
    }
    return n / norm;
  };

  const smooth = (e0, e1, x) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };

  const pos = geom.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const r = Math.sqrt(x * x + y * y);

    const padMask = smooth(4, 14, r);
    const hills = (fbm(x, y) - 0.5) * 7 * padMask;

    const ringT = 1 - Math.min(1, Math.abs(r - 110) / 35);
    const ridgeNoise = fbm(x * 0.4 + 17, y * 0.4 - 9);
    const mountains = Math.pow(Math.max(0, ringT), 1.6) * (10 + ridgeNoise * 18);

    const h = hills + mountains;
    pos.setZ(i, h);

    const nv = (hash(x * 2.3, y * 2.3) - 0.5) * 0.06;
    let cr, cg, cb;
    if (h < 0.2)      { cr = 0.10; cg = 0.20; cb = 0.09; }
    else if (h < 1.5) { cr = 0.13; cg = 0.22; cb = 0.10; }
    else if (h < 5)   { cr = 0.18; cg = 0.20; cb = 0.12; }
    else if (h < 12)  { cr = 0.28; cg = 0.24; cb = 0.18; }
    else if (h < 20)  { cr = 0.40; cg = 0.38; cb = 0.36; }
    else              { cr = 0.82; cg = 0.84; cb = 0.88; }
    colors[i * 3    ] = Math.max(0, cr + nv);
    colors[i * 3 + 1] = Math.max(0, cg + nv);
    colors[i * 3 + 2] = Math.max(0, cb + nv);
  }
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geom.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.95, metalness: 0.0,
    flatShading: true,
  });
  const terrain = new THREE.Mesh(geom, mat);
  terrain.rotation.x = -Math.PI / 2;
  terrain.receiveShadow = true;
  scene.add(terrain);

  const treeTopGeom = new THREE.ConeGeometry(0.07, 0.22, 6);
  const treeTopMat  = new THREE.MeshStandardMaterial({ color: 0x0e2a12, roughness: 0.9 });
  const trunkGeom   = new THREE.CylinderGeometry(0.012, 0.018, 0.08, 5);
  const trunkMat    = new THREE.MeshStandardMaterial({ color: 0x2a1a0e, roughness: 0.95 });
  const treeCount = 220;
  for (let i = 0; i < treeCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const dist  = 4 + Math.random() * 22;
    const tx = Math.cos(angle) * dist;
    const tz = Math.sin(angle) * dist;
    const s  = 0.6 + Math.random() * 0.7;
    const trunk = new THREE.Mesh(trunkGeom, trunkMat);
    trunk.position.set(tx, 0.04 * s, tz);
    trunk.scale.setScalar(s);
    scene.add(trunk);
    const top = new THREE.Mesh(treeTopGeom, treeTopMat);
    top.position.set(tx, (0.08 + 0.11) * s, tz);
    top.scale.setScalar(s);
    scene.add(top);
  }

  const padGeom = new THREE.CircleGeometry(2.5, 48);
  const padMat = new THREE.MeshStandardMaterial({
    color: 0x0d1a30, roughness: 0.6, metalness: 0.3,
    emissive: 0x001830, emissiveIntensity: 0.4,
  });
  const pad = new THREE.Mesh(padGeom, padMat);
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.02;
  scene.add(pad);

  const ring1Geom = new THREE.RingGeometry(2.4, 2.55, 48);
  const ring1Mat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  const ring1 = new THREE.Mesh(ring1Geom, ring1Mat);
  ring1.rotation.x = -Math.PI / 2;
  ring1.position.y = 0.03;
  scene.add(ring1);

  const ring2Geom = new THREE.RingGeometry(0.6, 0.72, 32);
  const ring2Mat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
  const ring2 = new THREE.Mesh(ring2Geom, ring2Mat);
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.y = 0.03;
  scene.add(ring2);

  const crossMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.35 });
  [[2.5, 0.02, 0.02], [0.02, 0.02, 2.5]].forEach(([w, h, d]) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), crossMat);
    bar.position.y = 0.04;
    scene.add(bar);
  });

  const padLight = new THREE.PointLight(0x00aaff, 0.8, 6);
  padLight.position.set(0, 0.5, 0);
  scene.add(padLight);

  return { pad, ring: ring1, light: padLight };
}
const ground = createGround();

function createAtmosphereLayers() {
  const earthGeom = new THREE.SphereGeometry(600, 64, 48);
  const earthMat = new THREE.MeshPhongMaterial({
    color: 0x071628,
    emissive: 0x020810,
    specular: 0x001133,
    shininess: 8,
  });
  const earth = new THREE.Mesh(earthGeom, earthMat);
  earth.position.y = -600;
  scene.add(earth);

  const haloGeom = new THREE.SphereGeometry(610, 64, 32);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x0055aa,
    transparent: true, opacity: 0.18,
    side: THREE.BackSide,
  });
  const haloMesh = new THREE.Mesh(haloGeom, haloMat);
  haloMesh.position.y = -600;
  scene.add(haloMesh);

  const horizonGeom = new THREE.TorusGeometry(80, 2.5, 8, 80);
  const horizonMat = new THREE.MeshBasicMaterial({
    color: 0x0077cc, transparent: true, opacity: 0.06,
  });
  const horizon = new THREE.Mesh(horizonGeom, horizonMat);
  horizon.rotation.x = Math.PI / 2;
  horizon.position.y = -0.5;
  scene.add(horizon);

  [{ y: 12,  r: 120, op: 0.022, col: 0x0055cc },
   { y: 25,  r: 110, op: 0.016, col: 0x003388 },
   { y: 50,  r: 100, op: 0.010, col: 0x001144 },
   { y: 80,  r:  90, op: 0.006, col: 0x000822 }].forEach(({ y, r, op, col }) => {
    const g = new THREE.CylinderGeometry(r, r, 0.4, 48, 1, true);
    const m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.y = y;
    scene.add(mesh);
  });
}
createAtmosphereLayers();

function createRocket(color) {
  const group = new THREE.Group();
  const R = 0.12;

  const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf4f5fa, roughness: 0.55, metalness: 0.15 });
  const dirtyWhiteMat = new THREE.MeshStandardMaterial({ color: 0xbdbfc8, roughness: 0.7, metalness: 0.2 });
  const blackMat = new THREE.MeshStandardMaterial({ color: 0x0d0f13, roughness: 0.85, metalness: 0.2 });
  const darkMetalMat = new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.4, metalness: 0.85 });
  const sootMat = new THREE.MeshStandardMaterial({ color: 0x1a160f, roughness: 0.95, metalness: 0.1 });
  const bellMat = new THREE.MeshStandardMaterial({ color: 0x4a4d55, roughness: 0.25, metalness: 0.95 });

  const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.86, 24), whiteMat);
  body.position.y = 0.05;
  body.castShadow = true;
  group.add(body);

  const soot = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.003, R * 1.003, 0.14, 24), sootMat);
  soot.position.y = -0.33;
  group.add(soot);

  const interstage = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 0.1, 24), blackMat);
  interstage.position.y = 0.535;
  interstage.castShadow = true;
  group.add(interstage);

  const stripeMat = new THREE.MeshStandardMaterial({
    color, roughness: 0.4, metalness: 0.4,
    emissive: color, emissiveIntensity: 0.25,
  });
  const stripe = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.005, R * 1.005, 0.03, 24), stripeMat);
  stripe.position.y = 0.46;
  group.add(stripe);

  for (let i = 0; i < 4; i++) {
    const raceway = new THREE.Mesh(
      new THREE.BoxGeometry(0.012, 0.78, 0.012),
      darkMetalMat,
    );
    raceway.position.set(Math.cos(i * Math.PI / 2) * (R + 0.005), 0.05, Math.sin(i * Math.PI / 2) * (R + 0.005));
    group.add(raceway);
  }

  const nose = new THREE.Mesh(new THREE.CylinderGeometry(0.03, R, 0.22, 24), whiteMat);
  nose.position.y = 0.7;
  nose.castShadow = true;
  group.add(nose);
  const noseCap = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), whiteMat);
  noseCap.position.y = 0.81;
  group.add(noseCap);

  const gridFins = [];
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Group();
    const frameMat = darkMetalMat;
    const FW = 0.09, FH = 0.065, FT = 0.007;

    const top    = new THREE.Mesh(new THREE.BoxGeometry(FW, FT, 0.015), frameMat);
    const bottom = new THREE.Mesh(new THREE.BoxGeometry(FW, FT, 0.015), frameMat);
    top.position.y    =  FH / 2;
    bottom.position.y = -FH / 2;
    fin.add(top, bottom);

    const left  = new THREE.Mesh(new THREE.BoxGeometry(FT, FH, 0.015), frameMat);
    const right = new THREE.Mesh(new THREE.BoxGeometry(FT, FH, 0.015), frameMat);
    left.position.x  = -FW / 2;
    right.position.x =  FW / 2;
    fin.add(left, right);

    for (let k = 1; k < 4; k++) {
      const v = new THREE.Mesh(new THREE.BoxGeometry(FT * 0.6, FH * 0.95, 0.012), frameMat);
      v.position.x = -FW / 2 + (FW / 4) * k;
      fin.add(v);
      const h = new THREE.Mesh(new THREE.BoxGeometry(FW * 0.95, FT * 0.6, 0.012), frameMat);
      h.position.y = -FH / 2 + (FH / 4) * k;
      fin.add(h);
    }

    const hinge = new THREE.Group();
    fin.position.x = FW / 2 + 0.005;
    hinge.add(fin);
    hinge.rotation.y = -Math.PI / 2;
    hinge.visible = false;

    const pivot = new THREE.Group();
    pivot.add(hinge);

    const angle = i * Math.PI / 2;
    pivot.position.set(Math.cos(angle) * R, 0.50, Math.sin(angle) * R);
    pivot.rotation.y = -angle;
    group.add(pivot);
    pivot.userData.hinge = hinge;
    gridFins.push(pivot);
  }

  const landingLegs = [];
  const STRUT_LEN = 0.42;
  for (let i = 0; i < 4; i++) {
    const legGroup = new THREE.Group();

    const mainStrut = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.018, STRUT_LEN, 10),
      dirtyWhiteMat,
    );
    mainStrut.position.y = STRUT_LEN / 2;
    legGroup.add(mainStrut);

    const foot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.038, 0.015, 12),
      darkMetalMat,
    );
    foot.position.y = STRUT_LEN + 0.008;
    legGroup.add(foot);

    const angle = i * Math.PI / 2;
    legGroup.position.set(Math.cos(angle) * (R - 0.005), -0.4, Math.sin(angle) * (R - 0.005));
    legGroup.rotation.y = -angle;
    legGroup.rotation.z = 0;
    group.add(legGroup);
    landingLegs.push(legGroup);
  }

  const octaweb = new THREE.Mesh(
    new THREE.CylinderGeometry(R * 1.08, R * 0.95, 0.05, 24),
    blackMat,
  );
  octaweb.position.y = -0.425;
  group.add(octaweb);

  const centerBell = new THREE.Mesh(
    new THREE.CylinderGeometry(0.032, 0.042, 0.055, 16),
    bellMat,
  );
  centerBell.position.y = -0.475;
  group.add(centerBell);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const bell = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.032, 0.05, 14),
      bellMat,
    );
    bell.position.set(Math.cos(a) * 0.07, -0.475, Math.sin(a) * 0.07);
    group.add(bell);
  }

  const engineLight = new THREE.PointLight(0xff6030, 0, 2);
  engineLight.position.y = -0.55;
  group.add(engineLight);

  const plume = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.55, 14),
    new THREE.MeshBasicMaterial({ color: 0xff6030, transparent: true, opacity: 0.6 }),
  );
  plume.rotation.x = Math.PI;
  plume.position.y = -0.82;
  group.add(plume);

  group.scale.setScalar(1.4);

  return { group, engineLight, plume, stripeMat, gridFins, landingLegs };
}

const particles = [];
const particleCount = 40;
const particleGroup = new THREE.Group();
scene.add(particleGroup);

for (let i = 0; i < particleCount; i++) {
  const geom = new THREE.SphereGeometry(0.02, 6, 6);
  const mat = new THREE.MeshBasicMaterial({ color: 0xff6030, transparent: true, opacity: 0.8 });
  const p = new THREE.Mesh(geom, mat);
  p.visible = false;
  particleGroup.add(p);
  particles.push({ mesh: p, life: 0, vel: new THREE.Vector3() });
}

function updateParticles(pos, vel, isActive, isLanding) {
  particles.forEach((p, i) => {
    if (!p.mesh.visible && isActive) {
      p.mesh.visible = true;
      p.mesh.position.copy(pos);
      p.life = 1.0;
      p.vel.copy(vel).multiplyScalar(-0.05).add(new THREE.Vector3(
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.02,
        (Math.random() - 0.5) * 0.02
      ));
      p.mesh.material.color.set(isLanding ? 0x30aaff : 0xff6030);
      return;
    }

    if (p.mesh.visible) {
      p.mesh.position.add(p.vel);
      p.life -= 0.05;
      p.mesh.scale.setScalar(p.life * 2);
      p.mesh.material.opacity = p.life;
      if (p.life <= 0) p.mesh.visible = false;
    }
  });
}

function createTrajectoryTube(trajectory, color, opacity = 0.8) {
  const pts = trajectory.points;
  if (pts.length < 2) return null;

  const group = new THREE.Group();

  const phaseColors = {
    powered:       new THREE.Color(0xff6030),
    'ascent-coast': new THREE.Color(0x00d4ff),
    entry:         new THREE.Color(0xffaa00),
    descent:       new THREE.Color(0xb48cff),
    'landing-burn': new THREE.Color(0x2ed573),
    touchdown:     new THREE.Color(0x2ed573),
  };

  const toScene = (p) => new THREE.Vector3(p.x * M_TO_SCENE, p.z * M_TO_SCENE, p.y * M_TO_SCENE);

  let currentPhase = pts[0].phase;
  let segPoints = [toScene(pts[0])];

  const addSegment = (points, phase) => {
    if (points.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeom = new THREE.TubeGeometry(curve, points.length * 3, 0.6, 6, false);
    const col = phaseColors[phase] || new THREE.Color(color);
    const mat = new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity
    });
    const tube = new THREE.Mesh(tubeGeom, mat);
    group.add(tube);

    const glowGeom = new THREE.TubeGeometry(curve, points.length * 2, 1.4, 6, false);
    const glowMat = new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: opacity * 0.15
    });
    group.add(new THREE.Mesh(glowGeom, glowMat));
  };

  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const vec = toScene(p);

    if (p.phase !== currentPhase || i === pts.length - 1) {
      segPoints.push(vec);
      addSegment(segPoints, currentPhase);
      currentPhase = p.phase;
      segPoints = [vec];
    } else {
      segPoints.push(vec);
    }
  }

  const lastPt = pts[pts.length - 1];
  const lastScene = toScene(lastPt);
  const markerGeom1 = new THREE.BoxGeometry(3.0, 0.3, 0.2);
  const markerGeom2 = new THREE.BoxGeometry(3.0, 0.3, 0.2);
  const markerMat = new THREE.MeshBasicMaterial({ color });
  const m1 = new THREE.Mesh(markerGeom1, markerMat);
  const m2 = new THREE.Mesh(markerGeom2, markerMat);
  m1.rotation.y = Math.PI / 4;
  m2.rotation.y = -Math.PI / 4;
  m1.position.set(lastScene.x, 0.5, lastScene.z);
  m2.position.set(lastScene.x, 0.5, lastScene.z);
  group.add(m1, m2);

  const ringGeom = new THREE.RingGeometry(3.0, 3.5, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.6, side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(lastScene.x, 0.6, lastScene.z);
  group.add(ring);

  const spikeGeom = new THREE.SphereGeometry(1.0, 12, 12);
  const spikeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const spike = new THREE.Mesh(spikeGeom, spikeMat);
  const startScene = toScene(pts[0]);
  spike.position.set(startScene.x, 1.0, startScene.z);
  group.add(spike);

  return group;
}

let rocketObj = null;
let trajectoryGroups = {};
let groundTrackLines = {};

function clearScene() {
  if (rocketObj) {
    scene.remove(rocketObj.group);
    rocketObj = null;
  }
  Object.values(trajectoryGroups).forEach(g => scene.remove(g));
  trajectoryGroups = {};
  Object.values(groundTrackLines).forEach(g => scene.remove(g));
  groundTrackLines = {};
}

function setTrajectoryVisibility(visible) {
  Object.values(trajectoryGroups).forEach(group => {
    if (group) group.visible = visible;
  });
  Object.values(groundTrackLines).forEach(line => {
    if (line) line.visible = visible;
  });
}

function buildScene() {
  clearScene();

  state.displaySites.forEach(siteName => {
    const site = SITES[siteName];
    const traj = TRAJECTORIES[siteName][state.activeWind];
    if (!traj) return;

    const isActive = siteName === state.activeSite;
    const opacity = isActive ? 0.9 : 0.3;

    const trajGroup = createTrajectoryTube(traj, site.color, opacity);
    if (trajGroup) {
      scene.add(trajGroup);
      trajectoryGroups[siteName] = trajGroup;
    }

    const pts2d = traj.points.filter((_, i) => i % 5 === 0).map(p =>
      new THREE.Vector3(p.x * M_TO_SCENE, 0.2, p.y * M_TO_SCENE)
    );
    if (pts2d.length >= 2) {
      const curve = new THREE.CatmullRomCurve3(pts2d);
      const geom = new THREE.TubeGeometry(curve, pts2d.length * 2, 0.3, 4, false);
      const mat = new THREE.MeshBasicMaterial({
        color: site.colorHex, transparent: true, opacity: isActive ? 0.4 : 0.1
      });
      const line = new THREE.Mesh(geom, mat);
      scene.add(line);
      groundTrackLines[siteName] = line;
    }
  });

  const site = SITES[state.activeSite];
  const rocket = createRocket(site.colorHex);
  scene.add(rocket.group);
  rocketObj = rocket;
  state.trajectory = TRAJECTORIES[state.activeSite][state.activeWind];
  state.frameIdx = 0;
  state.playbackTime = 0;
  setTrajectoryVisibility(state.showTrajectories);
}

const miniCanvas = document.getElementById('miniChart');
const miniCtx = miniCanvas.getContext('2d');

const PHASE_BANDS = {
  powered:        'rgba(255, 96, 48, 0.07)',
  'ascent-coast': 'rgba(0, 214, 255, 0.05)',
  entry:          'rgba(255, 170, 0, 0.06)',
  descent:        'rgba(180, 140, 255, 0.06)',
  'landing-burn': 'rgba(46, 213, 115, 0.08)',
};

function seekToTime(time) {
  const traj = state.trajectory;
  if (!traj) return;
  const t = THREE.MathUtils.clamp(time, 0, traj.flightTime);
  let idx = 0;
  while (idx < traj.points.length - 1 && traj.points[idx + 1].t <= t) idx++;
  state.frameIdx = idx;
  state.playbackTime = t;
}

miniCanvas.addEventListener('click', e => {
  const traj = state.trajectory;
  if (!traj || !traj.flightTime) return;
  const rect = miniCanvas.getBoundingClientRect();
  const frac = THREE.MathUtils.clamp((e.clientX - rect.left) / rect.width, 0, 1);
  seekToTime(frac * traj.flightTime);
  state.playing = false;
  document.getElementById('btnPlay').textContent = '▶';
});

function drawMiniChart(trajectory, currentIdx) {
  const pts = trajectory.points;
  if (!pts.length) return;
  const W = miniCanvas.width, H = miniCanvas.height;
  const padB = 10, padT = 8;
  miniCtx.clearRect(0, 0, W, H);

  const maxT   = Math.max(1, pts[pts.length - 1].t);
  const maxAlt = Math.max(1000, ...pts.map(p => p.z));
  const maxSpd = Math.max(10, ...pts.map(p => p.speed));
  const X = t => (t / maxT) * W;
  const Yalt = z => H - padB - (z / maxAlt) * (H - padT - padB);
  const Yspd = v => H - padB - (v / maxSpd) * (H - padT - padB);

  let bandStart = 0;
  const bandsEnd = [];
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].phase !== pts[i - 1].phase || i === pts.length - 1) {
      const col = PHASE_BANDS[pts[i - 1].phase];
      if (col) {
        miniCtx.fillStyle = col;
        miniCtx.fillRect(X(bandStart), 0, X(pts[i].t) - X(bandStart), H);
      }
      bandStart = pts[i].t;
    }
  }

  if (trajectory.events) {
    for (const ev of trajectory.events) {
      const x = X(ev.t);
      miniCtx.strokeStyle = 'rgba(255,255,255,0.14)';
      miniCtx.beginPath();
      miniCtx.moveTo(x, 2);
      miniCtx.lineTo(x, H - padB);
      miniCtx.stroke();
      miniCtx.fillStyle = 'rgba(255,255,255,0.4)';
      miniCtx.fillRect(x - 1.5, 0, 3, 3);
    }
  }

  miniCtx.strokeStyle = 'rgba(232,236,244,0.32)';
  miniCtx.lineWidth = 1;
  miniCtx.beginPath();
  pts.forEach((p, i) => {
    const x = X(p.t), y = Yspd(p.speed);
    if (i === 0) miniCtx.moveTo(x, y); else miniCtx.lineTo(x, y);
  });
  miniCtx.stroke();

  const gradFill = miniCtx.createLinearGradient(0, 0, 0, H);
  gradFill.addColorStop(0, 'rgba(0, 212, 255, 0.22)');
  gradFill.addColorStop(1, 'rgba(0, 212, 255, 0.01)');
  miniCtx.beginPath();
  pts.forEach((p, i) => {
    const x = X(p.t), y = Yalt(Math.max(0, p.z));
    if (i === 0) miniCtx.moveTo(x, y); else miniCtx.lineTo(x, y);
  });
  miniCtx.lineTo(X(pts[pts.length - 1].t), H - padB);
  miniCtx.lineTo(0, H - padB);
  miniCtx.closePath();
  miniCtx.fillStyle = gradFill;
  miniCtx.fill();

  miniCtx.strokeStyle = '#00d4ff';
  miniCtx.lineWidth = 1.5;
  miniCtx.beginPath();
  pts.forEach((p, i) => {
    const x = X(p.t), y = Yalt(Math.max(0, p.z));
    if (i === 0) miniCtx.moveTo(x, y); else miniCtx.lineTo(x, y);
  });
  miniCtx.stroke();

  const cp = pts[Math.min(currentIdx, pts.length - 1)];
  const cx = X(cp.t);
  miniCtx.strokeStyle = 'rgba(255,255,255,0.25)';
  miniCtx.lineWidth = 1;
  miniCtx.beginPath();
  miniCtx.moveTo(cx, 0);
  miniCtx.lineTo(cx, H);
  miniCtx.stroke();

  miniCtx.beginPath();
  miniCtx.arc(cx, Yalt(Math.max(0, cp.z)), 3, 0, Math.PI * 2);
  miniCtx.fillStyle = '#ffffff';
  miniCtx.fill();

  miniCtx.font = '600 7px Inter';
  miniCtx.fillStyle = 'rgba(125,135,152,0.9)';
  miniCtx.fillText('ALT', 3, 9);
}

const telAltVal  = document.getElementById('telAltVal');
const telSpdVal  = document.getElementById('telSpdVal');
const telMachVal = document.getElementById('telMachVal');
const telTVal    = document.getElementById('telTVal');
const flightPhaseEl = document.getElementById('flightPhase');
const liveDot = document.querySelector('.live-dot');
const thrFill = document.getElementById('thrFill');
const thrVal  = document.getElementById('thrVal');
const propAscentEl = document.getElementById('propAscent');
const propLandingEl = document.getElementById('propLanding');
const propValEl  = document.getElementById('propVal');
const attTickEl  = document.getElementById('attTick');
const pitchValEl = document.getElementById('pitchVal');
const finChipEl  = document.getElementById('finChip');

const TOTAL_PROP_KG = 1420;
const LANDING_PROP_KG = 320;

const phaseLabels = {
  powered:        { label: 'POWERED ASCENT',    color: '#ff6030' },
  'ascent-coast': { label: 'COAST / BOOSTBACK', color: '#00d4ff' },
  entry:          { label: 'ENTRY / GRID FINS', color: '#ffaa00' },
  descent:        { label: 'CONTROLLED DESCENT', color: '#b48cff' },
  'landing-burn': { label: 'LANDING BURN',      color: '#2ed573' },
  touchdown:      { label: 'TOUCHDOWN',         color: '#2ed573' },
};

function updateTelemetry(pt) {
  if (!pt) return;

  const isEnd = state.frameIdx >= state.trajectory.points.length - 1;
  const dispAltKm = isEnd ? 0 : pt.z / 1000;
  const dispSpd   = isEnd ? 0 : pt.speed;
  const dispMach  = isEnd ? 0 : pt.mach;

  telAltVal.textContent  = dispAltKm.toFixed(2) + ' km';
  telSpdVal.textContent  = Math.round(dispSpd) + ' m/s';
  telMachVal.textContent = dispMach.toFixed(2);
  telTVal.textContent    = Math.round(pt.t) + 's';

  const ph = phaseLabels[pt.phase] || { label: pt.phase.toUpperCase(), color: '#00d4ff' };
  flightPhaseEl.textContent = ph.label;
  liveDot.style.background  = ph.color;

  const throttlePct = Math.round((pt.throttle || 0) * 100);
  thrFill.style.height = throttlePct + '%';
  thrFill.style.backgroundColor = ph.color;
  thrVal.textContent = throttlePct + '%';

  let ascKg = 0, lndKg = 0;
  const propKg = (pt.propPct ?? 100) / 100 * TOTAL_PROP_KG;
  if (pt.t < (state.trajectory.burnoutTime ?? 0)) {
    lndKg = LANDING_PROP_KG;
    ascKg = Math.max(0, propKg - LANDING_PROP_KG);
  } else {
    lndKg = Math.min(LANDING_PROP_KG, propKg);
  }
  propAscentEl.style.width  = (ascKg / TOTAL_PROP_KG * 100) + '%';
  propLandingEl.style.width = (lndKg / TOTAL_PROP_KG * 100) + '%';
  propValEl.textContent = Math.round(pt.propPct ?? 100) + '%';

  const tiltDeg = pt.pitchDeg ?? 0;
  attTickEl.style.transform = `translate(-50%, -50%) rotate(${tiltDeg.toFixed(1)}deg)`;
  pitchValEl.textContent = Math.round(tiltDeg) + '\u00B0';

  const gf = pt.gridFin ?? 0;
  if (gf < 0.02) {
    finChipEl.textContent = 'STOWED';
    finChipEl.className = 'fin-chip stowed';
  } else if (gf >= 0.995) {
    finChipEl.textContent = 'OUT';
    finChipEl.className = 'fin-chip out';
  } else {
    finChipEl.textContent = 'DEPLOYING';
    finChipEl.className = 'fin-chip deploying';
  }

  updateAnnunciator(pt);
  updateSkyColor(dispAltKm);

  const pct = state.frameIdx / (state.trajectory.points.length - 1);
  document.getElementById('timelineProg').style.width = (pct * 100) + '%';
  document.getElementById('scrubBar').value = Math.round(pct * 100);
}

function updateAnnunciator(pt) {
  const traj = state.trajectory;
  const el = document.getElementById('statusText');
  if (!traj || !el) return;

  let status = "";
  if (traj.liftoffTime !== null && pt.t >= traj.liftoffTime && pt.t < traj.liftoffTime + 2) status = "LIFT OFF";
  else if (state.maxQPoint && pt.t >= state.maxQPoint.t - 1 && pt.t <= state.maxQPoint.t + 1) status = "MAX-Q";
  else if (traj.burnoutTime && pt.t > traj.burnoutTime - 1 && pt.t < traj.burnoutTime + 1) status = "MECO";
  else if ((pt.throttle || 0) > 0.3 && pt.phase === 'ascent-coast' && !annunciatorStates.boostback) { status = "BOOSTBACK"; annunciatorStates.boostback = true; }
  else if (traj.apogeeTime && pt.t > traj.apogeeTime - 1 && pt.t < traj.apogeeTime + 1) status = "APOGEE REACHED";
  else if (pt.phase === 'entry' && !annunciatorStates.entry) { status = "ENTRY INTERFACE"; annunciatorStates.entry = true; }
  else if (pt.landingBurn && !annunciatorStates.landing) { status = "LANDING BURN"; annunciatorStates.landing = true; }

  if (status && status !== lastStatus) {
    el.textContent = status;
    el.classList.add('visible');
    lastStatus = status;
    setTimeout(() => { if(el && el.textContent === status) el.classList.remove('visible'); }, 3000);
  }
}

let lastStatus = "";
const annunciatorStates = { entry: false, landing: false, boostback: false };

function updateSkyColor(alt) {
  const t = Math.min(1, alt / 80);
  const r = Math.round(2  * (1 - t));
  const g = Math.round(4  * (1 - t));
  const b = Math.round(14 * (1 - t) + 2);
  renderer.setClearColor(new THREE.Color(`rgb(${r},${g},${b})`));
}

const TIMELINE_EVENTS = ['LAUNCH', 'MECO', 'APOGEE', 'FIN DEPLOY', 'LANDING BURN', 'TOUCHDOWN'];
const TIMELINE_SHORT = { LAUNCH: 'LIFTOFF', MECO: 'MECO', APOGEE: 'APOGEE', 'FIN DEPLOY': 'FINS OUT', 'LANDING BURN': 'LDG BURN', TOUCHDOWN: 'TOUCHDOWN' };

function buildTimelineMarkers(traj) {
  const wrap = document.getElementById('timelineMarkers');
  if (!wrap || !traj.events) return;
  const T = Math.max(1, traj.flightTime);
  wrap.innerHTML = traj.events
    .filter(ev => TIMELINE_EVENTS.includes(ev.label))
    .map(ev => `
      <div class="phase-marker" style="left:${(ev.t / T) * 100}%">
        <div class="phase-line"></div>
        <div class="phase-label">${TIMELINE_SHORT[ev.label] || ev.label}\u00A0${Math.round(ev.t)}s</div>
      </div>
    `).join('');
}

function updateRightPanel() {
  const traj = state.trajectory;
  if (!traj || !traj.metrics) return;

  const m = traj.metrics;

  document.getElementById('mApogee').textContent = m.apogee.toFixed(1);
  document.getElementById('mMach').textContent   = m.maxMach.toFixed(2);
  document.getElementById('mMaxQ').textContent   = m.maxQ.toFixed(1);
  document.getElementById('mLand').textContent   = m.landSpeed.toFixed(1);
  document.getElementById('chartDrift').textContent = 'DRIFT ' + m.drift.toFixed(2) + ' km';

  state.maxQPoint = traj.points.reduce(
    (best, p) => (p.dynPressKPa > best.dynPressKPa ? p : best),
    traj.points[0]
  );

  buildTimelineMarkers(traj);
}

const cameraTarget = new THREE.Vector3(0, 12, 0);
const cameraOffset = {
  follow: new THREE.Vector3(6, 2, 12),
  overview: new THREE.Vector3(220, 260, 220),
  top: new THREE.Vector3(0, 700, 0.01),
};
let camSmooth = new THREE.Vector3(8, 4, 30);
let targetSmooth = new THREE.Vector3(0, 12, 0);

function updateCamera(rocketPos) {
  let desiredPos, desiredTarget;

  if (state.viewMode === 'follow') {
    const offset = cameraOffset.follow.clone();
    desiredPos = rocketPos.clone().add(offset);
    desiredTarget = rocketPos.clone();
  } else if (state.viewMode === 'overview') {
    desiredPos = cameraOffset.overview.clone();
    desiredTarget = new THREE.Vector3(0, rocketPos.y * 0.5, 0);
  } else {
    desiredPos = new THREE.Vector3(rocketPos.x, Math.max(60, rocketPos.y * 1.4 + 40), rocketPos.z);
    desiredTarget = new THREE.Vector3(rocketPos.x, 0, rocketPos.z);
  }

  const lerpFactor = state.viewMode === 'follow' ? 0.08 : 0.03;
  camSmooth.lerp(desiredPos, lerpFactor);
  targetSmooth.lerp(desiredTarget, lerpFactor);
  camera.position.copy(camSmooth);
  camera.lookAt(targetSmooth);
}

let isDragging = false, prevMouse = { x: 0, y: 0 };
let orbitTheta = 0.5, orbitPhi = 0.8, orbitRadius = 320;
let orbitCenter = new THREE.Vector3(0, 80, 0);

canvas.addEventListener('mousedown', e => { isDragging = true; prevMouse = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener('mouseup', () => isDragging = false);
canvas.addEventListener('mousemove', e => {
  if (!isDragging || state.viewMode === 'follow') return;
  const dx = e.clientX - prevMouse.x;
  const dy = e.clientY - prevMouse.y;
  orbitTheta -= dx * 0.005;
  orbitPhi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, orbitPhi - dy * 0.005));
  prevMouse = { x: e.clientX, y: e.clientY };
  updateOrbitCamera();
});
canvas.addEventListener('wheel', e => {
  if (state.viewMode === 'follow') return;
  orbitRadius = Math.max(5, Math.min(2000, orbitRadius + e.deltaY * 0.5));
  updateOrbitCamera();
}, { passive: true });

function updateOrbitCamera() {
  const x = orbitCenter.x + orbitRadius * Math.sin(orbitPhi) * Math.cos(orbitTheta);
  const y = orbitCenter.y + orbitRadius * Math.cos(orbitPhi);
  const z = orbitCenter.z + orbitRadius * Math.sin(orbitPhi) * Math.sin(orbitTheta);
  camera.position.set(x, y, z);
  camera.lookAt(orbitCenter);
}

const clock = new THREE.Clock();
let animFrameCounter = 0;

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  animFrameCounter++;

  const traj = state.trajectory;
  if (!traj) { renderer.render(scene, camera); return; }

  if (state.playing) {
    state.playbackTime += delta * state.speed;
    while (state.frameIdx < traj.points.length - 1
        && traj.points[state.frameIdx + 1].t <= state.playbackTime) {
      state.frameIdx++;
    }
    if (state.playbackTime >= traj.flightTime) {
      state.playbackTime = traj.flightTime;
      state.frameIdx = traj.points.length - 1;
      state.playing = false;
      document.getElementById('btnPlay').textContent = '▶';
      showToast('Mission complete. Booster landed.');
    }
  }

  const currentPt = traj.points[state.frameIdx];
  const nextPt = traj.points[Math.min(state.frameIdx + 1, traj.points.length - 1)];
  const sampleSpan = nextPt.t - currentPt.t;
  const sampleMix = sampleSpan > 0
    ? THREE.MathUtils.clamp((state.playbackTime - currentPt.t) / sampleSpan, 0, 1)
    : 0;
  const pt = {
    ...currentPt,
    t: THREE.MathUtils.lerp(currentPt.t, nextPt.t, sampleMix),
    x: THREE.MathUtils.lerp(currentPt.x, nextPt.x, sampleMix),
    y: THREE.MathUtils.lerp(currentPt.y, nextPt.y, sampleMix),
    z: THREE.MathUtils.lerp(currentPt.z, nextPt.z, sampleMix),
    vx: THREE.MathUtils.lerp(currentPt.vx, nextPt.vx, sampleMix),
    vy: THREE.MathUtils.lerp(currentPt.vy, nextPt.vy, sampleMix),
    vz: THREE.MathUtils.lerp(currentPt.vz, nextPt.vz, sampleMix),
    speed: THREE.MathUtils.lerp(currentPt.speed, nextPt.speed, sampleMix),
    mach: THREE.MathUtils.lerp(currentPt.mach, nextPt.mach, sampleMix),
    throttle: THREE.MathUtils.lerp(currentPt.throttle || 0, nextPt.throttle || 0, sampleMix),
    pitchDeg: THREE.MathUtils.lerp(currentPt.pitchDeg || 0, nextPt.pitchDeg || 0, sampleMix),
    gridFin: THREE.MathUtils.lerp(currentPt.gridFin || 0, nextPt.gridFin || 0, sampleMix),
    landingThrottle: THREE.MathUtils.lerp(currentPt.landingThrottle || 0, nextPt.landingThrottle || 0, sampleMix),
    landingDirX: THREE.MathUtils.lerp(currentPt.landingDirX || 0, nextPt.landingDirX || 0, sampleMix),
    landingDirY: THREE.MathUtils.lerp(currentPt.landingDirY || 0, nextPt.landingDirY || 0, sampleMix),
    landingDirZ: THREE.MathUtils.lerp(currentPt.landingDirZ ?? 1, nextPt.landingDirZ ?? 1, sampleMix),
  };

  const rocketPos = new THREE.Vector3(
    pt.x * M_TO_SCENE,
    Math.max(0, pt.z) * M_TO_SCENE + _rocketGroundOffset,
    pt.y * M_TO_SCENE,
  );

  if (rocketObj) {
    rocketObj.group.position.copy(rocketPos);
    const velocity = new THREE.Vector3(pt.vx || 0, pt.vz || 0, pt.vy || 0);
    const velocityDir = velocity.clone();
    const velLen = velocityDir.length();
    if (velLen > 0.01) velocityDir.divideScalar(velLen);

    const landingThrustDir = new THREE.Vector3(
      pt.landingDirX || 0,
      pt.landingDirZ ?? 1,
      pt.landingDirY || 0,
    ).normalize();

    if (velLen > 10 || pt.landingBurn) {
      let orientDir;
      if (pt.landingBurn) {
        orientDir = landingThrustDir;
      } else {
        orientDir = velocityDir.clone();
        const boostingBack = pt.phase === 'ascent-coast' && (pt.throttle || 0) > 0.3;
        if ((pt.phase !== 'powered' && pt.vz < -20) || boostingBack) orientDir.negate();
      }

      const worldUp = Math.abs(orientDir.y) > 0.999
        ? new THREE.Vector3(0, 0, 1)
        : new THREE.Vector3(0, 1, 0);
      const mat4 = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), orientDir, worldUp);
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(mat4);
      targetQuat.multiply(_rocketCorrQuat);

      const turnRate = pt.landingBurn ? 1.2 : pt.phase === 'powered' ? 4 : 2.2;
      const turnBlend = 1 - Math.exp(-turnRate * Math.min(delta, 0.05));
      rocketObj.group.quaternion.slerp(targetQuat, turnBlend);
    }

    const isPowered = pt.phase === 'powered';
    const isLanding = !!pt.landingBurn;
    const thr = THREE.MathUtils.clamp(pt.throttle || 0, 0, 1);
    const isActive = thr > 0.02;

    const flicker = Math.sin(animFrameCounter * 0.3) * 0.12;
    rocketObj.engineLight.intensity = isActive ? (0.8 + thr * (2.6 + flicker)) : 0;
    if (isPowered)      { rocketObj.engineLight.color.set(0xff6030); rocketObj.plume.material.color.set(0xffb060); }
    else                { rocketObj.engineLight.color.set(0x30aaff); rocketObj.plume.material.color.set(0x88ccff); }
    rocketObj.plume.visible = isActive;

    updateParticles(rocketPos, isLanding ? landingThrustDir : velocityDir, isActive, isLanding);

    const gfTarget = THREE.MathUtils.clamp(pt.gridFin || 0, 0, 1);
    rocketObj.gridFins.forEach(gf => {
      const hinge = gf.userData.hinge;
      hinge.visible = gfTarget > 0.02;
      hinge.rotation.y = -Math.PI / 2 * (1 - gfTarget);
      gf.rotation.z = -0.55 * gfTarget;
    });

    const legT = THREE.MathUtils.clamp((450 - pt.z) / 370, 0, 1);
    const legDeploy = legT * legT * (3 - 2 * legT);
    const legBlend = 1 - Math.exp(-3 * Math.min(delta, 0.05));
    rocketObj.landingLegs.forEach(leg => {
      const targetRot = -2.15 * legDeploy;
      leg.rotation.z += (targetRot - leg.rotation.z) * legBlend;
    });

    if (rocketObj.plume.visible) {
      rocketObj.plume.material.opacity = (0.25 + thr * 0.45) + Math.sin(animFrameCounter * 0.5) * 0.1;
      const plumeScale = (0.22 + thr * 0.95) * (isPowered ? 1.0 : 0.55) + Math.random() * 0.06;
      rocketObj.plume.scale.set(
        0.6 + thr * 0.6,
        plumeScale,
        0.6 + thr * 0.6
      );
    }
  }

  updateCamera(rocketPos);

  if (animFrameCounter % 2 === 0) {
    updateTelemetry(pt);
    drawMiniChart(traj, state.frameIdx);
  }

  if (animFrameCounter % 30 === 0) updateTrajectoryOpacities();

  renderer.render(scene, camera);
}

function updateTrajectoryOpacities() {
  Object.entries(trajectoryGroups).forEach(([name, group]) => {
    if (!group) return;
    const isActive = name === state.activeSite;
    const opacity = isActive ? 0.9 : 0.3;
    group.traverse(child => {
      if (child.isMesh && child.material && child.material.transparent) {
        child.material.opacity = opacity * (child.material.opacity > 0.5 ? 1 : 0.15);
      }
    });
  });
  setTrajectoryVisibility(state.showTrajectories);
}

function buildSitePanel() {
  const siteList = document.getElementById('siteList');
  siteList.innerHTML = Object.entries(SITES).map(([key, site]) => `
    <button class="site-btn ${key === state.activeSite ? 'active' : ''}"
            id="siteBtn_${key}" onclick="selectSite('${key}')">
      <div class="site-dot" style="background:${site.color}"></div>
      <div class="site-info">
        <div class="site-name">${site.name}</div>
        <div class="site-desc">${site.region}</div>
        <div class="site-loc">${Math.abs(site.lat).toFixed(2)}\u00B0${site.lat >= 0 ? 'N' : 'S'} ${Math.abs(site.lon).toFixed(2)}\u00B0${site.lon >= 0 ? 'E' : 'W'}</div>
      </div>
    </button>
  `).join('');

  const windList = document.getElementById('windList');
  windList.innerHTML = Object.entries(WIND_CONDITIONS).map(([key, w]) => `
    <button class="seg-btn ${key === state.activeWind ? 'active' : ''}"
            id="windBtn_${key}" onclick="selectWind('${key}')">
      <span class="wind-name">${w.label}</span>
      <span class="wind-speed">${w.speed.replace('~', '')}</span>
    </button>
  `).join('');
}

window.selectSite = function(key) {
  state.activeSite = key;
  state.frameIdx = 0;
  state.playing = false;
  document.getElementById('btnPlay').textContent = '▶';
  buildScene();
  updateRightPanel();
  buildSitePanel();
  setViewMode('follow');
  showToast(`Loading ${SITES[key].fullName}`);
};

window.selectWind = function(key) {
  state.activeWind = key;
  state.frameIdx = 0;
  state.playbackTime = 0;
  buildScene();
  updateRightPanel();
  document.querySelectorAll('#windList .seg-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`windBtn_${key}`).classList.add('active');
  showToast(`Wind: ${WIND_CONDITIONS[key].label} (${WIND_CONDITIONS[key].speed})`);
};

function setViewMode(mode) {
  state.viewMode = mode;
  document.querySelectorAll('#viewBtns .seg-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === mode);
  });
  if (mode !== 'follow') {
    orbitCenter.set(0, 80, 0);
    updateOrbitCamera();
  }
}

document.querySelectorAll('#viewBtns .seg-btn').forEach(btn => {
  btn.addEventListener('click', () => setViewMode(btn.dataset.view));
});

document.getElementById('panelToggle').addEventListener('click', () => {
  if (window.innerWidth <= 900) {
    document.body.classList.toggle('panel-open');
  } else {
    document.body.classList.toggle('panel-hidden');
  }
});

function updateTrajectoryToggleLabel() {
  const btn = document.getElementById('btnToggleTraj');
  if (!btn) return;
  btn.textContent = state.showTrajectories ? 'Trails on' : 'Trails off';
  btn.classList.toggle('active', state.showTrajectories);
}

document.getElementById('btnPlay').onclick = () => {
  if (state.frameIdx >= state.trajectory.points.length - 1) {
    state.frameIdx = 0;
    state.playbackTime = 0;
  }
  state.playing = !state.playing;
  document.getElementById('btnPlay').textContent = state.playing ? '⏸' : '▶';
  if (state.playing) showToast('Simulation running');
};

document.getElementById('btnRewind').onclick = () => {
  state.frameIdx = 0;
  state.playbackTime = 0;
  state.playing = false;
  document.getElementById('btnPlay').textContent = '▶';

  lastStatus = "";
  annunciatorStates.entry = false;
  annunciatorStates.landing = false;
  annunciatorStates.boostback = false;

  updateTelemetry(state.trajectory.points[0]);
  drawMiniChart(state.trajectory, 0);
  showToast('Reset to launch');
};

document.getElementById('btnFwd').onclick = () => {
  state.speed = Math.min(state.speed * 2, 8);
  document.getElementById('speedVal').textContent = 'x' + state.speed;
  document.getElementById('speedSlider').value = state.speed;
};

document.getElementById('speedSlider').oninput = function() {
  state.speed = parseFloat(this.value);
  document.getElementById('speedVal').textContent = 'x' + state.speed;
};

document.getElementById('scrubBar').oninput = function() {
  const pct = parseFloat(this.value) / 100;
  state.frameIdx = Math.floor(pct * (state.trajectory.points.length - 1));
  state.playbackTime = state.trajectory.points[state.frameIdx].t;
  state.playing = false;
  document.getElementById('btnPlay').textContent = '▶';
};

function showToast(msg, duration = 2800) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function simulateLoading(onComplete) {
  const fill = document.getElementById('loaderFill');
  const pct  = document.getElementById('loaderPct');
  let progress = 0;

  const steps = [[15, 300], [40, 600], [65, 400], [85, 500], [100, 300]];

  let i = 0;
  function step() {
    if (i >= steps.length) {
      setTimeout(() => {
        document.getElementById('loader').classList.add('fade-out');
        setTimeout(() => {
          document.getElementById('loader').remove();
          onComplete();
        }, 700);
      }, 200);
      return;
    }
    const [target, delay] = steps[i++];
    const interval = setInterval(() => {
      progress = Math.min(target, progress + 1);
      fill.style.width = progress + '%';
      pct.textContent = progress + '%';
      if (progress >= target) {
        clearInterval(interval);
        setTimeout(step, delay);
      }
    }, 20);
  }
  step();
}

function init() {
  simulateLoading(() => {
    showToast('System ready');
    setTimeout(() => {
      state.playing = true;
      document.getElementById('btnPlay').textContent = '⏸';
      showToast('Ignition sequence start');
    }, 1000);
  });
  buildSitePanel();
  buildScene();
  updateRightPanel();
  document.getElementById('btnToggleTraj').onclick = () => {
    state.showTrajectories = !state.showTrajectories;
    setTrajectoryVisibility(state.showTrajectories);
    updateTrajectoryToggleLabel();
  };
  updateTrajectoryToggleLabel();
  document.getElementById('speedSlider').value = state.speed;
  document.getElementById('speedVal').textContent = 'x' + state.speed;

  animate();
}

init();
