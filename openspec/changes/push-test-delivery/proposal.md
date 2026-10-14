# Proposal

## Why

"Send test notification" says "Test notification sent." even when nothing appears. The test never reaches the server. It shows a notification from the page itself (`web/src/lib/push.ts` `testNotification`), so it proves only that the browser permission is granted, not that reminders reach this device while the app is closed. It cannot see a missing subscription, an operating system that hides notifications, a push service that rejects the server, or a dev build with no service worker. People conclude push is broken, or they believe it works when it doesn't. A test that can't fail tells the user nothing.

## What Changes

- **A real end-to-end test.** A new route, `POST /api/v1/push/test`, sends an actual web push to the caller's subscription for the current device through the same path as reminders (encryption, VAPID, push service). It reports what happened: no subscription on this device, accepted by the push service, subscription gone (removed, re-enable offered), or rejected with the push service's status. It needs authentication, refuses read and agent tokens, is rate limited per account, and is refused in demo mode by the existing `/api/v1/push` deny entry.
- **Arrival is confirmed, not assumed.** The service worker always shows the test as a system notification, even while the app is in front. It does not hand it to the in-app toast the way it does for reminders. It then tells the open page it received the push, so Settings can say "Received on this device" instead of only "Sent". If no confirmation arrives within a short wait, Settings says the push was accepted but not seen, and points at the likely causes.
- **A delivery checklist in Settings → Notifications.** Each step that has to hold for push to work gets a row: browser permission, offline service worker active, subscription on this device, server accepting pushes (last delivery or failure), and test received. Each failing row shows its fix: allow the site, reload, enable or re-enable, check the operating system's notification and focus settings, use the installed app on iOS. A development build without a service worker says so plainly instead of failing silently.
- **Repeated tests stay visible.** Each test uses its own notification tag, so a second test doesn't silently replace the first.
- **The local-only test goes away.** A page-only notification remains only as a labeled fallback, "Show a local notification", for when this device has no subscription. It is never reported as proof that push works.
- **Docs.** `docs/notifications.md` (testing and troubleshooting) and `docs/api.md` (the new route) describe the new behavior.

Out of scope:
- Service-worker registration in `vite dev`. Turning on the PWA plugin's dev mode is weighed in design.md and deferred; the checklist explains the dev case instead.
- Changes to how reminders themselves are delivered, scheduled or snoozed.
- Testing other users' devices, or all of a user's devices at once.
- Email or other notification channels.
- The visual redesign of the settings page. That is the `settings-redesign` change; this change uses the existing panel markup and will adopt the new primitives when they land.

No new environment variable, no op-log change. Nothing is **BREAKING**.

ROADMAP: advances "Reminders and web push notifications" (`reminders`) and the "Real-world verification" item, which calls for exercising web push on real devices. A real test path is how that verification gets done and reported.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `reminders`: "Notification settings" changes: the test action becomes a real push with reported outcomes, a receipt confirmation and a delivery checklist. A new requirement covers the push test route (authentication, scope, rate limit, outcomes, push turned off).

`demo-mode` was checked and needs no delta: its deny list already refuses web push, and `internal/httpapi/demo.go` matches the whole `/api/v1/push` prefix, so the new route is refused before authentication with no outbound request.

## Impact

- **Server:** `internal/httpapi/push.go` (new handler and route registration, a rate limiter on `Server`). `internal/push/service.go` (a `SendTest` helper building a `{"type":"test"}` payload with a unique id, reusing `Send` and its bookkeeping: `recordOK`, `RecordFailure`, gone removal). Tests in `internal/httpapi` and `internal/push`.
- **Service worker:** `web/public/push-sw.js` (handle `type: "test"`: always show a system notification with a unique tag, and `postMessage` a receipt to every window).
- **Client:** `web/src/lib/push.ts` (`sendTestPush`, receipt listener, checklist state), `web/src/app/NotificationsSettings.tsx` (checklist and outcome messages), plus tests.
- **Docs:** `docs/notifications.md`, `docs/api.md`.
- **Dependencies:** none. Bundle impact under 2 KB gzipped. Binary and memory impact negligible.
- **Outbound requests:** only to the push service endpoint the browser registered, the same targets reminders already use.
