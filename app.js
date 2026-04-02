/**
 * UK Reusable Booster — Three.js 3D Simulation Engine
 * =====================================================
 * Features:
 *  - Animated rocket mesh with engine glow & exhaust plume
 *  - Trajectory tubes with colour-coded phases
 *  - Star field background
 *  - Atmosphere layer glow
 *  - Launch pad ground plane
 *  - Camera modes: Follow, Overview, Top-Down
 *  - Real-time telemetry, minimap chart
 *  - Site & wind condition switching
 */

// ══════════════════════════════════════════════════════════════════
//  CONSTANTS & STATE
// ══════════════════════════════════════════════════════════════════
const THREE = window.THREE;

// Precomputed quaternion for rocket orientation correction (local -PI/2 X rotation).
// Applied after Matrix4.lookAt so the nose (+Y local) aligns with the desired direction.
const _rocketCorrQuat = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

// Distance from rocket group pivot to engine end (local 0.55 × scale 0.35).
// Used to keep the rocket sitting on the ground rather than clipping through it.
const _rocketGroundOffset = 0.55 * 0.35; // 0.1925 km

const state = {
  activeSite: 'Sutherland',
  activeWind: 'moderate',
  playing: false,
  frameIdx: 0,
  speed: 1,         // frames per animation tick
  viewMode: 'follow', // follow | overview | top
  showTrajectories: false,
  trajectory: null,
  displaySites: ['Sutherland', 'SaxaVord', 'Prestwick', 'Snowdonia', 'Cornwall'],
};

// ══════════════════════════════════════════════════════════════════
//  SCENE SETUP
// ══════════════════════════════════════════════════════════════════
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
// No fog — it muddies depth in a space scene

const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 8000);
camera.position.set(6, 3, 22);
camera.lookAt(0, 8, 0);

// ── Lighting ──────────────────────────────────────────────────
const ambientLight = new THREE.AmbientLight(0x08091a, 2.5);
scene.add(ambientLight);

// Primary sun — low angle for dramatic shadows
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

// Blue Earth-reflected fill from below
const fillLight = new THREE.DirectionalLight(0x2255aa, 0.6);
fillLight.position.set(-20, -10, -15);
scene.add(fillLight);

// Cool rim from opposite side
const rimLight = new THREE.DirectionalLight(0x004488, 0.4);
rimLight.position.set(-60, 30, -40);
scene.add(rimLight);

// ══════════════════════════════════════════════════════════════════
//  STAR FIELD
// ══════════════════════════════════════════════════════════════════
function createStarField() {
  // Layer 1: dense small stars
  const count = 10000;
  const geom = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const theta = Math.random() * Math.PI * 2;
    // Bias toward upper hemisphere so stars appear above horizon
    const phi = Math.acos(1 - Math.random() * 1.6);
    const r = 2000 + Math.random() * 1000;
    positions[i*3]   = r * Math.sin(phi) * Math.cos(theta);
    positions[i*3+1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i*3+2] = r * Math.cos(phi);
    const brightness = 0.3 + Math.random() * 0.7;
    // Slight warm/cool variation
    const warm = Math.random();
    colors[i*3]   = brightness * (0.85 + warm * 0.15);
    colors[i*3+1] = brightness * (0.88 + warm * 0.05);
    colors[i*3+2] = brightness;
  }
  geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.PointsMaterial({ size: 0.8, vertexColors: true, sizeAttenuation: true });
  scene.add(new THREE.Points(geom, mat));

  // Layer 2: a few bright foreground stars
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

