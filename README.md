# UK Reusable Booster

Interactive 3D simulation of a reusable orbital-class booster launching and landing from UK spaceports. Trajectories are generated in-browser by a flight-dynamics model (thrust curve, ISA atmosphere, drag tables, log-law wind with Ekman veering, guided landing burn) and rendered with Three.js.

## What's in it

- Five launch sites: Sutherland, SaxaVord, Prestwick, Snowdonia, Cornwall
- Four wind conditions (calm through storm) with altitude-varying profile
- Full flight: powered ascent, coast to apogee, entry, grid-fin descent, landing burn
- Live telemetry: altitude, speed, Mach, mission time, phase
- Procedural terrain, mountains and vegetation around the pad
- Follow / overview / top-down cameras
- Trajectory trails toggle across all sites

## Running

```bash
npm install
npm start
```

Open http://localhost:8080. No backend, no build step.

## Hosting

### Cloudflare Pages

Connect the repo, framework preset `None`, build command blank, output directory `/`. `_headers` supplies security headers.

### GitHub Pages

Settings → Pages, source = default branch root. `.nojekyll` is already in place.

## Files

- `index.html`, `style.css` — layout and UI
- `app.js` — Three.js scene, animation loop, camera, telemetry
- `data.js` — sites, wind profiles, trajectory integrator
- `_headers`, `.nojekyll` — hosting config
