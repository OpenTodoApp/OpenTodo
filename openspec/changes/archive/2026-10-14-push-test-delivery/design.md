# Design

## Context

See proposal.md (Why). Current state, as found in the code:

- **`testNotification()`** (`web/src/lib/push.ts`) shows a notification from the page: through `reg.showNotification` when a service worker answers within 1 s, otherwise with `new Notification`. It always uses the tag `opentodo-test`. It never calls the server.
- **The button** (`NotificationsSettings.tsx`) is enabled whenever the permission is `granted`, and always reports "Test notification sent."
- **The server** already has everything a real test needs. `push.Service.Send(ctx, sub, payload, topic)` encrypts (RFC 8291), signs (VAPID), posts, and classifies the result as `Sent`, `Gone` (404/410, the row is deleted) or `Failed` (counted, `needsRenewal` after 5). `SubscriptionForDevice(user, device)` finds the row. The routes live in `internal/httpapi/push.go` and are registered only when push is enabled.
- **The service worker** (`web/public/push-sw.js`) treats every push without `type: "reminder"` as a generic "You have a reminder" notification. For reminders it posts to a focused window instead of notifying, so a test sent while Settings is open would never become a system notification under the current logic.
- **Dev builds:** `vite.config.ts` doesn't enable VitePWA `devOptions`, so `make dev` (:5173) has no service worker, and `enablePush` throws "The offline service worker is not active yet".
- **Demo mode:** `internal/httpapi/demo.go` denies the `/api/v1/push` prefix before authentication.
- **Scopes:** read and agent tokens are already refused on every write request in the auth middleware (`server.go`, `insufficient_scope`), and a POST counts as a write.

## Goals / Non-Goals

**Goals:**
- The test exercises the same path as a real reminder push, from server to push service to service worker to OS, and reports each hop it can observe.
- The UI never claims more than it knows: "sent" (the push service accepted it) and "received" (the service worker saw it) are distinct states.
- Every failure state has a next action.

**Non-Goals:**
- Detecting whether the OS actually drew the notification. No web API exposes that; we can only confirm that the service worker received the push and called `showNotification` successfully.
- An admin-wide "test all devices" or per-user diagnostics page.
- Changes to reminder scheduling, payload privacy rules, or subscription storage.

## Decisions

### D1. Test payload is `{"type":"test","testId":"<random>","sentAt":<ms>}` and reuses `Send`
`push.Service` gets `SendTest(ctx, sub) (testID string, SendResult, error)`. It builds the payload with a random 16-byte base64url id and calls `Send` with the topic `test`, so repeated tests collapse at the push service while queued and don't pile up on an offline device. Reusing `Send` means the test updates `last_ok_at`, `failures` and `last_error`, and removes gone subscriptions, exactly like reminders. That is the point: a test that succeeds should make "Last delivered" true.
*Alternative:* a separate send path without bookkeeping. Rejected. It would test less than the real path, and a successful test wouldn't refresh the stale failure state the user is probably trying to clear.
The payload carries no task data, so the privacy requirement and E2EE are unaffected (`ContentFields` untouched).

### D2. Route `POST /api/v1/push/test`, body `{deviceId}`, outcome in a 200 body
The route is registered next to the other push routes with `requireAuth`. A push-service failure is a successful diagnostic, not an HTTP error, so outcomes come back as 200:
`{"outcome":"sent","testId":"…","subscription":{…public…}}`, or `no_subscription`, `gone` (subscription `null`) or `failed` (`status`, `error`).
HTTP errors are reserved for request problems: 400 `bad_request` (no device id), 401, 403 `insufficient_scope` (middleware), 403 `bad_origin` (cookie CSRF check, existing), 429 `rate_limited`, 404 when push is off (route not registered), 403 `demo_restricted` (existing prefix deny).
*Alternative:* map `gone` and `failed` to 410 and 502. Rejected. Clients would have to parse error envelopes for expected states, and proxies log 502s as server faults.

### D3. Rate limit: 5 tests per account per 10 minutes
The limit is a new `pushTestLimiter *rateLimiter` keyed by user id, using the existing `newRateLimiter`. It is low enough that the server can't be used to spam a push endpoint, and high enough for a troubleshooting session. The limit is counted before any outbound request is made.