// ══════════════════════════════════════════════════════════════════
//  GROUND PLANE (Launch Pad Area)
// ══════════════════════════════════════════════════════════════════
function createGround() {
  // Clean dark tarmac surface
  const geom = new THREE.PlaneGeometry(300, 300, 1, 1);
  const mat = new THREE.MeshStandardMaterial({
    color: 0x080c18, roughness: 0.95, metalness: 0.05,
  });
  const ground = new THREE.Mesh(geom, mat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Fine grid — thin cyan lines
  const gridHelper = new THREE.GridHelper(200, 80, 0x0a1f3a, 0x060f1e);
  gridHelper.position.y = 0.01;
  scene.add(gridHelper);

  // Launch pad base
  const padGeom = new THREE.CircleGeometry(2.5, 48);
  const padMat = new THREE.MeshStandardMaterial({
    color: 0x0d1a30, roughness: 0.6, metalness: 0.3,
    emissive: 0x001830, emissiveIntensity: 0.4,
  });
  const pad = new THREE.Mesh(padGeom, padMat);
  pad.rotation.x = -Math.PI / 2;
  pad.position.y = 0.02;
  scene.add(pad);

  // Outer accent ring
  const ring1Geom = new THREE.RingGeometry(2.4, 2.55, 48);
  const ring1Mat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  const ring1 = new THREE.Mesh(ring1Geom, ring1Mat);
  ring1.rotation.x = -Math.PI / 2;
  ring1.position.y = 0.03;
  scene.add(ring1);

  // Inner accent ring
  const ring2Geom = new THREE.RingGeometry(0.6, 0.72, 32);
  const ring2Mat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, side: THREE.DoubleSide, transparent: true, opacity: 0.6 });
  const ring2 = new THREE.Mesh(ring2Geom, ring2Mat);
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.y = 0.03;
  scene.add(ring2);

  // Crosshair lines on pad
  const crossMat = new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.35 });
  [[2.5, 0.02, 0.02], [0.02, 0.02, 2.5]].forEach(([w, h, d]) => {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), crossMat);
    bar.position.y = 0.04;
    scene.add(bar);
  });

  // Pad point light for glow on ground
  const padLight = new THREE.PointLight(0x00aaff, 0.8, 6);
  padLight.position.set(0, 0.5, 0);
  scene.add(padLight);

  return { pad, ring: ring1, light: padLight };
}
const ground = createGround();

// ══════════════════════════════════════════════════════════════════
//  ATMOSPHERE LAYERS
// ══════════════════════════════════════════════════════════════════
function createAtmosphereLayers() {
  // Earth sphere — radius 600, sits below scene, surface tangent at y=0
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

  // Atmosphere halo — slightly larger, BackSide glow
  const haloGeom = new THREE.SphereGeometry(610, 64, 32);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x0055aa,
    transparent: true, opacity: 0.18,
    side: THREE.BackSide,
  });
  const haloMesh = new THREE.Mesh(haloGeom, haloMat);
  haloMesh.position.y = -600;
  scene.add(haloMesh);

  // Thin horizon glow ring at ground level
  const horizonGeom = new THREE.TorusGeometry(80, 2.5, 8, 80);
  const horizonMat = new THREE.MeshBasicMaterial({
    color: 0x0077cc, transparent: true, opacity: 0.06,
  });
  const horizon = new THREE.Mesh(horizonGeom, horizonMat);
  horizon.rotation.x = Math.PI / 2;
  horizon.position.y = -0.5;
  scene.add(horizon);

  // Altitude haze bands — troposphere, stratosphere, mesosphere (km units)
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

