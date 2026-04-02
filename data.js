/**
 * UK Reusable Booster — Trajectory Data
 * =======================================
 * Physics matched to booster_sim.py:
 *   - 14m booster, 2600 kg wet mass, 1500 kg dry mass
 *   - 65 kN time-varying thrust, Isp = 295 s, 49 s burn
 *   - Actual DRAG_OFF / DRAG_ON tables from Python sim
 *   - Height-varying wind (boundary layer + jet stream)
 *   - 3-stage cascaded drag descent (grid fins → entry brake → landing brake)
 *   - ISA density + temperature-correct sound speed
 *   - Apogee ~80–90 km
 *
 * Coordinate system: local ENU (East, North, Up in km)
 */

// ── Site Definitions ─────────────────────────────────────────────
const SITES = {
  Sutherland: {
    name: "Sutherland",
    fullName: "Sutherland Space Hub",
    region: "Highland, Scotland",
    lat: 58.51, lon: -4.27,
    color: "#ff4757", colorHex: 0xff4757,
    heading: 175
  },
  SaxaVord: {
    name: "SaxaVord",
    fullName: "SaxaVord Spaceport",
    region: "Unst, Shetland",
    lat: 60.75, lon: -0.88,
    color: "#1e90ff", colorHex: 0x1e90ff,
    heading: 180
  },
  Prestwick: {
    name: "Prestwick",
    fullName: "Glasgow Prestwick Spaceport",
    region: "Ayrshire, Scotland",
    lat: 55.51, lon: -4.59,
    color: "#2ed573", colorHex: 0x2ed573,
    heading: 185
  },
  Snowdonia: {
    name: "Snowdonia",
    fullName: "Snowdonia Aerospace Centre",
    region: "Llanbedr, Wales",
    lat: 52.82, lon: -4.12,
    color: "#ff9f43", colorHex: 0xff9f43,
    heading: 190
  },
  Cornwall: {
    name: "Cornwall",
    fullName: "Spaceport Cornwall",
    region: "Newquay Airport",
    lat: 50.44, lon: -5.00,
    color: "#a29bfe", colorHex: 0xa29bfe,
    heading: 200
  }
};

// ── Wind Conditions (UK south-westerlies) ────────────────────────
const WIND_CONDITIONS = {
  calm:     { label: "Calm",     beaufort: "B1-2", speed: "~2 m/s",  wu: 1.5,  wv: 1.0  },
  moderate: { label: "Moderate", beaufort: "B4",   speed: "~9 m/s",  wu: 7.0,  wv: 5.5  },
  strong:   { label: "Strong",   beaufort: "B7",   speed: "~17 m/s", wu: 14.0, wv: 9.5  },
  storm:    { label: "Storm",    beaufort: "B10",  speed: "~28 m/s", wu: 24.0, wv: 16.0 },
};

