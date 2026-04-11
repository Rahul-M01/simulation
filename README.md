# UK Reusable Booster

Three.js simulation of a reusable booster flying a suborbital hop from UK spaceports. Trajectories are integrated in the browser (thrust curve, ISA atmosphere, drag tables, altitude-varying wind, guided landing burn), then replayed in 3D.

## Features

- Five launch sites: Sutherland, SaxaVord, Prestwick, Snowdonia, Cornwall
- Four wind conditions with log-law boundary layer and jet-stream ramp
- Ascent, coast, entry, descent, landing burn
- Telemetry: altitude, speed, Mach, mission time, phase
- Procedural terrain and vegetation around the pad
- Follow, overview, top-down cameras
- Toggleable trajectory trails across sites

## Run

```bash
npm install
npm start
```

Then open http://localhost:8080.

## Deploy

Cloudflare Pages: connect the repo, preset `None`, blank build command, output `/`. `_headers` provides the security headers.

GitHub Pages: Settings → Pages → default branch root. `.nojekyll` is already committed.

## Layout

- `index.html`, `style.css` — layout and styling
- `app.js` — Three.js scene, camera, telemetry, animation loop
- `data.js` — sites, wind, trajectory integrator
- `_headers`, `.nojekyll` — hosting config