// ══════════════════════════════════════════════════════════════════
//  ROCKET MESH (procedural 14m booster)
// ══════════════════════════════════════════════════════════════════
function createRocket(color) {
  const group = new THREE.Group();

  // Body cylinder
  const bodyGeom = new THREE.CylinderGeometry(0.12, 0.12, 1.0, 16);
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0xe8eaf6, roughness: 0.3, metalness: 0.8
  });
  const body = new THREE.Mesh(bodyGeom, bodyMat);
  body.castShadow = true;
  group.add(body);

  // Nose cone (ogive)
  const noseGeom = new THREE.ConeGeometry(0.12, 0.3, 16);
  const noseMat = new THREE.MeshStandardMaterial({
    color: 0xccddff, roughness: 0.2, metalness: 0.9
  });
  const nose = new THREE.Mesh(noseGeom, noseMat);
  nose.position.y = 0.65;
  nose.castShadow = true;
  group.add(nose);

  // Color stripe (site colour band)
  const stripeGeom = new THREE.CylinderGeometry(0.121, 0.121, 0.15, 16);
  const stripeMat = new THREE.MeshStandardMaterial({
    color: color, roughness: 0.2, metalness: 0.6,
    emissive: color, emissiveIntensity: 0.4
  });
  const stripe = new THREE.Mesh(stripeGeom, stripeMat);
  stripe.position.y = 0.25;
  group.add(stripe);

  // ── GRID FINS (top) ──────────────────────────────────────────
  const gridFins = [];
  for (let i = 0; i < 4; i++) {
    const gfGeom = new THREE.BoxGeometry(0.12, 0.08, 0.01);
    const gfMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
    const gf = new THREE.Mesh(gfGeom, gfMat);
    gf.position.set(Math.cos(i * Math.PI/2) * 0.12, 0.45, Math.sin(i * Math.PI/2) * 0.12);
    gf.rotation.y = i * Math.PI/2;
    group.add(gf);
    gridFins.push(gf);
  }

  // ── LANDING LEGS (bottom) ──────────────────────────────────────
  const landingLegs = [];
  for (let i = 0; i < 4; i++) {
    const legGroup = new THREE.Group();
    const legGeom = new THREE.CylinderGeometry(0.01, 0.01, 0.3, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.5 });
    const leg = new THREE.Mesh(legGeom, legMat);
    leg.position.y = -0.15;
    legGroup.add(leg);
    legGroup.position.set(Math.cos(i * Math.PI/2) * 0.12, -0.4, Math.sin(i * Math.PI/2) * 0.12);
    legGroup.rotation.y = i * Math.PI/2;
    legGroup.rotation.z = 0.1; // Stowed
    group.add(legGroup);
    landingLegs.push(legGroup);
  }

  // Engine bell
  const nozzleGeom = new THREE.CylinderGeometry(0.09, 0.13, 0.12, 16);
  const nozzleMat = new THREE.MeshStandardMaterial({
    color: 0x445566, roughness: 0.2, metalness: 0.95
  });
  const nozzle = new THREE.Mesh(nozzleGeom, nozzleMat);
  nozzle.position.y = -0.55;
  group.add(nozzle);

  // Engine glow point light
  const engineLight = new THREE.PointLight(0xff6030, 0, 2);
  engineLight.position.y = -0.6;
  group.add(engineLight);

  // Exhaust plume (cone particle effect using geometry)
  const plumeGeom = new THREE.ConeGeometry(0.08, 0.5, 12);
  const plumeMat = new THREE.MeshBasicMaterial({
    color: 0xff6030, transparent: true, opacity: 0.6
  });
  const plume = new THREE.Mesh(plumeGeom, plumeMat);
  plume.rotation.x = Math.PI;
  plume.position.y = -0.85;
  group.add(plume);

  // Scale rocket for visibility in km-scale scene
  group.scale.setScalar(0.35);

  return { group, engineLight, plume, stripeMat, gridFins, landingLegs };
}

// ══════════════════════════════════════════════════════════════════
//  PARTICLE SYSTEM (Exhaust Plume)
// ══════════════════════════════════════════════════════════════════
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
      // Emit downwards with some spread
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

// ══════════════════════════════════════════════════════════════════
//  TRAJECTORY TUBE
// ══════════════════════════════════════════════════════════════════
function createTrajectoryTube(trajectory, color, opacity = 0.8) {
  const pts = trajectory.points;
  if (pts.length < 2) return null;

  const group = new THREE.Group();

  // Colour phases
  const phaseColors = {
    powered: new THREE.Color(0xff6030),
    coast:   new THREE.Color(0x00d4ff),
    entry:   new THREE.Color(0xffaa00),
    descent: new THREE.Color(0x7b2ff7),
    landing: new THREE.Color(0x2ed573),
  };

  // Build segments by phase
  let currentPhase = pts[0].phase;
  let segPoints = [new THREE.Vector3(pts[0].x, pts[0].z, pts[0].y)];

  const addSegment = (points, phase) => {
    if (points.length < 2) return;
    const curve = new THREE.CatmullRomCurve3(points);
    const tubeGeom = new THREE.TubeGeometry(curve, points.length * 3, 0.04, 6, false);
    const col = phaseColors[phase] || new THREE.Color(color);
    const mat = new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity
    });
    const tube = new THREE.Mesh(tubeGeom, mat);
    group.add(tube);

    // Glow duplicate (thicker, more transparent)
    const glowGeom = new THREE.TubeGeometry(curve, points.length * 2, 0.1, 6, false);
    const glowMat = new THREE.MeshBasicMaterial({
      color: col, transparent: true, opacity: opacity * 0.15
    });
    group.add(new THREE.Mesh(glowGeom, glowMat));
  };

  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const vec = new THREE.Vector3(p.x, p.z, p.y);

    if (p.phase !== currentPhase || i === pts.length - 1) {
      segPoints.push(vec);
      addSegment(segPoints, currentPhase);
      currentPhase = p.phase;
      segPoints = [vec];
    } else {
      segPoints.push(vec);
    }
  }

  // Landing marker (X)
  const lastPt = pts[pts.length - 1];
  const markerGeom1 = new THREE.BoxGeometry(0.3, 0.03, 0.02);
  const markerGeom2 = new THREE.BoxGeometry(0.3, 0.03, 0.02);
  const markerMat = new THREE.MeshBasicMaterial({ color });
  const m1 = new THREE.Mesh(markerGeom1, markerMat);
  const m2 = new THREE.Mesh(markerGeom2, markerMat);
  m1.rotation.y = Math.PI / 4;
  m2.rotation.y = -Math.PI / 4;
  m1.position.set(lastPt.x, 0.05, lastPt.y);
  m2.position.set(lastPt.x, 0.05, lastPt.y);
  group.add(m1, m2);

  // Landing ring pulse
  const ringGeom = new THREE.RingGeometry(0.3, 0.35, 24);
  const ringMat = new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.6, side: THREE.DoubleSide
  });
  const ring = new THREE.Mesh(ringGeom, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(lastPt.x, 0.06, lastPt.y);
  group.add(ring);

  // Launch spike
  const spikeGeom = new THREE.SphereGeometry(0.12, 12, 12);
  const spikeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const spike = new THREE.Mesh(spikeGeom, spikeMat);
  spike.position.set(pts[0].x, 0.1, pts[0].y);
  group.add(spike);

  return group;
}

