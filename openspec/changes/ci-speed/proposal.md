# CI speed: tiered CI, and a push to main publishes in about 15 minutes

## Why

A push to `main` takes a median of 31 minutes (p90 58) before the image is published, and a pull request 14.5. The audit of the test suites found where the time goes:

- The interface audit only reports (it never blocks), takes about 20 minutes, and the publish job waits for it: it sets the push wall time on its own.
- The web job runs the unit tests (about 4 minutes) before it builds the web app, and the server, layout and binary jobs wait for that build.
- The Chromium layout check runs three widths and the end-to-end checks one after another (about 9.5 minutes), the longest job left.
- The workbench accessibility check runs every story in one job (about 6 minutes of axe).

## What Changes

Tiered CI (approved by the owner): a typical pull request ran about 26 jobs and 130 job-minutes.

- **Pull requests** run the fast tier: the checks job (now also the docs check), and for code the web, web build, server and image jobs and one linux/amd64 binary; one Chromium layout job at every width in English followed by the end-to-end checks when the web app, the server or their scripts change (`layout` output of the path filter); the workbench accessibility and visual checks when the web app's sources or the workbench change (`ui`); Android, extension and skill only for their own files. A docs-only change runs the checks and the docs website.
- **Pushes to main and tags** run every job and every leg: Chromium and WebKit per width, German and French, the end-to-end checks, all six binaries, the workbench checks. Publishing still waits for all of them; `!cancelled() && !failure()` keeps a skipped job from blocking and a failed one blocking.
- **Nightly and on demand**: the report-only interface audit (and the race detector and upgrade check, already nightly).

- The interface audit moves to its own workflow (`.github/workflows/ux-audit.yml`): nightly on `main` and on demand on any branch. Neither a pull request nor a push waits for a report nobody gates on. Same command, same report artifact, same strict-mode variable.
- A `web-build` job builds the web app, runs the built-app tests and uploads `web-dist`; the `web` job keeps typecheck, lint, unit tests and the docs check. The server, layout and binary jobs need only `web-build`.
- The Chromium layout check runs one job per width like WebKit, and the end-to-end checks run as their own leg.
- The accessibility check of the workbench runs in two shards (`SHARD=i/n` in `scripts/ui-check/a11y.mjs`); the motion check runs in the first.
- Publishing still waits for every job of the run (the repository checks enforce it).

Every check still runs before anything is published: pull requests run a subset by path, pushes and tags run all of it with the same thresholds.

## Out of scope

- Vitest sharding and `isolate: false` (after the module-state resets are complete).
- The Go test speed-up (separate change: template database and `t.Parallel()`).

## Roadmap

Quality work behind every ROADMAP.md item (improvement plan wave 3, S1, S2, S5); no feature item.

## Capabilities

### New Capabilities

### Modified Capabilities
- `web-app`: the interface audit runs nightly and on demand instead of on every code change.
- `self-hosting`: tiered CI (what a pull request, a push and a tag run).

## Impact

`.github/workflows/ci.yml`, new `.github/workflows/ux-audit.yml`, `scripts/ci-changes.sh` (`ui`, `layout`, `extension`, `skill` outputs), `scripts/ui-check/a11y.mjs` (`SHARD`), `scripts/repo-checks.test.mjs`, `docs/design-system.md`, `CONTRIBUTING.md`. A regression that only WebKit or a translated catalog shows is caught on the push to main rather than on the pull request. More, shorter jobs per run (about four more runner-minutes of setup), on GitHub-hosted runners that are free for this public repository; the interface audit no longer runs on pushes (about 20 runner-minutes saved per push). No change to the app, the binary or the image.
