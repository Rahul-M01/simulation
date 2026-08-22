const assert = require('assert');
const { SITES, WIND_CONDITIONS, generateTrajectory } = require('../data.js');

const TOUCHDOWN_LIMITS = { calm: 8, moderate: 8, strong: 15, storm: 20 };
const NUMERIC_FIELDS = [
  't', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'speed', 'mach', 'dynPressKPa',
  'pitchDeg', 'throttle', 'gridFin', 'propPct', 'landingThrottle',
  'landingDirX', 'landingDirY', 'landingDirZ'
];

const results = [];
let failures = 0;

function check(label, fn) {
  try {
    fn();
    return true;
  } catch (err) {
    failures++;
    console.error(`  FAIL [${label}] ${err.message}`);
    return false;
  }
}

for (const [siteKey, site] of Object.entries(SITES)) {
  for (const windKey of Object.keys(WIND_CONDITIONS)) {
    const label = `${siteKey}/${windKey}`;
    const traj = generateTrajectory(site, windKey);
    const pts = traj.points;
    const m = traj.metrics;
    const row = { site: siteKey, wind: windKey };

    check(`${label} liftoff`, () => {
      assert.strictEqual(typeof traj.liftoffTime, 'number', 'liftoffTime missing');
      assert.ok(traj.liftoffTime >= 0 && traj.liftoffTime < 30, `liftoff too late: ${traj.liftoffTime}`);
    });

    check(`${label} apogee band`, () => {
      assert.ok(m.apogee >= 40 && m.apogee <= 200, `apogee ${m.apogee.toFixed(1)} km outside 40-200`);
    });

    check(`${label} no NaN`, () => {
      for (const p of pts) {
        for (const f of NUMERIC_FIELDS) {
          assert.ok(Number.isFinite(p[f]), `${f} not finite at t=${p.t}: ${p[f]}`);
        }
        assert.ok(['powered', 'ascent-coast', 'entry', 'descent', 'landing-burn', 'touchdown'].includes(p.phase),
          `bad phase ${p.phase}`);
      }
      for (const key of ['apogee', 'maxMach', 'maxG', 'maxQ', 'drift', 'landSpeed', 'flightTime', 'propRemainingPct']) {
        assert.ok(Number.isFinite(m[key]), `metrics.${key} not finite`);
      }
    });

    check(`${label} maxQ`, () => {
      assert.ok(m.maxQ < 80, `maxQ ${m.maxQ.toFixed(1)} kPa >= 80`);
    });

    check(`${label} ascent downrange`, () => {
      const mecoPt = pts.find(p => p.t >= traj.burnoutTime);
      assert.ok(mecoPt, 'no post-MECO point');
      const dnr = Math.hypot(mecoPt.x, mecoPt.y);
      row.downrangeKm = dnr / 1000;
      assert.ok(dnr > 800, `ascent downrange ${dnr.toFixed(0)} m <= 800`);
    });

    check(`${label} touchdown speed`, () => {
      const limit = TOUCHDOWN_LIMITS[windKey];
      assert.strictEqual(pts[pts.length - 1].phase, 'touchdown', 'last point is not touchdown');
      assert.ok(traj.outcome === 'success', `outcome=${traj.outcome}`);
      assert.ok(m.landSpeed <= limit, `touchdown ${m.landSpeed.toFixed(1)} m/s > ${limit} (${windKey})`);
    });

    check(`${label} landing near pad`, () => {
      assert.ok(m.drift <= 4, `drift ${m.drift.toFixed(2)} km > 4 km`);
    });

    check(`${label} flight duration`, () => {
      assert.ok(m.flightTime < 1200, `flightTime ${m.flightTime.toFixed(0)} s >= 1200`);
    });

    row.apogeeKm = m.apogee;
    row.maxQ = m.maxQ;
    row.landSpeed = m.landSpeed;
    row.driftKm = m.drift;
    row.flightS = m.flightTime;
    row.propPct = m.propRemainingPct;
    results.push(row);
  }
}

console.log('');
console.log('SITE         WIND        APOGEE   MAX Q   TOUCHDOWN  DRIFT   DOWNRANGE  FLIGHT  PROP');
for (const r of results) {
  console.log(
    r.site.padEnd(13) + r.wind.padEnd(12) +
    r.apogeeKm.toFixed(1).padStart(5) + 'km' +
    r.maxQ.toFixed(1).padStart(7) + 'kPa' +
    r.landSpeed.toFixed(1).padStart(8) + 'm/s' +
    r.driftKm.toFixed(2).padStart(7) + 'km' +
    (r.downrangeKm || 0).toFixed(2).padStart(8) + 'km' +
    r.flightS.toFixed(0).padStart(6) + 's' +
    r.propPct.toFixed(1).padStart(6) + '%'
  );
}
console.log('');

if (failures > 0) {
  console.error(`${failures} check(s) FAILED`);
  process.exit(1);
} else {
  console.log(`All ${results.length} site x wind configurations passed.`);
}