// ══════════════════════════════════════════════════════════════════
//  SCENE OBJECTS (managed)
// ══════════════════════════════════════════════════════════════════
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

  // Create trajectories for all sites (overview shows all)
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

    // Ground track (projected shadow)
    const pts2d = traj.points.filter((_, i) => i % 5 === 0).map(p =>
      new THREE.Vector3(p.x, 0.02, p.y)
    );
    if (pts2d.length >= 2) {
      const curve = new THREE.CatmullRomCurve3(pts2d);
      const geom = new THREE.TubeGeometry(curve, pts2d.length * 2, 0.02, 4, false);
      const mat = new THREE.MeshBasicMaterial({
        color: site.colorHex, transparent: true, opacity: isActive ? 0.4 : 0.1
      });
      const line = new THREE.Mesh(geom, mat);
      scene.add(line);
      groundTrackLines[siteName] = line;
    }
  });

  // Create animated rocket for active site
  const site = SITES[state.activeSite];
  const rocket = createRocket(site.colorHex);
  scene.add(rocket.group);
  rocketObj = rocket;
  state.trajectory = TRAJECTORIES[state.activeSite][state.activeWind];
  state.frameIdx = 0;
  setTrajectoryVisibility(state.showTrajectories);
}

// ══════════════════════════════════════════════════════════════════
//  MINI CHART
// ══════════════════════════════════════════════════════════════════
const miniCanvas = document.getElementById('miniChart');
const miniCtx = miniCanvas.getContext('2d');

function drawMiniChart(trajectory, currentIdx) {
  const pts = trajectory.points;
  const W = miniCanvas.width, H = miniCanvas.height;
  miniCtx.clearRect(0, 0, W, H);

  // Background
  miniCtx.fillStyle = 'rgba(10,12,30,0.6)';
  miniCtx.fillRect(0, 0, W, H);

  const maxAlt = Math.max(...pts.map(p => p.z));
  const maxT   = pts[pts.length - 1].t;

  // Draw altitude curve
  const gradient = miniCtx.createLinearGradient(0, 0, 0, H);
  gradient.addColorStop(0, 'rgba(0,212,255,0.8)');
  gradient.addColorStop(1, 'rgba(123,47,247,0.2)');

  miniCtx.beginPath();
  pts.forEach((p, i) => {
    const x = (p.t / maxT) * W;
    const y = H - (p.z / maxAlt) * (H - 8) - 4;
    if (i === 0) miniCtx.moveTo(x, y);
    else miniCtx.lineTo(x, y);
  });
  miniCtx.strokeStyle = 'rgba(0,212,255,0.8)';
  miniCtx.lineWidth = 1.5;
  miniCtx.stroke();

  // Fill under curve
  if (pts.length > 0) {
    miniCtx.lineTo((pts[pts.length-1].t / maxT) * W, H);
    miniCtx.lineTo(0, H);
    miniCtx.closePath();
    miniCtx.fillStyle = gradient;
    miniCtx.fill();
  }

  // Current position marker
  if (currentIdx < pts.length) {
    const cp = pts[currentIdx];
    const cx = (cp.t / maxT) * W;
    const cy = H - (cp.z / maxAlt) * (H - 8) - 4;
    miniCtx.beginPath();
    miniCtx.arc(cx, cy, 3, 0, Math.PI * 2);
    miniCtx.fillStyle = '#ffffff';
    miniCtx.fill();

    // Vertical line
    miniCtx.beginPath();
    miniCtx.moveTo(cx, 0);
    miniCtx.lineTo(cx, H);
    miniCtx.strokeStyle = 'rgba(255,255,255,0.2)';
    miniCtx.lineWidth = 1;
    miniCtx.stroke();
  }

  // Phase labels
  miniCtx.font = '7px Inter';
  miniCtx.fillStyle = 'rgba(255,255,255,0.3)';
  miniCtx.fillText('LAUNCH', 2, H - 3);
  miniCtx.fillText('ALT', 2, 10);
}

