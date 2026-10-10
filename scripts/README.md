# scripts

## `cli-smoke.sh`

End-to-end check of the `ot` command-line client: starts `bin/opentodo` on a throwaway port and data directory, creates the owner account, then runs `ot login`, `project add`, `add`, `list --json`, `done` (by id prefix), the exit-code contract, `export` and `auth logout`. Prints `CLI OK` on success; CI runs it in the server job.

```bash
make cli-smoke                 # builds bin/opentodo and bin/ot, then runs the script
OPENTODO_SMOKE_PORT=18081 ./scripts/cli-smoke.sh
```

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

## `e2e-views.mjs`

Browser check of saved views and dashboards (OpenSpec change `custom-views`) with two devices (two browser contexts on one account): saving from the Filter view with `s`, editing the query, grouping by due date and sorting, sidebar order and counts on both devices, unpin and the `g v` overview, a dashboard with three panels (Tab / Shift+Tab, live counts, the "View removed" placeholder, stacking at phone width), the per-device start view and its fallback after a deletion elsewhere, and a view saved offline on one device, then edited offline on both, converging after reconnect. Seeds its data through the REST API. Run it against a **fresh** data directory like the smoke test; pass a directory to also save screenshots:

```bash
make build
OPENTODO_DATA_DIR=$(mktemp -d) ./bin/opentodo &
CHROMIUM_PATH=/path/to/chrome npx -y -p playwright@1.56.1 node scripts/e2e-views.mjs [screenshot-dir]
```

## `screenshots.mjs`

Seeds a fresh server with a realistic set of projects and tasks and captures the screenshots used in `README.md` and the website (`docs/screenshots/*.png`, high-DPI). Same prerequisites and environment variables as the smoke test; run it against an **empty** data directory, then copy the PNGs into `website/assets/`.
