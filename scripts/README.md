# scripts

## `e2e-smoke.mjs`

Drives the production binary in headless Chromium through the whole walking skeleton: owner setup, capture, projects, detail edits, keyboard shortcuts, views, sync verified through the REST API, a second device, an offline edit that uploads on reconnect, settings and tokens, mobile layout. It also refreshes the screenshots in `docs/screenshots/`.

Run it against a **fresh** data directory (the script creates the owner account):

```bash
make build
OPENTODO_DATA_DIR=$(mktemp -d) ./bin/opentodo &
npx -y -p playwright@1.56.1 node scripts/e2e-smoke.mjs            # downloads Chromium on first run
# or, with a Chromium already on disk:
CHROMIUM_PATH=/path/to/chrome npx -y -p playwright@1.56.1 node scripts/e2e-smoke.mjs
```

Environment: `OPENTODO_URL` (default `http://127.0.0.1:8080`), `CHROMIUM_PATH` (optional). Exit code is non-zero on any failed step or browser console error.

## `screenshots.mjs`

Seeds a fresh server with a realistic set of projects and tasks and captures the screenshots used in `README.md` and the website (`docs/screenshots/*.png`, high-DPI). Same prerequisites and environment variables as the smoke test; run it against an **empty** data directory, then copy the PNGs into `website/assets/`.
