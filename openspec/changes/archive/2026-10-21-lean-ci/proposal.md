## Why

A pull request waits 22 to 24 minutes for CI and a push to `main` 30 to 45, almost all of it in two browser jobs that run their work one piece after another on a single machine: the layout check (16 minutes, Chromium and WebKit in one job, started only after the server job) and the UI check (12 to 20 minutes, the accessibility audit of every story one page at a time, then the visual comparison).

## What Changes

- The layout check runs as one Chromium job and three WebKit jobs, one per width (WebKit takes about twice as long on the runner), and starts after the web build instead of after the server job; it already builds its own server binary. The end-to-end checks run on the Chromium job.
- The UI check becomes two jobs: the accessibility audit, which checks four stories at once, and the visual comparison, split into three Playwright shards that run side by side.
- Publishing the image and the GitHub release waits for every one of these jobs.

No check is removed or loosened: the same screens, stories, themes, widths, engines and thresholds are checked, and the baselines are unchanged.

## Capabilities

### New Capabilities

### Modified Capabilities
- `self-hosting`: a check split into parallel jobs counts as succeeded only when all its jobs succeeded.

## Impact

`.github/workflows/ci.yml`, `scripts/ui-check/a11y.mjs` (a `CONCURRENCY` setting, default 4), `docs/design-system.md` (artifact names). More jobs per run, so more runner minutes in total (each job spends about a minute on setup), on GitHub-hosted runners that are free for this public repository; wall time for a pull request is expected to drop to about 11 to 13 minutes. No change to the app, the binary or the image.
