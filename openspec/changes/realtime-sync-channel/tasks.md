# Tasks

## 1. Server: notifier and stream endpoint

- [x] 1.1 Add `Notifier` to `internal/sync` (per-user subscriber set, device exclusion, non-blocking coalescing send, per-user cap of 16 with oldest eviction, unsubscribe on close); verify `go test ./...` passes new `TestNotifierExcludesOriginDevice`, `TestNotifierCoalescesSlowSubscriber`, `TestNotifierEvictsOldestOverCap`
- [x] 1.2 Call the notifier with the latest `seq` after every committed `Apply` in the sync handler and in the REST write-through; verify `go test ./...` passes `TestRestWriteWakesDevices` (a subscriber for the user receives an event after `POST /api/v1/tasks`)
- [x] 1.3 Add `GET /api/v1/sync/events` behind `requireAuth`: require `device` query parameter (400 `bad_request` when missing), SSE headers (`text/event-stream`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`), flush per write, `: ping` heartbeat every 25 s with session re-validation, cursor-only `ops` event payload, clean close on request cancel and server shutdown; verify `go test ./...` passes `TestEventsRequiresAuth` (401 envelope), `TestEventsRequiresDevice`, `TestEventsDeliversCursorOnlyPayload`, `TestEventsClosedOnShutdown`
- [x] 1.4 Confirm cross-user isolation at the HTTP level; verify `go test ./...` passes `TestEventsAreIsolatedPerUser` (user B's write produces no event on user A's stream)
- [x] 1.5 Document the route in `docs/api.md` and the channel in `docs/sync.md` ("Live updates" section: payload, heartbeat, exclusion, fallback); verify the examples match the handler's route, query parameter and event format

## 2. Client: channel lifecycle and fallback

- [x] 2.1 Add `live` to the sync status snapshot and open an `EventSource` to `/api/v1/sync/events?device=<id>` from `startSync()`, closing it in `stopSync()`; verify `npm test` passes new `sync.test.ts` cases using a fake `EventSource` (`opens after start`, `closes on stop`)
- [x] 2.2 On `ops` events compare the event cursor with the stored cursor and call `requestSync(0)` only when newer; verify `npm test` passes `wake-up with stale cursor does not sync` and `wake-up with newer cursor syncs`
- [x] 2.3 Reconnect with jittered exponential backoff (1 s base, 30 s cap), reset on `open`, sync immediately on every `open`, skip attempts while offline and retry on `online`; verify `npm test` passes `reconnects with capped backoff`, `syncs on reconnect`, `does not connect while offline`
- [x] 2.4 Switch the periodic interval to 5 minutes while `live` is true and back to 30 s when it drops; verify `npm test` passes `interval relaxes when live and restores on disconnect`
- [ ] 2.5 Show the live state in `SyncStatus` (connected vs. polling) without changing the existing offline/pending display; verify `npm run build` succeeds and, in the browser, the pill shows the connected state after sign-in and the polling state when the server is stopped

## 3. Deployment and docs

- [ ] 3.1 Confirm the service worker configuration excludes `/api/v1/sync/events` from every caching strategy (navigation fallback and runtime caching); verify `npm run build` output precache manifest contains no `/api/` entry and the stream works in the installed PWA
- [ ] 3.2 Add proxy notes to `docs/self-hosting/docker.md` and `docs/self-hosting/coolify.md` (buffering, idle timeouts, HTTP/2 recommendation, troubleshooting "live updates disconnected"); verify the compose deployment keeps a stream open for 10 minutes idle and delivers a change within 2 s afterwards
- [ ] 3.3 Update `README.md` feature list and `CHANGELOG.md` Unreleased; verify links resolve

## 4. Integration

- [ ] 4.1 Two-browser end-to-end run against the production binary: sign in on A and B, edit on B, A updates within 2 s with no poll; stop the server, A shows polling state, restart, A reconnects and syncs; create a task via REST with a token, both browsers update; verify the run finishes with "E2E OK" and no console errors
- [ ] 4.2 Run `make check`; verify it passes including `openspec validate --all --strict`
