# UK Reusable Booster

Three.js simulation of a reusable booster flying a suborbital hop from UK spaceports. The flight is integrated in the browser at 240 Hz (RK4) and replayed in 3D.

## Flight model

- Gravity turn ascent: vertical kick, eased pitch program along the site heading
- ISA atmosphere, Mach-dependent drag table, altitude-varying wind (log-law boundary layer, jet-stream ramp, veer)
- Boostback burn after MECO, targeting a return to the pad
- Grid fins deploy on descent and add drag area
- Hoverslam landing: drag-free ignition gate, kinematic braking curve, tilt-limited lateral kill, leg contact cut-off
- Dedicated landing engine with throttle floor near hover weight

## Features

- Five launch sites: Sutherland, SaxaVord, Prestwick, Snowdonia, Cornwall
- Four wind conditions from calm to storm
- Live telemetry: throttle, propellant split, pitch attitude, grid-fin state
- Mission summary: apogee, max Mach, max dynamic pressure, touchdown speed
- Flight profile chart with phase bands and click-to-scrub playback
- Procedural terrain around the pad; follow, overview and top-down cameras
- Toggleable trajectory trails across sites

## Run

```bash
npm install
npm start
```

Then open http://localhost:8080.

## Test

```bash
npm test
```

Integrates every site x wind case and checks liftoff, apogee band, max-q, landing distance and touchdown speed.

## Deploy

Cloudflare Pages: connect the repo, preset `None`, blank build command, output `/`. `_headers` provides the security headers.

GitHub Pages: Settings > Pages > deploy from the default branch root. `.nojekyll` is already committed.

## Layout

- `index.html`, `style.css` - layout and styling
- `app.js` - Three.js scene, camera, telemetry, animation loop
- `data.js` - sites, wind model, trajectory integrator
- `test/physics.test.js` - flight validation suite
- `_headers`, `.nojekyll` - hosting config