// ══════════════════════════════════════════════════════════════════
//  TELEMETRY UPDATE
// ══════════════════════════════════════════════════════════════════
const telAltVal  = document.getElementById('telAltVal');
const telSpdVal  = document.getElementById('telSpdVal');
const telMachVal = document.getElementById('telMachVal');
const telTVal    = document.getElementById('telTVal');
const flightPhaseEl = document.getElementById('flightPhase');
const liveDot = document.querySelector('.live-dot');

const phaseLabels = {
  powered: { label: 'POWERED ASCENT',      color: '#ff6030' },
  coast:   { label: 'COAST — NEAR SPACE',  color: '#00d4ff' },
  entry:   { label: 'ENTRY — GRID FINS',   color: '#ffaa00' },
  descent: { label: 'CONTROLLED DESCENT',  color: '#7b2ff7' },
  landing: { label: 'LANDING SEQUENCE',    color: '#2ed573' },
};

function updateTelemetry(pt) {
  if (!pt) return;

  // Cleanup for end state (Touchdown)
  const isEnd = state.frameIdx >= state.trajectory.points.length - 1;
  const dispAlt = isEnd ? 0 : pt.z;
  const dispSpd = isEnd ? 0 : pt.speed;
  const dispMach = isEnd ? 0 : pt.mach;

  telAltVal.textContent  = dispAlt.toFixed(2) + ' km';
  telSpdVal.textContent  = Math.round(dispSpd) + ' m/s';
  telMachVal.textContent = dispMach.toFixed(2);
  telTVal.textContent    = Math.round(pt.t) + 's';

  const ph = phaseLabels[pt.phase] || { label: pt.phase.toUpperCase(), color: '#00d4ff' };
  flightPhaseEl.textContent = ph.label;
  liveDot.style.background  = ph.color;

  // Status Annunciator Logic
  updateAnnunciator(pt);

  // Background sky transition
  updateSkyColor(dispAlt);

  const pct = state.frameIdx / (state.trajectory.points.length - 1);
  document.getElementById('timelineProg').style.width = (pct * 100) + '%';
  document.getElementById('scrubBar').value = Math.round(pct * 100);
}

function updateAnnunciator(pt) {
  const traj = state.trajectory;
  const el = document.getElementById('statusText');
  if (!traj || !el) return;

  let status = "";
  if (traj.liftoffTime && pt.t >= traj.liftoffTime && pt.t < traj.liftoffTime + 2) status = "LIFT OFF";
  else if (pt.t > 15 && pt.t < 18) status = "MAX-Q";
  else if (traj.burnoutTime && pt.t > traj.burnoutTime - 1 && pt.t < traj.burnoutTime + 1) status = "MECO";
  else if (traj.apogeeTime && pt.t > traj.apogeeTime - 1 && pt.t < traj.apogeeTime + 1) status = "APOGEE REACHED";
  else if (pt.phase === 'entry' && !annunciatorStates.entry) { status = "ENTRY BURN"; annunciatorStates.entry = true; }
  else if (pt.phase === 'landing' && !annunciatorStates.landing) { status = "LANDING BURN"; annunciatorStates.landing = true; }

  if (status && status !== lastStatus) {
    el.textContent = status;
    el.classList.add('visible');
    lastStatus = status;
    setTimeout(() => { if(el && el.textContent === status) el.classList.remove('visible'); }, 3000);
  }
}

let lastStatus = "";
const annunciatorStates = { entry: false, landing: false };

function updateSkyColor(alt) {
  // 0 km = deep navy, 20 km = dark blue-black, 80+ km = true space black
  const t = Math.min(1, alt / 80);
  const r = Math.round(2  * (1 - t));
  const g = Math.round(4  * (1 - t));
  const b = Math.round(14 * (1 - t) + 2);
  renderer.setClearColor(new THREE.Color(`rgb(${r},${g},${b})`));
}

