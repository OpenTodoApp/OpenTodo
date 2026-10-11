# scripts

## `cli-smoke.sh`

End-to-end check of the `ot` command-line client: starts `bin/opentodo` on a throwaway port and data directory, creates the owner account, then runs `ot login`, `project add`, `add`, `list --json`, `done` (by id prefix), the exit-code contract, `export` and `auth logout`. Prints `CLI OK` on success; CI runs it in the server job.

```bash
make cli-smoke                 # builds bin/opentodo and bin/ot, then runs the script
OPENTODO_SMOKE_PORT=18081 ./scripts/cli-smoke.sh
```

## `e2e-smoke.mjs`

Drives the production binary in headless Chromium through the whole walking skeleton: owner setup, capture, natural-language quick add (preview chips, then the parsed date and priority checked on the server), projects, detail edits, keyboard shortcuts, views, sync verified through the REST API, a second device, an offline edit that uploads on reconnect, settings and tokens, mobile layout. Selectors are scoped by role and label (a task row is the button whose name starts with its title; detail fields are looked up inside the detail panel), so the Parent task picker and subtask lists never make them ambiguous. Pass a directory as the first argument to also save screenshots of the run.

Run it against a **fresh** data directory (the script creates the owner account):

```bash
make build
OPENTODO_DATA_DIR=$(mktemp -d) ./bin/opentodo &
npm i -g playwright@1.56.1 && npx playwright install chromium   # once
node scripts/e2e-smoke.mjs [screenshot-dir]
# or, with a Chromium already on disk:
CHROMIUM_PATH=/path/to/chrome node scripts/e2e-smoke.mjs
```

Environment: `OPENTODO_URL` (default `http://127.0.0.1:8080`), `CHROMIUM_PATH` (optional). Exit code is non-zero on any failed step or browser console error.

## `e2e-views.mjs`

Browser check of saved views and dashboards (OpenSpec change `custom-views`) with two devices (two browser contexts on one account): saving from the Filter view with `s`, editing the query, grouping by due date and sorting, sidebar order and counts on both devices, unpin and the `g v` overview, a dashboard with three panels (Tab / Shift+Tab, live counts, the "View removed" placeholder, stacking at phone width), the per-device start view and its fallback after a deletion elsewhere, and a view saved offline on one device, then edited offline on both, converging after reconnect. Seeds its data through the REST API. Run it against a **fresh** data directory like the smoke test; pass a directory to also save screenshots:

```bash
make build
OPENTODO_DATA_DIR=$(mktemp -d) ./bin/opentodo &
npm i -g playwright@1.56.1 && npx playwright install chromium   # once
node scripts/e2e-views.mjs [screenshot-dir]
# or, with a Chromium already on disk:
CHROMIUM_PATH=/path/to/chrome node scripts/e2e-views.mjs
```

## `screenshots.mjs`

Seeds a fresh server with realistic demo data (three accounts, shared projects, sections, subtasks, comments, reminders, saved views, settings) and captures the screenshots used by `README.md` (`docs/screenshots/*.png`) and the website (`website/assets/shots/*.webp`). Run it against an **empty** data directory; see [`website/README.md`](../website/README.md#refresh-the-screenshots) for the full recipe.
