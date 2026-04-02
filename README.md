# UK Booster Simulation

This project is a static web app. That means the safest free hosting option is a static host such as Cloudflare Pages or GitHub Pages.

## Safe Hosting Checklist

- Keep it static only: no backend, no database, no API secrets in `app.js`, `data.js`, or `index.html`.
- Deploy from your own Git repository only.
- Leave HTTPS enabled.
- If you use Cloudflare Pages, the `_headers` file in this repo adds basic security headers.

## Option 1: Cloudflare Pages

1. Push this folder to a GitHub repository.
2. In Cloudflare Pages, create a new project and connect that repository.
3. Use these settings:
   - Framework preset: `None`
   - Build command: leave blank
   - Build output directory: `/`
4. Deploy.

Notes:
- This app does not need any environment variables.
- If you attach a custom domain, keep the default HTTPS setting on.

## Option 2: GitHub Pages

1. Push this folder to a GitHub repository.
2. In GitHub, open `Settings -> Pages`.
3. Set the source to deploy from your default branch root.
4. Save and wait for the site URL.

Notes:
- The `.nojekyll` file ensures GitHub Pages serves the files directly.
- GitHub Pages will not use the Cloudflare `_headers` file, so Cloudflare Pages is the better option if you want those headers without extra work.

## Local Preview

```bash
npm start
```

## Files Added For Hosting

- `.nojekyll`: prevents GitHub Pages from trying to process the site with Jekyll
- `_headers`: adds browser security headers on hosts that support this format, including Cloudflare Pages