// ══════════════════════════════════════════════════════════════════
//  RIGHT PANEL: ALL METRICS
// ══════════════════════════════════════════════════════════════════
function updateRightPanel() {
  const traj = state.trajectory;
  if (!traj || !traj.metrics) return;

  const m = traj.metrics;
  const site = SITES[state.activeSite];
  const wind = WIND_CONDITIONS[state.activeWind];

  document.getElementById('mApogee').textContent = m.apogee.toFixed(1);
  document.getElementById('mMach').textContent   = m.maxMach.toFixed(2);
  document.getElementById('mDrift').textContent  = m.drift.toFixed(2);
  document.getElementById('mLand').textContent   = m.landSpeed.toFixed(1);

}

// ══════════════════════════════════════════════════════════════════
//  CAMERA CONTROL
// ══════════════════════════════════════════════════════════════════
const cameraTarget = new THREE.Vector3(0, 12, 0);
const cameraOffset = {
  follow: new THREE.Vector3(1.5, 0.5, 3),
  overview: new THREE.Vector3(20, 30, 20),
  top: new THREE.Vector3(0, 45, 0.01),
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
    desiredTarget = new THREE.Vector3(3, 0, 3);
  } else {
    // top
    desiredPos = new THREE.Vector3(rocketPos.x, 50, rocketPos.z);
    desiredTarget = new THREE.Vector3(rocketPos.x, 0, rocketPos.z);
  }

  const lerpFactor = state.viewMode === 'follow' ? 0.08 : 0.03;
  camSmooth.lerp(desiredPos, lerpFactor);
  targetSmooth.lerp(desiredTarget, lerpFactor);
  camera.position.copy(camSmooth);
  camera.lookAt(targetSmooth);
}

// ── Orbit Controls (manual) ──────────────────────────
let isDragging = false, prevMouse = { x: 0, y: 0 };
let orbitTheta = 0.5, orbitPhi = 0.8, orbitRadius = 30;
let orbitCenter = new THREE.Vector3(3, 4, 3);

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
  orbitRadius = Math.max(5, Math.min(120, orbitRadius + e.deltaY * 0.05));
  updateOrbitCamera();
}, { passive: true });

function updateOrbitCamera() {
  const x = orbitCenter.x + orbitRadius * Math.sin(orbitPhi) * Math.cos(orbitTheta);
  const y = orbitCenter.y + orbitRadius * Math.cos(orbitPhi);
  const z = orbitCenter.z + orbitRadius * Math.sin(orbitPhi) * Math.sin(orbitTheta);
  camera.position.set(x, y, z);
  camera.lookAt(orbitCenter);
}

