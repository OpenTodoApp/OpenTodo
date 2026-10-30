# Built app tests: the service worker, the manifest and an offline start run in CI

## Why

The unit tests of the built service worker and web app manifest (`web/src/lib/serviceWorker.test.ts`) and the check that the production build holds no workbench code (`web/src/ui/workbench.test.ts`) skip when the web app has not been built. CI runs `npm test` before `npm run build`, so every CI log shows them skipped: they have never run in CI. Nothing checks that the app starts with the network off (a reload served from the precache with the tasks from IndexedDB), or that `/api/*` is never answered from a cache.

## What Changes

- `npm run test:built` runs the two built-artifact test files with `REQUIRE_BUILT=1`, which turns a missing build into a failure instead of a skip. The web job runs it after the build.
- `scripts/e2e-offline.mjs`, run by `make e2e` (the Chromium layout job): a fresh server, the owner set up, a task synced, the built service worker in control and the manifest served; then the network off and a reload: the app opens with the task, a request to `/api/*` fails instead of being served from a cache, a task added offline is queued and reaches the server once the network is back.
- The repository checks require both.

## Out of scope

- The service worker update path (a waiting worker and the reload prompt).
- Push and share-target delivery in a browser.

## Roadmap

Quality work behind every ROADMAP.md item (improvement plan wave 3, G1); no feature item.

## Capabilities

### New Capabilities

### Modified Capabilities
- `self-hosting`: CI tests the built app's service worker, manifest and offline start.

## Impact

`web/src/lib/serviceWorker.test.ts`, `web/src/ui/workbench.test.ts`, `web/package.json` (script), `scripts/e2e-offline.mjs`, `scripts/README.md`, `Makefile` (`e2e`), `.github/workflows/ci.yml` (one step), `scripts/repo-checks.test.mjs`. About 15 s more in the web job and 20 s in the Chromium layout job. No change to the app, the binary or the image.