### D4. Service worker: tests always notify, with a unique tag, and report receipt
In `push-sw.js`, a push with `type: "test"` skips the focused-window hand-off and calls `showNotification('OpenTodo', {body:'Test notification: push works on this device.', tag:'opentodo-test:'+testId, …})`. After that resolves, it posts `{type:'push:test-received', testId, receivedAt}` to all window clients (`includeUncontrolled: true`). A click focuses or opens `/settings/notifications`.
Unknown types keep today's generic fallback. Unlike reminders, a test writes nothing to IndexedDB and creates no op, so there is nothing to converge.
*Why always notify:* the user's question is "will I see reminders when the app is closed?" Handing the test to the in-app toast, which is what happens today with a reminder when the app is focused, answers a different question.

### D5. Client: sent, then received, with a 10-second wait
`push.ts` gets `sendTestPush(deviceId)`, which calls the route and then waits up to 10 s for a matching `push:test-received` message on `navigator.serviceWorker`. The UI states are:
`sending → sent (waiting) → received` | `accepted, not seen` | `no subscription` | `gone` | `failed: <status>` | `rate limited` | `offline`.
Ten seconds covers normal FCM, Mozilla and Apple delivery. Slower arrivals still post the receipt, and the UI upgrades to "received" if the page is still open.

### D6. Checklist is derived, not stored
The checklist is computed from `loadPushState()` (support, permission, `swRegistration`, server subscription) plus the last test result held in component state. Nothing new is persisted. Server steps show "can't check while offline" when `navigator.onLine` is false or the vapid-key call fails with a network error.
Fix actions map to the existing functions: Enable → `enablePush`, Re-enable → `enablePush`, reload → `location.reload()`. Permission and OS hints are copy, with platform-specific text for macOS, Windows, Android and iOS chosen from `navigator.userAgent` on a best-effort basis.

### D7. The local test is demoted, not removed
When there's no subscription, the old page-level notification stays as a secondary "Show a local notification" action, so a user can at least check that the permission and OS display settings work. It's labeled as local, uses a unique tag, and never sets a "received" state.

### D8. Dev mode: explain, don't enable VitePWA `devOptions` (yet)
Enabling `devOptions: { enabled: true, type: 'module' }` would register a service worker on :5173. But it changes dev caching (stale-asset confusion during HMR), Workbox's `importScripts` of `push-sw.js` behaves differently in module type, and devices would subscribe against the dev origin. The checklist's "no service worker" row tells developers to use `make run` (production build on :8080), which is enough. This can be revisited as a separate tooling change if contributors ask for it.

### Data model and size impact
- No op schema change, no migration. Subscription rows keep their existing columns.
- New state: one in-memory rate limiter map on the server.
- Image size and runtime memory: unchanged within noise (no dependency, about 100 lines of Go).
- Web bundle: under 2 KB gzipped, plus about 40 lines in `push-sw.js`.

## Risks / Trade-offs

- [Some browsers throttle or require a visible notification for every push (Chrome's "userVisibleOnly")] → D4 always shows a notification for tests, which satisfies that rule.
- [Safari/iOS delivers late or only for the installed app] → "Accepted, not seen" copy names iOS installed-app requirements. The receipt still upgrades the state if it arrives late.
- [A receipt is posted but the OS suppressed the banner (Focus, macOS settings)] → we say "received on this device" (true), and the copy reminds users that the OS can still hide the banner, with OS-specific hints. We don't overclaim "displayed".
- [A test consumes push-service quota or annoys other devices] → it targets only the posting device's subscription and is rate limited (D3).
- [`topic: test` collapses a second test still queued for an offline device] → intended: an offline device gets one test notification when it reconnects, not a burst.
- [A failed test increments `failures` and can trip `needsRenewal`] → intended. It reflects reality, and the checklist offers Re-enable.

## Migration Plan

- This change is purely additive. Old clients never call the new route. New clients against an old server get 404 on `/api/v1/push/test`; the client treats that as "server too old" and shows the local test with an explanation.
- To roll back, revert the change. No data needs cleanup.
