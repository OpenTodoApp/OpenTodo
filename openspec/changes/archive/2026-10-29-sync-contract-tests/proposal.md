# Sync contract tests: the web client's sync code against the real server

## Why

The web client's sync engine (`web/src/lib/sync.ts`, `ops.ts`, `hlc.ts`) and the Go server only meet in the browser end-to-end scripts. The unit tests mock `./api` with hand-written fake servers that reimplement last-writer-wins, and the Go convergence property test drives a Go model of the client that already differs from `hlc.ts`. A protocol change on one side (a refusal reason, a clock rule, a response field) can pass both suites and break real devices.

## What Changes

- `npm run test:contract` (in `web/`, config `vitest.contract.config.ts`) starts the built server binary once on a fresh data directory with sign-up open (`src/test/contractServer.ts`) and runs `src/**/*.contract.test.ts` in Node. `src/test/contract.ts` gives each simulated device its own IndexedDB database, device id and signed-in session, and routes the client's own `fetch` calls to the server; nothing in `src/lib` is mocked.
- `src/lib/sync.contract.test.ts` covers: two devices of one account converging on creates, edits and completion; offline edits on two devices converging on the later one; a clock far ahead refused as `clock_skew`, corrected and landing; a viewer's edit refused by the server, reported and undone on the device; a device that was offline sending its queue and pulling what it missed.
- The default `npm test` excludes contract tests; the server job in CI runs them after building `bin/opentodo`.

## Out of scope

- The Android bridge contract (separate change).
- Live updates over the event stream, restores (log generation change) and end-to-end encryption against the server.

## Roadmap

Quality work behind every ROADMAP.md item (improvement plan wave 3, G5); no feature item.

## Capabilities

### New Capabilities

### Modified Capabilities
- `self-hosting`: CI runs the web sync client against the server binary.

## Impact

`web/vitest.contract.config.ts`, `web/src/test/contract*.ts`, `web/src/lib/sync.contract.test.ts`, `web/vite.config.ts` (exclude), `web/package.json` (script), `.github/workflows/ci.yml` (three steps in the server job, about 1 minute), `scripts/repo-checks.test.mjs`, `CONTRIBUTING.md`. No dependency, no change to the app, the binary or the image.
