# UK Reusable Booster — 3D Mission Simulation

Interactive Three.js visualisation of a reusable orbital-class booster launching and landing from UK spaceports. Trajectories are precomputed from a Python flight-dynamics sim (`booster_sim.py`) and replayed in the browser, so the physics (thrust, drag, wind, landing burn) stays consistent with the offline model.

## What it shows

- Five UK launch sites: Sutherland, SaxaVord, Prestwick, Snowdonia, Cornwall
- Three wind conditions (calm / moderate / strong south-westerlies)
- Full flight profile: powered ascent, coast to apogee, entry burn, grid-fin descent, landing burn
- Live telemetry: altitude, speed, Mach, mission time, phase
- Procedural biome around the launch pad (terrain, distant mountains, vegetation)
- Camera modes: follow, overview, top-down
- Toggleable trajectory trails across sites

## Running locally

```bash
npm install
npm start
```

Then open http://localhost:8080.

The app is fully static — no backend, no build step, no API keys. Any static host works.

## Hosting

### Cloudflare Pages

1. Push to GitHub.
2. Create a new Pages project and connect the repo.
3. Framework preset: `None`. Build command: blank. Output directory: `/`.
4. Deploy. The `_headers` file adds basic security headers automatically.

### GitHub Pages

1. Push to GitHub.
2. `Settings → Pages`, source = default branch root.
3. The `.nojekyll` file prevents Jekyll from mangling the site. GitHub Pages ignores `_headers`, so Cloudflare is the better option if you care about those headers.

## Files

- `index.html`, `style.css` — layout and UI
- `app.js` — Three.js scene, animation loop, camera, telemetry
- `data.js` — site definitions, wind profiles, trajectory data
- `_headers`, `.nojekyll` — hosting config