// ── Trajectory Generator ─────────────────────────────────────────
function generateTrajectory(site, windKey) {
  const wind = WIND_CONDITIONS[windKey];
  const wu_ref = wind.wu, wv_ref = wind.wv;
  const headingRad = (site.heading - 90) * Math.PI / 180;

  // ── Booster constants (booster_sim.py) ──
  const DRY_MASS   = 1500;   // kg
  const PROP_MASS  = 1100;   // kg
  const WET_MASS   = 2600;   // kg
  const BURN_TIME  = 49;     // s
  const G0         = 9.80665;
  const LAUNCH_INCLINATION = 89 * Math.PI / 180; // RocketPy uses 89 deg as near-vertical launch
  const RAIL_LENGTH = 20;                 // meters, matching booster_sim.py
  const LANDING_BURN_START = 1800;        // meters AGL for active landing guidance
  const LANDING_THRUST_MAX = 45000;       // N, throttled single-engine class landing burn
  const LANDING_RESPONSE = 1.8;           // seconds, smooth velocity tracking
  const LANDING_TILT_LIMIT = 18 * Math.PI / 180;
  const CROSS_AREA = Math.PI * 0.6 * 0.6; // m²  (radius 0.6 m)

  // ── Thrust curve (GenericMotor from booster_sim.py) ──
  const THRUST_CURVE = [
    [0.0, 0], [0.5, 30000], [1.5, 63000], [2.0, 66000],
    [10.0, 65000], [30.0, 65500], [44.0, 65000],
    [47.5, 64000], [48.5, 35000], [49.0, 0]
  ];

  // ── Drag tables (booster_sim.py DRAG_OFF / DRAG_ON) ──
  const DRAG_OFF = [
    [0.00, 0.44], [0.30, 0.42], [0.60, 0.46], [0.75, 0.58],
    [0.90, 0.78], [1.00, 0.90], [1.10, 0.84], [1.30, 0.72],
    [1.50, 0.64], [2.00, 0.55], [3.00, 0.48], [5.00, 0.40]
  ];
  // Power-on drag ~15% lower (plume base pressure effect)
  const DRAG_ON = DRAG_OFF.map(([m, cd]) => [m, cd * 0.85]);

  // ── ISA atmosphere ──
  function rho(h) {
    if (h <= 0)     return 1.225;
    if (h < 11000)  return 1.225 * Math.pow(1 - 2.2558e-5 * h, 4.2561);
    if (h < 25000)  return 0.3639 * Math.exp(-1.5788e-4 * (h - 11000));
    if (h < 47000)  return 0.0889 * Math.exp(-1.2e-4   * (h - 25000));
    return           0.0020 * Math.exp(-1.5e-4   * (h - 47000));
  }

  // ISA sound speed (temperature-correct)
  function soundSpeed(h) {
    if (h < 11000) return 20.05 * Math.sqrt(288.15 - 6.5 * h / 1000);
    if (h < 25000) return 295.1; // isothermal layer
    return 20.05 * Math.sqrt(216.65 + 2.8 * (h - 25000) / 1000);
  }

  // ── Table interpolation ──
  function interp(table, x) {
    if (x <= table[0][0])                 return table[0][1];
    if (x >= table[table.length - 1][0]) return table[table.length - 1][1];
    for (let i = 1; i < table.length; i++) {
      if (x <= table[i][0]) {
        const frac = (x - table[i-1][0]) / (table[i][0] - table[i-1][0]);
        return table[i-1][1] + frac * (table[i][1] - table[i-1][1]);
      }
    }
    return table[table.length - 1][1];
  }

  // ── Height-varying wind profile (booster_sim.py) ──
  function windAtH(h) {
    if (h <= 0) return [wu_ref * 0.05, wv_ref * 0.05];
    if (h <= 1000) {
      const z0 = 0.03;
      const f = Math.log(Math.max(h, z0) / z0) / Math.log(10 / z0);
      return [wu_ref * Math.min(f, 1.0), wv_ref * Math.min(f, 1.0)];
    }
    if (h <= 11000) {
      const f = 1.0 + 0.6 * (h - 1000) / 10000;
      return [wu_ref * f, wv_ref * f];
    }
    if (h <= 13000) return [wu_ref * 1.6, wv_ref * 1.6];  // jet stream
    const f = Math.max(0.1, 1.6 - 1.5 * (h - 13000) / 30000);
    return [wu_ref * f, wv_ref * f];
  }

  // ── 3-stage cascaded drag descent (booster_sim.py) ──
  // CdS values match the Python AirBrakes stages exactly
  function descentCdS(h, vz) {
    if (vz >= 0) return 0;          // ascending — no augmentation
    if (h > 10000) return 25.0;     // stage 1: grid fins (25 m²)
    if (h > 1000)  return 50.0;     // stage 2: + entry brake (50 m² total)
    return 250.0;                   // stage 3: + landing brake (250 m² total)
  }

  // ── Integration ──
  let vx = 0, vy = 0, vz = 0;
  let px = 0, py = 0, pz = 0;
  const dt = 0.25; // finer step for accuracy at high thrust
  const points = [];
  let apogeeTime = 0;
  let liftoffTime = null;
  let maxDynPressKPa = 0;
  let maxG = 0;
  let recordEvery = Math.round(0.5 / dt); // record every 0.5 s
  let stepCount = 0;
  let releasedFromPad = false;
  const railUnit = {
    x: Math.cos(LAUNCH_INCLINATION) * Math.cos(headingRad),
    y: Math.cos(LAUNCH_INCLINATION) * Math.sin(headingRad),
    z: Math.sin(LAUNCH_INCLINATION),
  };

  for (let t = 0; t <= 1200; t += dt, stepCount++) {
    const isPowered = t < BURN_TIME;
    const mass = isPowered
      ? WET_MASS - (PROP_MASS / BURN_TIME) * t
      : DRY_MASS;

    const h = pz;
    const landingBurnActive = !isPowered && h <= LANDING_BURN_START && vz < 0;
    const rhoH   = rho(Math.max(0, h));
    const cs     = soundSpeed(Math.max(0, h));
    const [wu, wv] = windAtH(h);

    // Airspeed relative to local wind
    const relvx = vx - wu;
    const relvy = vy - wv;
    const relSpd = Math.sqrt(relvx*relvx + relvy*relvy + vz*vz);
    const mach   = relSpd / cs;

    const dynPressKPa = 0.5 * rhoH * relSpd * relSpd / 1000;
    if (dynPressKPa > maxDynPressKPa) maxDynPressKPa = dynPressKPa;

    // Body drag
    const dragTable = isPowered ? DRAG_ON : DRAG_OFF;
    const cd  = interp(dragTable, mach);
    const Fd  = cd * 0.5 * rhoH * relSpd * relSpd * CROSS_AREA;
    const Fdx = relSpd > 0.01 ? -Fd * (relvx / relSpd) : 0;
    const Fdy = relSpd > 0.01 ? -Fd * (relvy / relSpd) : 0;
    const Fdz = relSpd > 0.01 ? -Fd * (vz   / relSpd) : 0;

    // Descent drag augmentation
    const cdS = landingBurnActive ? 18.0 : descentCdS(h, vz);
    let FaugX = 0, FaugY = 0, FaugZ = 0;
    if (cdS > 0 && relSpd > 0.01) {
      const Faug = cdS * 0.5 * rhoH * relSpd * relSpd;
      FaugX = -Faug * (relvx / relSpd);
      FaugY = -Faug * (relvy / relSpd);
      FaugZ = -Faug * (vz    / relSpd);
    }

    const Fgz = -mass * G0;

    let Flx = 0, Fly = 0, Flz = 0;
    let landingThrottle = 0;
    if (landingBurnActive) {
      const targetVz = -Math.max(3, Math.min(35, h / 55));
      const desiredAx = -vx / LANDING_RESPONSE;
      const desiredAy = -vy / LANDING_RESPONSE;
      const desiredAz = (targetVz - vz) / LANDING_RESPONSE;

      let cmdX = mass * desiredAx - (Fdx + FaugX);
      let cmdY = mass * desiredAy - (Fdy + FaugY);
      let cmdZ = mass * desiredAz - (Fdz + FaugZ + Fgz);

      const horizCmd = Math.sqrt(cmdX * cmdX + cmdY * cmdY);
      const minVerticalCmd = horizCmd / Math.tan(LANDING_TILT_LIMIT);
      cmdZ = Math.max(cmdZ, minVerticalCmd, 0);

      const cmdMag = Math.sqrt(cmdX * cmdX + cmdY * cmdY + cmdZ * cmdZ);
      if (cmdMag > 0.01) {
        const limitedMag = Math.min(cmdMag, LANDING_THRUST_MAX);
        const scale = limitedMag / cmdMag;
        Flx = cmdX * scale;
        Fly = cmdY * scale;
        Flz = cmdZ * scale;
        landingThrottle = limitedMag / LANDING_THRUST_MAX;
      }
    }

    // Thrust — small gravity-turn tilt (0.04 rad) toward site heading
    const F_thrust = isPowered ? interp(THRUST_CURVE, t) : 0;
    const Ftx = isPowered ? F_thrust * railUnit.x : 0;
    const Fty = isPowered ? F_thrust * railUnit.y : 0;
    const Ftz = isPowered ? F_thrust * railUnit.z : 0;

    const ax = (Ftx + Flx + Fdx + FaugX) / mass;
    const ay = (Fty + Fly + Fdy + FaugY) / mass;
    const az = (Ftz + Flz + Fdz + FaugZ + Fgz) / mass;

    const accel = Math.sqrt(ax*ax + ay*ay + az*az);
    if (accel / G0 > maxG) maxG = accel / G0;

    const thrustAlongRail = Ftx * railUnit.x + Fty * railUnit.y + Ftz * railUnit.z;
    const gravityAlongRail = Fgz * railUnit.z;
    const canReleaseFromPad = isPowered && (thrustAlongRail + gravityAlongRail) > 0;

    if (!releasedFromPad && !canReleaseFromPad) {
      vx = 0;  vy = 0;  vz = 0;
      px = 0;  py = 0;  pz = 0;
    } else {
      if (!releasedFromPad) {
        releasedFromPad = true;
        liftoffTime = t;
      }

      const railProgress = px * railUnit.x + py * railUnit.y + pz * railUnit.z;
      if (railProgress < RAIL_LENGTH) {
        const railSpeed = vx * railUnit.x + vy * railUnit.y + vz * railUnit.z;
        const accelAlongRail = ax * railUnit.x + ay * railUnit.y + az * railUnit.z;
        const nextRailSpeed = Math.max(0, railSpeed + accelAlongRail * dt);
        const nextRailProgress = railProgress + nextRailSpeed * dt;

        vx = railUnit.x * nextRailSpeed;
        vy = railUnit.y * nextRailSpeed;
        vz = railUnit.z * nextRailSpeed;
        px = railUnit.x * nextRailProgress;
        py = railUnit.y * nextRailProgress;
        pz = railUnit.z * nextRailProgress;
      } else {
        vx += ax * dt;  vy += ay * dt;  vz += az * dt;
        px += vx * dt;  py += vy * dt;  pz += vz * dt;
      }
    }

    // Touchdown — only valid after burnout (during powered phase the pad holds the rocket)
    if (pz < 0) {
      if (isPowered) {
        // Still on launch pad / rail — clamp until thrust exceeds weight
        pz = 0;
        if (vz < 0) vz = 0;
      } else {
        pz = 0;
        const landSpd = Math.sqrt(vx*vx + vy*vy + vz*vz);
        points.push({
          t, x: px/1000, y: py/1000, z: 0,
          speed: landSpd, mach: 0, phase: 'landing',
          vx, vy, vz,
          landingBurn: landingBurnActive,
          landingThrottle,
        });
        break;
      }
    }

    if (vz < 0 && apogeeTime === 0) apogeeTime = t;

    // Phase
    let phase;
    if (isPowered)            phase = 'powered';
    else if (vz >= 0)         phase = 'coast';
    else if (landingBurnActive) phase = 'landing';
    else if (h > 10000)       phase = 'entry';
    else if (h > 1000)        phase = 'descent';
    else                      phase = 'landing';

    if (stepCount % recordEvery === 0) {
      const inertialSpeed = Math.sqrt(vx*vx + vy*vy + vz*vz);
      points.push({
        t, x: px/1000, y: py/1000, z: pz/1000,
        speed: inertialSpeed, mach, phase,
        vx, vy, vz,
        landingBurn: landingBurnActive,
        landingThrottle,
      });
    }
  }

  const finalPt = points[points.length - 1];
  const maxMach  = Math.max(...points.map(p => p.mach));
  const apogee   = Math.max(...points.map(p => p.z));

  return {
    points,
    apogeeTime,
    liftoffTime,
    burnoutTime: BURN_TIME,
    flightTime:  finalPt.t,
    metrics: {
      apogee,
      maxMach,
      maxG,
      maxDynPressKPa,
      drift:     Math.sqrt(finalPt.x ** 2 + finalPt.y ** 2),
      landSpeed: finalPt.speed,
      flightTime: finalPt.t,
    }
  };
}

// Pre-generate all trajectories
const TRAJECTORIES = {};
for (const [key, site] of Object.entries(SITES)) {
  TRAJECTORIES[key] = {};
  for (const windKey of Object.keys(WIND_CONDITIONS)) {
    TRAJECTORIES[key][windKey] = generateTrajectory(site, windKey);
  }
}
