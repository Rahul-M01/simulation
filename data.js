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

const WIND_CONDITIONS = {
  calm:     { label: "Calm",     beaufort: "B1-2", speed: "~2 m/s",  wu: 1.5,  wv: 1.0  },
  moderate: { label: "Moderate", beaufort: "B4",   speed: "~9 m/s",  wu: 7.0,  wv: 5.5  },
  strong:   { label: "Strong",   beaufort: "B7",   speed: "~17 m/s", wu: 14.0, wv: 9.5  },
  storm:    { label: "Storm",    beaufort: "B10",  speed: "~28 m/s", wu: 24.0, wv: 16.0 },
};

function generateTrajectory(site, windKey) {
  const wind = WIND_CONDITIONS[windKey];
  const wu_ref = wind.wu, wv_ref = wind.wv;
  const headingRad = (site.heading - 90) * Math.PI / 180;

  const G0                = 9.80665;
  const DRY_MASS          = 1300;
  const ASCENT_PROP_MASS  = 1100;
  const LANDING_PROP_MASS = 320;
  const TOTAL_PROP_MASS   = ASCENT_PROP_MASS + LANDING_PROP_MASS;
  const ISP_ASCENT        = 290;
  const ISP_LANDING       = 285;
  const THRUST_MAX        = 46000;
  const THROTTLE_MIN      = 0.4;
  const LANDING_THRUST_MAX = 38000;
  const LAND_LEG_ALT       = 3.5;
  const RAMP_TIME         = 1.2;
  const BODY_RADIUS       = 0.6;

  const CD_TABLE = [
    [0.0, 0.42], [0.6, 0.46], [0.9, 0.62], [1.0, 0.82],
    [1.2, 0.78], [1.6, 0.66], [3.0, 0.55], [6.0, 0.48]
  ];

  const DRAG_REF_AREA = Math.PI * 0.6 * 0.6; // true frontal area of the 1.2 m body

  const FIN_CDS_MAX     = 1.15;
  const FIN_DEPLOY_ALT  = 16500;
  const FIN_DEPLOY_TIME = 3.0;

  const PITCH_KICK_SPEED = 35;
  const PITCH_START_ELEV = 90;
  const PITCH_END_ELEV   = 56;
  const PITCH_EASE_SHAPE = 4.4;

  const IGNITION_SAFETY     = 1.55;
  const HOVERSLAM_LAT_KP    = 0.90;
  const SETTLE_KP           = 3.0;
  const LAND_TILT_LIMIT     = 22 * Math.PI / 180;
  const LAND_VZ_MIN         = 2;
  const LAND_VZ_MAX         = 55;
  const LAND_WINDOW_H       = 60;

  const BB_FLIP_DELAY   = 1.5;
  const BB_SPOOL_TIME   = 0.6;
  const BB_LAND_RESERVE = 95;
  const BB_NULL_EPS     = 0.6;
  const BB_MAX_TRIMS    = 5;
  const BB_ETA          = 0.7;

  const DT           = 1 / 240;
  const RECORD_EVERY = Math.round(0.5 / DT);
  const MAX_SIM_TIME = 2400;

  function rho(h) {
    if (h <= 0)     return 1.225;
    if (h < 11000)  return 1.225 * Math.pow(1 - 2.2558e-5 * h, 4.2561);
    if (h < 25000)  return 0.3639 * Math.exp(-1.5788e-4 * (h - 11000));
    if (h < 47000)  return 0.0889 * Math.exp(-1.2e-4   * (h - 25000));
    return           0.0020 * Math.exp(-1.5e-4   * (h - 47000));
  }

  function soundSpeed(h) {
    let T;
    if (h < 11000)      T = 288.15 - 0.0065 * h;
    else if (h < 20000) T = 216.65;
    else if (h < 32000) T = 216.65 + 0.0010 * (h - 20000);
    else if (h < 47000) T = 228.65 + 0.0028 * (h - 32000);
    else                T = 270.65;
    return 20.0468 * Math.sqrt(T);
  }

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

  function rotateWind(u, v, deg) {
    const r = deg * Math.PI / 180;
    const c = Math.cos(r), s = Math.sin(r);
    return [u * c - v * s, u * s + v * c];
  }

  function windAtH(h) {
    const z0 = 0.1;
    const refH = 10;
    const logRef = Math.log(refH / z0);
    let f, veer;
    if (h <= 0.3) {
      f = 0.25;
      veer = -25;
    } else if (h <= 1500) {
      f = Math.log(h / z0) / logRef;
      veer = -25 * (1 - h / 1500);
    } else if (h <= 11000) {
      const f1500 = Math.log(1500 / z0) / logRef;
      f = f1500 + (3.2 - f1500) * (h - 1500) / 9500;
      veer = 0;
    } else if (h <= 13000) {
      f = 3.6;
      veer = 5;
    } else if (h <= 25000) {
      f = Math.max(0.6, 3.6 - 2.8 * (h - 13000) / 12000);
      veer = 0;
    } else {
      f = 0.4;
      veer = 0;
    }
    let u = wu_ref * f;
    let v = wv_ref * f;
    if (veer !== 0) [u, v] = rotateWind(u, v, veer);
    return [u, v];
  }

  function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }
  function smoothstep01(u) {
    const t = clamp(u, 0, 1);
    return t * t * (3 - 2 * t);
  }

  const MDOT_FULL     = THRUST_MAX / (ISP_ASCENT * G0);
  const BURN_TIME_EST = RAMP_TIME * 0.6 + ASCENT_PROP_MASS / MDOT_FULL;
  const headX = Math.cos(headingRad), headY = Math.sin(headingRad);

  function pitchProgramElev(t, kickT) {
    if (kickT === null) return PITCH_START_ELEV;
    const u = clamp((t - kickT) / Math.max(1, BURN_TIME_EST - kickT), 0, 1);
    const eased = Math.pow(smoothstep01(u), PITCH_EASE_SHAPE);
    return PITCH_START_ELEV + (PITCH_END_ELEV - PITCH_START_ELEV) * eased;
  }

  function aeroAccel(st, finCds, out) {
    const h = Math.max(0, st.z);
    const rhoH = rho(h);
    const cs = soundSpeed(h);
    const w = windAtH(h);
    const rvx = st.vx - w[0], rvy = st.vy - w[1], rvz = st.vz;
    const spd = Math.sqrt(rvx * rvx + rvy * rvy + rvz * rvz);
    out.spd = spd;
    out.mach = spd / cs;
    out.dynKPa = 0.5 * rhoH * spd * spd / 1000;
    if (spd < 1e-6 || !isFinite(spd)) {
      out.dax = 0; out.day = 0; out.daz = 0;
      return out;
    }
    const cd = interp(CD_TABLE, out.mach);
    const D = (cd * DRAG_REF_AREA + finCds) * 0.5 * rhoH * spd * spd;
    const k = D / st.m / spd;
    out.dax = -k * rvx;
    out.day = -k * rvy;
    out.daz = -k * rvz;
    return out;
  }

  function makeAero() { return { spd: 0, mach: 0, dynKPa: 0, dax: 0, day: 0, daz: 0 }; }

  function rk4Step(st, dt, forceFn) {
    const k1 = forceFn(st);
    const s2 = {
      x: st.x + k1.vx * dt * 0.5, y: st.y + k1.vy * dt * 0.5, z: st.z + k1.vz * dt * 0.5,
      vx: st.vx + k1.ax * dt * 0.5, vy: st.vy + k1.ay * dt * 0.5, vz: st.vz + k1.az * dt * 0.5,
      m: Math.max(DRY_MASS, st.m + k1.dm * dt * 0.5)
    };
    const k2 = forceFn(s2);
    const s3 = {
      x: st.x + k2.vx * dt * 0.5, y: st.y + k2.vy * dt * 0.5, z: st.z + k2.vz * dt * 0.5,
      vx: st.vx + k2.ax * dt * 0.5, vy: st.vy + k2.ay * dt * 0.5, vz: st.vz + k2.az * dt * 0.5,
      m: Math.max(DRY_MASS, st.m + k2.dm * dt * 0.5)
    };
    const k3 = forceFn(s3);
    const s4 = {
      x: st.x + k3.vx * dt, y: st.y + k3.vy * dt, z: st.z + k3.vz * dt,
      vx: st.vx + k3.ax * dt, vy: st.vy + k3.ay * dt, vz: st.vz + k3.az * dt,
      m: Math.max(DRY_MASS, st.m + k3.dm * dt)
    };
    const k4 = forceFn(s4);
    return {
      x: st.x + dt / 6 * (k1.vx + 2 * k2.vx + 2 * k3.vx + k4.vx),
      y: st.y + dt / 6 * (k1.vy + 2 * k2.vy + 2 * k3.vy + k4.vy),
      z: st.z + dt / 6 * (k1.vz + 2 * k2.vz + 2 * k3.vz + k4.vz),
      vx: st.vx + dt / 6 * (k1.ax + 2 * k2.ax + 2 * k3.ax + k4.ax),
      vy: st.vy + dt / 6 * (k1.ay + 2 * k2.ay + 2 * k3.ay + k4.ay),
      vz: st.vz + dt / 6 * (k1.az + 2 * k2.az + 2 * k3.az + k4.az),
      m: Math.max(DRY_MASS, st.m + dt / 6 * (k1.dm + 2 * k2.dm + 2 * k3.dm + k4.dm))
    };
  }

  function previewDrift(st0, ovx, ovy) {
    let x = st0.x, y = st0.y, z = st0.z;
    let vx = ovx !== undefined ? ovx : st0.vx;
    let vy = ovy !== undefined ? ovy : st0.vy;
    let vz = st0.vz;
    const pdt = 0.25;
    let tt = 0;
    const a = makeAero();
    while (z > 0 && tt < MAX_SIM_TIME) {
      const finCds = vz < 0 && z < FIN_DEPLOY_ALT ? FIN_CDS_MAX : 0;
      aeroAccel({ x, y, z, vx, vy, vz, m: st0.m }, finCds, a);
      vx += a.dax * pdt;
      vy += a.day * pdt;
      vz += (a.daz - G0) * pdt;
      x += vx * pdt;
      y += vy * pdt;
      z += vz * pdt;
      tt += pdt;
    }
    return { dx: x - st0.x, dy: y - st0.y, tf: Math.max(tt, 1) };
  }

  function solveBoostbackTarget() {
    let cvx = -s.vx, cvy = -s.vy;
    for (let k = 0; k < 4; k++) {
      const pv = previewDrift(s, cvx, cvy);
      const landX = s.x + pv.dx;
      const landY = s.y + pv.dy;
      cvx -= landX / (BB_ETA * pv.tf);
      cvy -= landY / (BB_ETA * pv.tf);
    }
    return { cvx, cvy };
  }

  const points = [];
  let s = {
    x: 0, y: 0, z: 0,
    vx: 0, vy: 0, vz: 0,
    m: DRY_MASS + ASCENT_PROP_MASS + LANDING_PROP_MASS
  };
  let ascentProp = ASCENT_PROP_MASS;
  let landingProp = LANDING_PROP_MASS;

  let liftoff = false, liftoffTime = null;
  let kickT = null;
  let meco = false, burnoutTime = null;
  let bbStage = 0, bbIgnitT = null, bbTx = 0, bbTy = 0, bbTrims = 0;
  let bbDone = false, boostbackEndTime = null;
  let apogeeZ = -1, apogeeTime = null;
  let finStartT = null, finDeployTime = null;
  let landingIgnited = false, landingIgnitionTime = null;
  let propDepletedMidAir = false;
  let maxDynKPa = 0, maxMach = 0, maxG = 0;
  const aero = makeAero();

  function gridFinValue(tt) {
    if (finStartT === null) return 0;
    return clamp((tt - finStartT) / FIN_DEPLOY_TIME, 0, 1);
  }

  function buildPoint(tt, phase, throttle, pitchDeg, gf, lb, lt, ldx, ldy, ldz, override) {
    const spd = override ? override.speed : Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
    return {
      t: Math.round(tt * 1000) / 1000,
      x: override ? override.x : s.x,
      y: override ? override.y : s.y,
      z: override ? override.z : Math.max(0, s.z),
      vx: override ? override.vx : s.vx,
      vy: override ? override.vy : s.vy,
      vz: override ? override.vz : s.vz,
      speed: spd,
      mach: override ? 0 : aero.mach,
      dynPressKPa: override ? 0 : aero.dynKPa,
      phase,
      pitchDeg,
      throttle,
      gridFin: gf,
      propPct: ((ascentProp + landingProp) / TOTAL_PROP_MASS) * 100,
      landingBurn: lb,
      landingThrottle: lt,
      landingDirX: ldx, landingDirY: ldy, landingDirZ: ldz
    };
  }

  let stepCount = 0;
  let t = 0;

  while (t < MAX_SIM_TIME) {
    const gfNow = gridFinValue(t);
    const finCdsNow = gfNow * FIN_CDS_MAX;
    aeroAccel(s, finCdsNow, aero);
    if (aero.dynKPa > maxDynKPa) maxDynKPa = aero.dynKPa;
    if (isFinite(aero.mach) && aero.mach > maxMach) maxMach = aero.mach;

    let engineOn = false;
    let thrustX = 0, thrustY = 0, thrustZ = 0;
    let isp = ISP_ASCENT;
    let throttle = 0;
    let pitchDeg = 0;
    let lastCoastPitch = 0;
    let phase = 'powered';
    let lb = false, lt = 0, ldx = 0, ldy = 0, ldz = 1;
    let holdPad = false;

    if (!liftoff) {
      const F = THRUST_MAX * smoothstep01(t / RAMP_TIME);
      if (F > s.m * G0) {
        liftoff = true;
        liftoffTime = t;
      } else {
        holdPad = true;
      }
      if (!holdPad) {
        engineOn = true;
        thrustZ = F;
        throttle = F / THRUST_MAX;
      }
    } else if (!meco) {
      const spd = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
      if (kickT === null && spd > PITCH_KICK_SPEED) kickT = t;
      const elevDeg = pitchProgramElev(t, kickT);
      const elRad = elevDeg * Math.PI / 180;
      if (ascentProp > 0) {
        const F = THRUST_MAX * smoothstep01(t / RAMP_TIME);
        engineOn = true;
        thrustX = F * Math.cos(elRad) * headX;
        thrustY = F * Math.cos(elRad) * headY;
        thrustZ = F * Math.sin(elRad);
        throttle = F / THRUST_MAX;
        isp = ISP_ASCENT;
      } else {
        meco = true;
        burnoutTime = t;
      }
      phase = 'powered';
    }

    if (meco && !bbDone) {
      phase = 'ascent-coast';

      if (bbStage === 0 && !engineOn) {
        if (t >= burnoutTime + BB_FLIP_DELAY) {
          bbStage = 2;
        }
      }

      if (bbStage === 2 && !engineOn) {
        if (bbIgnitT === null) {
          if (bbTrims >= BB_MAX_TRIMS || landingProp <= BB_LAND_RESERVE) {
            bbDone = true;
            boostbackEndTime = t;
          } else {
            const tgt = solveBoostbackTarget();
            bbTx = tgt.cvx;
            bbTy = tgt.cvy;
            const dvx = bbTx - s.vx, dvy = bbTy - s.vy;
            const dvMag = Math.sqrt(dvx * dvx + dvy * dvy);
            if (dvMag < 0.8) {
              bbDone = true;
              boostbackEndTime = t;
            } else {
              bbIgnitT = t;
              bbStage = 1;
            }
          }
        }
      }

      if (bbStage === 1 && !engineOn) {
        const dvx = bbTx - s.vx, dvy = bbTy - s.vy;
        const dvMag = Math.sqrt(dvx * dvx + dvy * dvy);
        if (dvMag <= BB_NULL_EPS || landingProp <= BB_LAND_RESERVE) {
          bbTrims++;
          bbIgnitT = null;
          bbStage = 2;
        } else {
          const spool = THROTTLE_MIN + (1 - THROTTLE_MIN) * smoothstep01((t - bbIgnitT) / BB_SPOOL_TIME);
          const F = THRUST_MAX * spool;
          engineOn = true;
          isp = ISP_LANDING;
          thrustX = F * dvx / dvMag;
          thrustY = F * dvy / dvMag;
          throttle = spool;
        }
      }
    }

    if (meco && bbDone) {
      if (!landingIgnited) {
        phase = s.vz >= 0 ? 'ascent-coast' : (s.z > 10000 ? 'entry' : 'descent');
        if (s.vz < 0 && s.z > 0 && landingProp > 0) {
          if (finStartT === null && s.z < FIN_DEPLOY_ALT) {
            finStartT = t;
            finDeployTime = t;
          }
          // Gate on drag-free capability: drag collapses as the burn
          // kills airspeed, so budgeting on it lands you short of sky.
          const aCap = (LANDING_THRUST_MAX / s.m) * Math.cos(LAND_TILT_LIMIT) - G0;
          if (aCap > 1 && s.z <= IGNITION_SAFETY * s.vz * s.vz / (2 * aCap)) {
            landingIgnited = true;
            landingIgnitionTime = t;
          }
        }
      }

      if (landingIgnited && landingProp > 0) {
        phase = 'landing-burn';
        const h = Math.max(0, s.z);
        // Plan on thrust minus gravity only: never budget on drag that
        // vanishes as the burn kills airspeed. Vertical component only.
        if (true) {
          let azCmd;
          if (h < LAND_WINDOW_H) {
            // Terminal brake onto a fixed touchdown speed: PD with
            // authority to saturate the engine.
            const vzSettle = -LAND_VZ_MIN;
            // Continuous braking curve into leg contact: areq is the
            // deceleration that lands vf exactly at hf, so there is no
            // hover phase before touchdown.
            const hfTouch = 6;
            const areqLand = (s.vz * s.vz - LAND_VZ_MIN * LAND_VZ_MIN) /
              (2 * Math.max(hfTouch, h));
            azCmd = G0 + clamp(areqLand, 0, LANDING_THRUST_MAX / s.m) - aero.daz;
            azCmd = Math.min(Math.max(azCmd, 0), LANDING_THRUST_MAX / s.m);
          } else {
            // Kinematic steering: shed (v^2 - vf^2) / (2(h-hf)) so the
            // vertical speed meets vf right at the settle window edge.
            const hf = Math.min(LAND_WINDOW_H, Math.max(8, h * 0.2));
            const areq = (s.vz * s.vz - LAND_VZ_MIN * LAND_VZ_MIN) /
              (2 * Math.max(hf, h - hf));
            azCmd = G0 + clamp(areq, 0, LANDING_THRUST_MAX / s.m) - aero.daz;
          }
          const axCmd = -HOVERSLAM_LAT_KP * s.vx - aero.dax;
          const ayCmd = -HOVERSLAM_LAT_KP * s.vy - aero.day;

          let Tx = s.m * axCmd;
          let Ty = s.m * ayCmd;
          let Tz = Math.max(0, s.m * azCmd);

          // Tilt cone first: lateral authority exists only around the
          // vertical thrust component.
          let thMax = Tz * Math.tan(LAND_TILT_LIMIT);
          let hMag = Math.sqrt(Tx * Tx + Ty * Ty);
          if (hMag > thMax && hMag > 1e-9) {
            const sc = thMax / hMag;
            Tx *= sc; Ty *= sc;
          }

          // Budget: over-limit steals from lateral only. The vertical
          // brake is never starved by the wind fight.
          const latBudgetSq = LANDING_THRUST_MAX * LANDING_THRUST_MAX - Tz * Tz;
          if (latBudgetSq < 0) {
            Tz = LANDING_THRUST_MAX;
            Tx = 0; Ty = 0;
          } else {
            thMax = Math.sqrt(latBudgetSq);
            hMag = Math.sqrt(Tx * Tx + Ty * Ty);
            if (hMag > thMax && hMag > 1e-9) {
              const sc = thMax / hMag;
              Tx *= sc; Ty *= sc;
            }
          }

          const effMin = h < LAND_WINDOW_H ? 0 : THROTTLE_MIN * LANDING_THRUST_MAX;
          let mag = Math.min(Math.hypot(Tx, Ty, Tz), LANDING_THRUST_MAX);
          if (mag > 1e-9 && mag < effMin && h >= LAND_WINDOW_H) {
            const sc = effMin / mag;
            Tx *= sc; Ty *= sc; Tz *= sc;
            mag = effMin;
          } else if ((mag <= 1e-9 || h < LAND_WINDOW_H) && Tz < effMin && effMin > 0) {
            Tz = Math.min(effMin, LANDING_THRUST_MAX);
          }
          mag = Math.hypot(Tx, Ty, Tz);

          mag = Math.sqrt(Tx * Tx + Ty * Ty + Tz * Tz);

          if (mag > 100) {
            engineOn = true;
            isp = ISP_LANDING;
            thrustX = Tx; thrustY = Ty; thrustZ = Tz;
            throttle = mag / LANDING_THRUST_MAX;
            lb = true;
            lt = throttle;
            ldx = Tx / mag; ldy = Ty / mag; ldz = Tz / mag;
          }
        }
      }
    }

    const thrustMagSq = thrustX * thrustX + thrustY * thrustY + thrustZ * thrustZ;
    const thrustMag = Math.sqrt(thrustMagSq);

    if (engineOn) {
      pitchDeg = Math.acos(clamp(thrustZ / Math.max(1e-9, thrustMag), -1, 1)) * 180 / Math.PI;
    } else if (liftoff && meco) {
      // Coast/descent attitude: track flight path while it is well
      // defined, then hold the last good value through apex stall.
      const spdTotal = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
      if (spdTotal > 40) {
        const vzUnit = s.vz >= 0 ? 1 : -1;
        lastCoastPitch = Math.acos(clamp(vzUnit * s.vz / Math.max(1e-6, spdTotal), -1, 1)) * 180 / Math.PI;
      }
      pitchDeg = lastCoastPitch;
    }

    const forceFn = (st) => {
      const a = makeAero();
      aeroAccel(st, finCdsNow, a);
      const invM = 1 / st.m;
      return {
        vx: st.vx, vy: st.vy, vz: st.vz,
        ax: a.dax + thrustX * invM,
        ay: a.day + thrustY * invM,
        az: a.daz + thrustZ * invM - G0,
        dm: engineOn ? -thrustMag / (isp * G0) : 0
      };
    };

    if (engineOn) {
      const used = thrustMag * DT / (isp * G0);
      if (isp === ISP_ASCENT) {
        ascentProp = Math.max(0, ascentProp - used);
      } else {
        if (used >= landingProp) {
          const frac = landingProp / used;
          thrustX *= frac; thrustY *= frac; thrustZ *= frac;
          throttle *= frac;
          lt *= frac;
          landingProp = 0;
          engineOn = false;
          if (s.z > LAND_WINDOW_H * 4) propDepletedMidAir = true;
        } else {
          landingProp -= used;
        }
      }
    }

    const netAx = thrustX / s.m + aero.dax;
    const netAy = thrustY / s.m + aero.day;
    const netAz = thrustZ / s.m + aero.daz - G0;
    const accelG = Math.sqrt(netAx * netAx + netAy * netAy + netAz * netAz) / G0;
    if (accelG > maxG) maxG = accelG;

    const prevState = s;
    if (holdPad) {
      s = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, m: s.m };
    } else {
      s = rk4Step(s, DT, forceFn);
    }

    // Leg contact: engines cut, booster settles onto the pad.
    if (
      liftoff && meco && landingIgnited &&
      !holdPad && s.z > 0 && s.z <= LAND_LEG_ALT && s.vz >= -7
    ) {
      const touchSpd = Math.sqrt(s.vx * s.vx + s.vy * s.vy + s.vz * s.vz);
      points.push(buildPoint(t, 'touchdown', 0,
        Math.acos(clamp(ldz, -1, 1)) * 180 / Math.PI,
        1, lb, lt, ldx, ldy, ldz,
        { x: s.x, y: s.y, z: 0, vx: s.vx, vy: s.vy, vz: s.vz, speed: touchSpd }));
      break;
    }

    if (s.z > apogeeZ) {
      apogeeZ = s.z;
      apogeeTime = t + DT;
    }

    if (prevState.z > 0 && s.z <= 0 && s.vz < 0 && liftoff && meco) {
      const f = prevState.z / (prevState.z - s.z);
      const tz = t + f * DT;
      const ix = prevState.x + (s.x - prevState.x) * f;
      const iy = prevState.y + (s.y - prevState.y) * f;
      const ivx = prevState.vx + (s.vx - prevState.vx) * f;
      const ivy = prevState.vy + (s.vy - prevState.vy) * f;
      const ivz = prevState.vz + (s.vz - prevState.vz) * f;
      const landSpd = Math.sqrt(ivx * ivx + ivy * ivy + ivz * ivz);
      points.push(buildPoint(tz, 'touchdown', 0,
        Math.acos(clamp(ldz, -1, 1)) * 180 / Math.PI,
        1, lb, lt, ldx, ldy, ldz,
        { x: ix, y: iy, z: 0, vx: ivx, vy: ivy, vz: ivz, speed: landSpd }));
      break;
    }

    stepCount++;
    t += DT;

    if (stepCount % RECORD_EVERY === 0) {
      points.push(buildPoint(t, phase, throttle, pitchDeg, gfNow, lb, lt, ldx, ldy, ldz, null));
    }
  }

  if (points[points.length - 1].phase !== 'touchdown') {
    points.push(buildPoint(t, 'touchdown', 0, 0, 1, false, 0, 0, 0, 1, null));
  }

  const finalPt = points[points.length - 1];
  const apogee = Math.max(...points.map(p => p.z));
  const success = finalPt.phase === 'touchdown' && !propDepletedMidAir && finalPt.speed < 50;

  return {
    points,
    liftoffTime,
    burnoutTime,
    apogeeTime,
    finDeployTime,
    landingIgnitionTime,
    boostbackEndTime,
    flightTime: finalPt.t,
    outcome: success ? 'success' : 'crash',
    events: [
      { label: 'LAUNCH', t: liftoffTime !== null ? liftoffTime : 0 },
      { label: 'MECO', t: burnoutTime },
      { label: 'BOOSTBACK', t: boostbackEndTime },
      { label: 'APOGEE', t: apogeeTime },
      { label: 'FIN DEPLOY', t: finDeployTime },
      { label: 'LANDING BURN', t: landingIgnitionTime },
      { label: 'TOUCHDOWN', t: finalPt.t }
    ].filter(e => e.t !== null),
    metrics: {
      apogee: apogee / 1000,
      maxMach,
      maxG,
      maxQ: maxDynKPa,
      maxDynPressKPa: maxDynKPa,
      drift: Math.sqrt(finalPt.x ** 2 + finalPt.y ** 2) / 1000,
      landSpeed: finalPt.speed,
      flightTime: finalPt.t,
      propRemainingPct: ((ascentProp + landingProp) / TOTAL_PROP_MASS) * 100,
      success
    }
  };
}

const TRAJECTORIES = {};
for (const [key, site] of Object.entries(SITES)) {
  TRAJECTORIES[key] = {};
  for (const windKey of Object.keys(WIND_CONDITIONS)) {
    TRAJECTORIES[key][windKey] = generateTrajectory(site, windKey);
  }
}

if (typeof module !== 'undefined') module.exports = { SITES, WIND_CONDITIONS, generateTrajectory };
