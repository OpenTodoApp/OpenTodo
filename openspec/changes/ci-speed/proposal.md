# CI speed: a push to main publishes in about 15 minutes

## Why

A push to `main` takes a median of 31 minutes (p90 58) before the image is published, and a pull request 14.5. The audit of the test suites found where the time goes:

- The interface audit only reports (it never blocks), takes about 20 minutes, and the publish job waits for it: it sets the push wall time on its own.
- The web job runs the unit tests (about 4 minutes) before it builds the web app, and the server, layout and binary jobs wait for that build.
- The Chromium layout check runs three widths and the end-to-end checks one after another (about 9.5 minutes), the longest job left.
- The workbench accessibility check runs every story in one job (about 6 minutes of axe).

## What Changes

- The interface audit moves to its own workflow (`.github/workflows/ux-audit.yml`): every pull request that changes code, nightly on `main`, and on demand. The push run no longer contains it, so publishing does not wait for a report nobody gates on. Same command, same report artifact, same strict-mode variable.
- A `web-build` job builds the web app, runs the built-app tests and uploads `web-dist`; the `web` job keeps typecheck, lint, unit tests and the docs check. The server, layout and binary jobs need only `web-build`.
- The Chromium layout check runs one job per width like WebKit, and the end-to-end checks run as their own leg.
- The accessibility check of the workbench runs in two shards (`SHARD=i/n` in `scripts/ui-check/a11y.mjs`); the motion check runs in the first.
- Publishing still waits for every job of the run (the repository checks enforce it).

No check is removed or loosened: the same tests, screens, stories, widths and thresholds run.

## Out of scope

- Vitest sharding and `isolate: false` (after the module-state resets are complete).
- The Go test speed-up (separate change: template database and `t.Parallel()`).

## Roadmap

Quality work behind every ROADMAP.md item (improvement plan wave 3, S1, S2, S5); no feature item.

## Capabilities

### New Capabilities

### Modified Capabilities
- `web-app`: the interface audit runs on pull requests and nightly instead of on every push.

## Impact

`.github/workflows/ci.yml`, new `.github/workflows/ux-audit.yml`, `scripts/ui-check/a11y.mjs` (`SHARD`), `scripts/repo-checks.test.mjs`, `docs/design-system.md`. More, shorter jobs per run (about four more runner-minutes of setup), on GitHub-hosted runners that are free for this public repository; the interface audit no longer runs on pushes (about 20 runner-minutes saved per push). No change to the app, the binary or the image.
