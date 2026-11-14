# Tasks

## 1. Contract and fixtures

- [ ] 1.1 Add `pushSubscribe`, `pushState`, `pushUnsubscribe` to `OpenTodoShell` and `push` to the capabilities in `web/src/lib/shell.ts`; add the subscription, state and error shapes to the shared bridge fixtures. Verify: `npm test` in `web/` (the fixture test).
- [ ] 1.2 A Go test in `internal/push` writes `bridge/push-message.json` with the package's own `encrypt` from fixed keys and salt (`UPDATE_PUSH_FIXTURE=1`), and fails when the file is stale. Verify: `go test ./internal/push`.

## 2. Android

- [ ] 2.1 `WebPush.kt`: `aes128gcm` decryption with platform crypto, rejecting malformed input. Verify: unit tests against `push-message.json`, RFC 8291's example, a wrong key, a truncated body and an oversized record; `make android`.
- [ ] 2.2 `UnifiedPush.kt` and `PushReceiver`: the registration state machine, the token check, endpoint changes, failures and unregistration, key creation and deletion. Verify: unit tests of every transition and of an intent with a foreign token being ignored; `make android`.
- [ ] 2.3 Show a pushed reminder through the alarm's own notification code, once per reminder, cancel its alarm, acknowledge, and enqueue a background run. Verify: unit test that the notification id and channel are those of the alarm path; an instrumented test that a `MESSAGE` broadcast with the fixture's bytes shows one notification and a second one does not alert again.
- [ ] 2.4 The bridge methods and capability; the link activity from the visible app. Verify: unit tests of the answers by state; the script-text test lists the methods.

## 3. Web app

- [ ] 3.1 `web/src/lib/shellPush.ts`: enable, sync and disable against the existing push routes, loaded lazily. Verify: `npm test` (subscribe posts the shell's subscription with the titles option; a rotated endpoint replaces the row; unregistered turns it off; sign-out deletes; a 404 from the push routes hides the feature), `npm run build`, `make bundle-budget`.
- [ ] 3.2 The row in `ShellNotifications` with its states and translations. Verify: `npm test` (each state, not shown on iOS), `make i18n-check`, the Settings story.

## 4. Docs and release

- [ ] 4.1 `docs/android-app.md`, `docs/push-notifications.md`, `docs/privacy` or the page that lists what leaves the device, and `mobile/README.md` (the bridge table, the receiver). Verify: `make docs`, `make docs-check`.
- [ ] 4.2 `changelog.d/Added/shell-push.md`. Verify: `make repo-check`.
- [ ] 4.3 Run `make check`. Verify: it passes.

## 5. On a phone (owner)

- [ ] 5.1 With ntfy installed: turn the switch on, choose ntfy, close the app, add a reminder two minutes ahead on a computer, and see it arrive on time with its actions.
- [ ] 5.2 A reminder that is also in the phone's schedule alerts once.
- [ ] 5.3 Without a UnifiedPush app the row says so; sign-out removes the subscription (Settings → Notifications on another device no longer lists the phone).