// ══════════════════════════════════════════════════════════════════
//  ANIMATION LOOP
// ══════════════════════════════════════════════════════════════════
const clock = new THREE.Clock();
let animFrameCounter = 0;

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  animFrameCounter++;

  const traj = state.trajectory;
  if (!traj) { renderer.render(scene, camera); return; }

  // Advance frame
  if (state.playing) {
    for (let s = 0; s < state.speed; s++) {
      if (state.frameIdx < traj.points.length - 1) {
        state.frameIdx++;
      } else {
        state.playing = false;
        document.getElementById('btnPlay').textContent = '▶';
        showToast('🛬 Mission Complete — Booster Landed');
        break;
      }
    }
  }

  const pt = traj.points[state.frameIdx];
  if (!pt) { renderer.render(scene, camera); return; }

  const rocketPos = new THREE.Vector3(pt.x, pt.z, pt.y);

  // Update rocket position & orientation
  if (rocketObj) {
    rocketObj.group.position.copy(rocketPos);
    // Clamp rocket so the engine bell never clips below ground (pivot is 0.1925 km above engine end)
    if (rocketObj.group.position.y < _rocketGroundOffset) {
      rocketObj.group.position.y = _rocketGroundOffset;
    }

    // Rocket orientation — booster landing profile:
    //   Ascent  (powered + rising coast): nose tracks velocity → nose up, engines down, thrust up ✓
    //   Descent (falling coast, entry, descent): nose opposes velocity → stays nose-up, engines
    //     face Earth for retrograde braking.
    //   Landing: progressively blended to vertical so the rocket stands upright at touchdown.
    //   Wide lookahead during coast smooths the velocity near apogee (speed ≈ 0).
    //   Quaternion slerp gives deliberate, realistic maneuver timing — no snapping.
    const velocity = new THREE.Vector3(pt.vx || 0, pt.vz || 0, pt.vy || 0);
    const velocityDir = velocity.clone();
    const velLen = velocityDir.length();
    if (velLen > 0.001) {
      velocityDir.divideScalar(velLen);
      let orientDir = velocityDir.clone();
      if (pt.phase !== 'powered') {
        const clearlyDescending = pt.vz < -20 || pt.phase === 'entry' || pt.phase === 'descent' || pt.phase === 'landing';
        if (clearlyDescending) orientDir.negate();
      }

      if (pt.phase === 'coast') {
        const apexBlend = THREE.MathUtils.clamp(1 - velLen / 90, 0, 0.85);
        orientDir.lerp(new THREE.Vector3(0, 1, 0), apexBlend);
        orientDir.normalize();
      }

      // Landing: quadratic blend toward world-up so the rocket is perfectly vertical at touchdown.
      // pt.z is altitude in km; landing phase spans roughly 0–1 km.
      if (pt.phase === 'landing') {
        const blend = Math.pow(1.0 - Math.min(pt.z, 1.0), 2);
        orientDir.lerp(new THREE.Vector3(0, 1, 0), blend);
        orientDir.normalize();
      }

      // Avoid gimbal lock when pointing straight up or down
      const worldUp = Math.abs(orientDir.y) > 0.999
        ? new THREE.Vector3(0, 0, 1)
        : new THREE.Vector3(0, 1, 0);
      const mat4 = new THREE.Matrix4().lookAt(new THREE.Vector3(0, 0, 0), orientDir, worldUp);
      const targetQuat = new THREE.Quaternion().setFromRotationMatrix(mat4);
      targetQuat.multiply(_rocketCorrQuat); // aligns nose (+Y local) with orientDir

      // Slerp rates: slow deliberate flip during coast; fast correction during landing
      let slerpRate = 0.12;
      if (pt.phase === 'coast')   slerpRate = velLen < 120 ? 0.012 : 0.02;
      else if (pt.phase === 'landing') slerpRate = 0.20;
      rocketObj.group.quaternion.slerp(targetQuat, slerpRate);
    }

    // Engine glow & plume during powered phase
    const isPowered = pt.phase === 'powered';
    const isLanding = pt.phase === 'landing';
    const isActive = isPowered || isLanding;

    const glowIntensity = isActive ? 3 + Math.sin(animFrameCounter * 0.3) * 0.5 : 0;
    rocketObj.engineLight.intensity = glowIntensity * 0.5;
    rocketObj.engineLight.color.set(isPowered ? 0xff6030 : 0x30aaff);
    rocketObj.plume.visible = isActive;

    updateParticles(rocketPos, velocityDir, isActive, isLanding);

    // Grid fins & Landing legs animation
    const isDescent = pt.phase === 'descent' || pt.phase === 'landing';
    rocketObj.gridFins.forEach(gf => {
      gf.rotation.x = isDescent ? Math.sin(animFrameCounter * 0.1) * 0.3 : 0;
    });
    
    const isLandingPhase = pt.phase === 'landing';
    rocketObj.landingLegs.forEach(leg => {
      const targetRot = isLandingPhase ? 1.0 : 0.1;
      leg.rotation.z += (targetRot - leg.rotation.z) * 0.05;
    });

    if (rocketObj.plume.visible) {
      rocketObj.plume.material.opacity = 0.4 + Math.sin(animFrameCounter * 0.5) * 0.2;
      const plumeScale = isPowered ? 1.0 + Math.random() * 0.15 : 0.5 + Math.random() * 0.1;
      rocketObj.plume.scale.setScalar(plumeScale);
    }
  }

  // Camera
  updateCamera(rocketPos);

  // Telemetry (every 2 frames for performance)
  if (animFrameCounter % 2 === 0) {
    updateTelemetry(pt);
    drawMiniChart(traj, state.frameIdx);
  }

  // Animate landing rings pulse
  animFrameCounter % 30 === 0 && updateTrajectoryOpacities();

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

// ══════════════════════════════════════════════════════════════════
//  UI BUILDING
// ══════════════════════════════════════════════════════════════════
function buildSitePanel() {
  const siteList = document.getElementById('siteList');
  siteList.innerHTML = Object.entries(SITES).map(([key, site]) => `
    <button class="site-btn ${key === state.activeSite ? 'active' : ''}"
            id="siteBtn_${key}" onclick="selectSite('${key}')">
      <div class="site-dot" style="background:${site.color};color:${site.color}"></div>
      <div class="site-info">
        <div class="site-name">${site.name}</div>
        <div class="site-desc">${site.fullName}</div>
        <div class="site-loc">${site.lat.toFixed(2)}°N ${Math.abs(site.lon).toFixed(2)}°W</div>
      </div>
    </button>
  `).join('');

  const windList = document.getElementById('windList');
  windList.innerHTML = Object.entries(WIND_CONDITIONS).map(([key, w]) => `
    <button class="wind-btn ${key === state.activeWind ? 'active' : ''}"
            id="windBtn_${key}" onclick="selectWind('${key}')">
      <div class="wind-name">${w.label} (${w.beaufort})</div>
      <div class="wind-speed">${w.speed}</div>
    </button>
  `).join('');
}

