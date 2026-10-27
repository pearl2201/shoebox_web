# Deployment

The app is a static single-page build — no server, no API, no environment variables.

```
npm ci
npm test
npm run build      # → dist/
```

`vite.config.ts` uses `base: './'`, so the same `dist/` works at a domain root **and** under a
GitHub Pages project path (`/repo/`). There is no client-side router, so no 404 fallback is required.

---

## 1. GitHub Pages

The workflow in `.github/workflows/deploy-pages.yml` runs on every push to `main` (and manually via
`workflow_dispatch`). It always runs **install → test → build**; the deploy steps only run when Pages
is enabled.

Setup:

1. Create the repository and push `main`.
2. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push again (or run the workflow) — the site appears at
   `https://<user>.github.io/<repo>/`.

For this repository that is **https://pearl2201.github.io/shoebox_web/**.

### Why the workflow is green before Pages exists

`GITHUB_TOKEN` **cannot create a Pages site** (`Resource not accessible by integration` — the REST API
requires repository-admin rights). Instead of failing, the workflow calls
`GET /repos/{owner}/{repo}/pages`:

* **HTTP 200** → Pages is enabled → configure, upload artifact, deploy.
* **anything else** → a notice + job summary is written, the deploy steps are skipped, and the run
  stays green. Build and unit tests still gate the commit.

So the only manual step is enabling Pages once. After that every push to `main` publishes
automatically.

Notes:

* The workflow checks out with `submodules: false`; the `shoebox_as/` reference submodule is not
  needed for the build.
* If the repository is renamed, nothing changes — the relative base keeps working.
* A custom domain on GitHub Pages is optional; use Cloudflare Pages for `shoebox.lacgame.com`.

---

## 2. Cloudflare Pages (primary host)

### Option A — Git integration (recommended)

1. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. Select the repository.
3. Build settings:

   | Setting | Value |
   |---|---|
   | Framework preset | None (or Vite) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory | *(empty)* |

4. Environment variables (Production **and** Preview):

   | Name | Value |
   |---|---|
   | `NODE_VERSION` | `22` |

5. Save and deploy. Every branch/PR gets a preview URL; `main` deploys to production.

`wrangler.toml` already declares `pages_build_output_dir = "dist"` for the CLI path.

### Option B — Direct upload

```bash
npm run build
npx wrangler pages deploy dist --project-name shoebox
```

### Custom domain `shoebox.lacgame.com`

1. Pages project → **Custom domains → Set up a custom domain**.
2. Enter `shoebox.lacgame.com`.
3. If `lacgame.com` is managed in the same Cloudflare account, the required record is created
   automatically:

   | Type | Name | Content | Proxy |
   |---|---|---|---|
   | CNAME | `shoebox` | `shoebox.pages.dev` | Proxied |

   If the zone is elsewhere, create that CNAME at your DNS provider instead and wait for propagation.
4. SSL is issued automatically; wait for the certificate to become active, then open
   `https://shoebox.lacgame.com`.

---

## 3. Headers & caching

`public/_headers` is copied into `dist/` and applied by Cloudflare Pages:

* `/assets/*` — `Cache-Control: public, max-age=31536000, immutable` (hashed filenames).
* All responses — `nosniff`, strict referrer policy, no camera/mic/geolocation permissions.

GitHub Pages ignores `_headers`; the file is simply published alongside the static assets.

---

## 4. Release checklist

1. `npm test` — unit tests for packer, alpha utilities, hull tracing, tile-grid detection and bitmap fonts.
2. `npm run build` — type-check plus production bundle.
3. Smoke test `npm run preview`:
   * pack two images → atlas + metadata;
   * slice a tileset;
   * convert an animated GIF;
   * detect tiles;
   * trace a hull;
   * build a bitmap font (BMFont text/XML) with preview;
   * save to a chosen folder and via ZIP download.
4. Push to `main` → GitHub Pages workflow runs, Cloudflare Pages builds both preview and production.
5. Verify both URLs load with assets (check the Network tab for `./assets/...` requests).

---

## 5. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Workflow is green but nothing is published | Expected while Pages is disabled — check the run summary notice. **Settings → Pages → Source: GitHub Actions**, then re-run. |
| `Resource not accessible by integration` from an older run | The old workflow tried to create the Pages site with `GITHUB_TOKEN`; that is not allowed. The current workflow detects the state instead of failing. |
| GitHub Pages shows the README instead of the app | Pages source is still “Deploy from a branch”. Switch it to “GitHub Actions”. |
| Blank page on a sub-path | Keep the Vite base relative (`base: './'`). Absolute `/assets/...` breaks project pages. |
| Cloudflare build fails on Node APIs | Add `NODE_VERSION=22` to the Pages environment variables. |
| Custom domain stuck on “Verifying” | Check the `CNAME shoebox → shoebox.pages.dev` record and that the zone is active. |
| `wrangler` uploads nothing | Build first (`npm run build`) and point it at `dist`. |
