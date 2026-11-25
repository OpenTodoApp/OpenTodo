# Tasks

Some tasks wait for the owner's items in the proposal: 6.2 (items 1 to 4), 7.4 (item 5) and 8 (items 1 to 6). The rest can be built and tested without them.

## 1. Protocol and fixtures

- [x] 1.1 Write the protocol (handle layout with the key id in the AAD, signature string, payloads, error codes, limits) as `internal/pushrelay/PROTOCOL.md`. Verify: `go test ./internal/pushrelay -run TestProtocolDoc` (the routes, codes and limits in the document equal the code's).
- [ ] 1.2 Add the `apple-push` methods and capability to `OpenTodoShell` in `web/src/lib/shell.ts`, and their request, state and error shapes to the shared bridge fixtures. Verify: `npm test` in `web/` (the fixture test).

## 2. The relay

- [x] 2.1 `internal/pushrelay`: sealing and opening of handles with key ids, expiry, the key id bound in the AAD, and the HMAC check with a ±300 s window. Verify: `go test ./internal/pushrelay` (`TestHandleRoundTrip`, `TestExpiredHandle`, `TestKeyRotation`, `TestHandleKeyIdInAAD`, `TestWakeNeedsSignature`, `TestForgedHandleLooksLikeBadSignature`).
- [x] 2.2 The routes and their limits: body cap, the fixed payloads of design D5, and the rate limits of D6 (per device 3 `refresh` an hour, 4 `due` an hour and 24 a day) with a bounded LRU and daily salt, reset on restart. Verify: `go test ./internal/pushrelay` (`TestRoutes`, `TestRelayPayloadsAreFixed`, `TestExtraFieldsRefused`, `TestLimits`, `TestLimitsFollowTheTokenAcrossRegistrations`, `TestLRUBound`).
- [x] 2.3 The APNs client (HTTP/2, ES256 provider token renewed every 40 min, environment hosts, `410`/`BadDeviceToken` → `gone`, no interruption level), against an `httptest` fake. Verify: `go test ./internal/pushrelay` (`TestAPNsRequest`, `TestAPNsGone`, `TestNoOtherOutbound`).
- [x] 2.4 `cmd/opentodo-push-relay`: the relay's configuration from its own environment (key file, Key ID, Team ID, topic, sealing-keys file, address), the hourly counter line, and nothing logged per request. Verify: `go test ./cmd/opentodo-push-relay` (`TestNoRequestDataInLogs`: a day of fake traffic, then the captured output holds no address, handle or token), `gosec` via `make lint`.

## 3. The server

- [ ] 3.1 The owner settings `push.apple_relay` and `push.apple_relay_url`, the optional `OPENTODO_APPLE_RELAY` that overrides the address only (documented in `docs/self-hosting/configuration.md`), off on a demo instance and without push. Verify: `go test ./internal/config ./internal/tenant/...` (the env-docs test lists the variable), `TestNoRelayCallWhileOff`, `TestEnvOverrideNeverTurnsOn` (the variable set, the switch off: no request and the iPhone row hidden).
- [x] 3.2 Migration `apple_devices`, and its deletion with the session, on a revoked device and with the 10-per-user bound. Verify: `go test ./internal/store ./internal/httpapi -run 'AppleDevice|RevokedDevice'`.
- [x] 3.3 `internal/push/apple.go`: the client, minting a random wake key per registration and keeping neither the APNs token nor the due token, through `internal/outbound` with the push client and `User-Agent: OpenTodo`. Verify: `go test ./internal/push` (`TestRelayThroughOutbound`, `TestRelayPrivateTargetRefused`, `TestWakeCarriesNoContent`, `TestRegistrationKeepsNoToken`; the server tests run the real `internal/pushrelay` handler against fake APNs).
- [x] 3.4 The routes under `/api/v1/push/apple` through `routes.handle` with `.demoDenied()` and entries in `internal/httpapi/demo.go`; the due route as `public(...)` with its bearer, its limit and its title rule (plain text, truncated to 120 characters). Verify: `go test ./internal/httpapi` (`TestRouteMatrix`, and an authentication and an error case per route as the spec lists), and `make docs` updates `docs/openapi.json`.
- [ ] 3.5 When to wake: `refresh` after `NotifyApplied`, coalesced to one every 20 min per device and skipping the origin device; `due` in the reminders job only for a stale schedule; the retry rules and `Retry-After`; `410` deletes the row; one `due` per device and minute within the caps; the push test route also sends `due`. Verify: `go test ./internal/push` (`TestRefreshCoalesced`, `TestRefreshSkipsOrigin`, `TestDueOnlyWhenStale`, `TestDueStaysUnderCaps`, `TestDueRetryWindow`, `TestGoneDeletes`, `TestRelayFailureDoesNotDelayWebPush`).
  - [ ] 3.5.1 Re-register after a sealing-key removal or a relay address change: `Wake` flags a row on `401 signature`, `ReportSchedule` then answers `renew: true`, and each row stores the relay address it was registered with, so a changed address also asks for renewal. Verify: `go test ./internal/push -run 'TestRenewAfterKeyRemoval|TestRenewAfterRelayChange'`.
- [x] 3.6 The relay's state in the delivery check, probing `/v1/health` only while the switch is on. Verify: `go test ./internal/httpapi -run DeliveryCheck` (`TestDeliveryCheckNoProbeWhileOff`: with the switch off, the fake relay receives no request).

## 4. The web app

- [ ] 4.1 `web/src/lib/applePush.ts` (lazy): enable, report the schedule after every hand-over, renew on `renew` or `tokenChanged`, re-register on 404, and disable on off, sign-out, lock and server change. Verify: `npm test` (each path), `npm run build`, `make bundle-budget`.
- [ ] 4.2 The iPhone row in `ShellNotifications` and the owner row in Settings → Notifications (the switch, with the address under it while on), with translations. Verify: `npm test` (each state; the Android row's iPhone scenario), `make i18n-check`, the Settings stories.

## 5. The iPhone app

- [ ] 5.1 The due token (32 random bytes) in the shared Keychain (`ThisDeviceOnly`), remote-notification registration, and the bridge methods (listed only with the entitlement; `applePushRenew` never returns the due token). Verify: `make ios` (`ApplePushTests`: the register and state answers, renew without the token, forget deletes the item).
- [ ] 5.2 Silent push runs `HiddenRun` with a 25 s budget and completes on `backgroundDone`. Verify: `make ios` (unit test of the completion on done and on timeout).
- [ ] 5.3 The `OpenTodoNotify` extension: the due fetch with an 8 s timeout, the plain-text title or the generic text, the category and `userInfo`, removing the local duplicate, the count for several reminders, and ignoring payload URLs; and the bundle ID in the CI registration script. Verify: `make ios` (`NotifyTests` against a stub server: title, encrypted account, timeout, 401, a login wall's redirect, a duplicate removed, a URL ignored).

## 6. Release and deployment (6.2 needs the owner's items 1 to 4)

- [ ] 6.1 Build, sign and attest the relay image from the release workflow (a workflow change in its own pull request), plus a `Dockerfile` target. Verify: `scripts/repo-checks.test.mjs` ("published artefacts are signed and attested" covers the relay image), `make repo-check`.
- [ ] 6.2 `deploy/push-relay/`: one long-running instance (no scale-to-zero, no second replica) with Caddy, access logs off, the image pinned by digest, and secrets by file. Verify: `make deploy-check`; after the owner deploys, `GET https://<relay domain>/v1/health` answers protocol 1.

## 7. Docs and threat model

- [ ] 7.1 `docs/push-relay.md`: what the relay is, who sees what (design D1 in plain words), what it logs, its host, that its limits reset on restart, how to turn it on, and how to run your own. Say that the notification extension shows generic text unless a login wall in front of the server lets `/api/v1/push/apple/due` through, and that titles arrive as plain text, truncated. Also `docs/push-notifications.md` (On iPhone and iPad), `docs/ios-app.md`, `mobile/README.md` (the bridge table, the extension) and `RELEASING.md` (the relay image). Verify: `make docs`, `make docs-check`.
- [ ] 7.2 `docs/security/threat-model.md`: the additions of design D13. Verify: `make docs-check`; every test named there exists (`go test ./...`).
- [ ] 7.3 `ROADMAP.md` and `changelog.d/Added/ios-push-relay.md`. Verify: `make docs`, `make repo-check`.
- [ ] 7.4 `mobile/ios/store/`: the review notes point at a test server with the relay on (owner item 5), and the App Privacy answer stays "Data Not Collected". Verify: `make repo-check` (the store files' check).
- [ ] 7.5 Run `make check`. Verify: it passes.

## 8. On a phone (owner)

- [ ] 8.1 With the relay deployed and turned on: turn the iPhone setting on, force-quit the app, add a reminder two minutes ahead on a computer, and see it arrive on time with its title and actions.
- [ ] 8.2 Move a reminder on the computer with the app in the background, and see the phone's schedule follow (or a `due` deliver it) without a duplicate.
- [ ] 8.3 Stop the relay: reminders scheduled on the phone still arrive; the delivery check reports the relay.
- [ ] 8.4 Sign out: the registration is gone from the server, and a test wake shows at most the generic text.