// ══════════════════════════════════════════════════════════════════
//  ACTIONS
// ══════════════════════════════════════════════════════════════════
window.selectSite = function(key) {
  state.activeSite = key;
  state.frameIdx = 0;
  state.playing = false;
  document.getElementById('btnPlay').textContent = '▶';
  buildScene();
  updateRightPanel();
  buildSitePanel();
  setViewMode('follow');
  showToast(`🚀 Loading ${SITES[key].fullName}`);
};

window.selectWind = function(key) {
  state.activeWind = key;
  state.frameIdx = 0;
  buildScene();
  updateRightPanel();
  document.querySelectorAll('.wind-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`windBtn_${key}`).classList.add('active');
  showToast(`💨 Wind: ${WIND_CONDITIONS[key].label} — ${WIND_CONDITIONS[key].speed}`);
};

function setViewMode(mode) {
  state.viewMode = mode;
  document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
  const map = { follow: 'btnFollow', overview: 'btnOverview', top: 'btnTop' };
  document.getElementById(map[mode]).classList.add('active');
  if (mode !== 'follow') {
    orbitCenter.set(3, 4, 3);
    updateOrbitCamera();
  }
}

document.getElementById('btnFollow').onclick   = () => setViewMode('follow');
document.getElementById('btnOverview').onclick = () => setViewMode('overview');
document.getElementById('btnTop').onclick      = () => setViewMode('top');

function updateTrajectoryToggleLabel() {
  const btn = document.getElementById('btnToggleTraj');
  if (!btn) return;
  btn.textContent = state.showTrajectories ? 'Trails On' : 'Trails Off';
  btn.classList.toggle('active', state.showTrajectories);
}

// Playback
document.getElementById('btnPlay').onclick = () => {
  if (state.frameIdx >= state.trajectory.points.length - 1) {
    state.frameIdx = 0;
  }
  state.playing = !state.playing;
  document.getElementById('btnPlay').textContent = state.playing ? '⏸' : '▶';
  if (state.playing) showToast('▶ Simulation Running');
};

document.getElementById('btnRewind').onclick = () => {
  state.frameIdx = 0;
  state.playing = false;
  document.getElementById('btnPlay').textContent = '▶';
  
  // Reset annunciator states
  lastStatus = "";
  annunciatorStates.entry = false;
  annunciatorStates.landing = false;

  updateTelemetry(state.trajectory.points[0]);
  drawMiniChart(state.trajectory, 0);
  showToast('⏮ Reset to launch');
};

document.getElementById('btnFwd').onclick = () => {
  state.speed = Math.min(state.speed * 2, 32);
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
  state.playing = false;
  document.getElementById('btnPlay').textContent = '▶';
};

// ══════════════════════════════════════════════════════════════════
//  TOAST NOTIFICATIONS
// ══════════════════════════════════════════════════════════════════
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

// ══════════════════════════════════════════════════════════════════
//  RESIZE HANDLER
// ══════════════════════════════════════════════════════════════════
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ══════════════════════════════════════════════════════════════════
//  LOADING ANIMATION
// ══════════════════════════════════════════════════════════════════
function simulateLoading() {
  const fill = document.getElementById('loaderFill');
  const pct  = document.getElementById('loaderPct');
  let progress = 0;

  const steps = [
    [15, 300, 'Generating trajectories…'],
    [40, 600, 'Building 3D scene…'],
    [65, 400, 'Loading rocket geometry…'],
    [85, 500, 'Initialising renderer…'],
    [100, 300, 'Ready!'],
  ];

  let i = 0;
  function step() {
    if (i >= steps.length) {
      setTimeout(() => {
        document.getElementById('loader').classList.add('fade-out');
        setTimeout(() => document.getElementById('loader').remove(), 700);
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

// ══════════════════════════════════════════════════════════════════
//  INIT
// ══════════════════════════════════════════════════════════════════
function init() {
  simulateLoading();
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

  setTimeout(() => {
    showToast('🚀 System Launch Sequence Initialized…');
    // Ensure playback starts reliably
    setTimeout(() => {
      state.playing = true;
      document.getElementById('btnPlay').textContent = '⏸';
      showToast('▶ Ignition Sequence Start');
    }, 1000);
  }, 1000);

  animate();
}

init();
