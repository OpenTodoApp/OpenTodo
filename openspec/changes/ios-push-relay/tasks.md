# Tasks

Tasks 6 and 7 wait for the owner's items in the proposal (the Apple key, hosting, the domain, the sealing key). Tasks 1 to 5 can be built and tested without them.

## 1. Protocol and fixtures

- [ ] 1.1 Write the protocol (handle layout, signature string, payloads, error codes, limits) as `internal/pushrelay/PROTOCOL.md`, and write the shared vectors to `internal/pushrelay/testdata/vectors.json`: a fixed secret, the derived wake key and due token, a sealed handle under a fixed key and nonce, and a signed wake. Verify: `go test ./internal/pushrelay -run TestVectors` (fails when the file is stale; `UPDATE_RELAY_VECTORS=1` rewrites it).
- [ ] 1.2 Add the `apple-push` methods and capability to `OpenTodoShell` in `web/src/lib/shell.ts`, and their request, state and error shapes to the shared bridge fixtures. Verify: `npm test` in `web/` (the fixture test).

## 2. The relay

- [ ] 2.1 `internal/pushrelay`: sealing and opening of handles with key ids, expiry, and the HMAC check with a ±300 s window. Verify: `go test ./internal/pushrelay` (`TestHandleRoundTrip`, `TestExpiredHandle`, `TestKeyRotation`, `TestWakeNeedsSignature`, `TestForgedHandleLooksLikeBadSignature`, `TestVectors`).
- [ ] 2.2 The routes and their limits: body cap, the fixed payloads of design D5, and the rate limits of D6 with a bounded LRU and daily salt. Verify: `go test ./internal/pushrelay` (`TestRoutes`, `TestRelayPayloadsAreFixed`, `TestExtraFieldsRefused`, `TestLimits`, `TestLRUBound`).
- [ ] 2.3 The APNs client (HTTP/2, ES256 provider token renewed every 40 min, environment hosts, `410`/`BadDeviceToken` → `gone`) and DeviceCheck validation, both against `httptest` fakes. Verify: `go test ./internal/pushrelay` (`TestAPNsRequest`, `TestAPNsGone`, `TestRegisterNeedsDeviceCheck`, `TestDeviceCheckUnavailable`).
- [ ] 2.4 `cmd/opentodo-push-relay`: the relay's configuration from its own environment (key file, Key ID, Team ID, topic, sealing-keys file, address), the hourly counter line, and nothing logged per request. Verify: `go test ./cmd/opentodo-push-relay` (`TestNoRequestDataInLogs`: a day of fake traffic, then the captured output holds no address, handle or token), `gosec` via `make lint`.

## 3. The server

- [ ] 3.1 The owner settings `push.apple_relay` and `push.apple_relay_url`, the optional `OPENTODO_APPLE_RELAY` (documented in `docs/self-hosting/configuration.md`), off on a demo instance and without push. Verify: `go test ./internal/config ./internal/tenant/...` (the env-docs test lists the variable), `TestNoRelayCallWhileOff`.
- [ ] 3.2 Migration `apple_devices`, and its deletion with the session, on a revoked device and with the 10-per-user bound. Verify: `go test ./internal/store ./internal/httpapi -run 'AppleDevice|RevokedDevice'`.
- [ ] 3.3 `internal/push/apple.go`: the client, through `internal/outbound` with the push client and `User-Agent: OpenTodo`. Verify: `go test ./internal/push` (`TestRelayThroughOutbound`, `TestRelayPrivateTargetRefused`, `TestWakeCarriesNoContent`; the server tests run the real `internal/pushrelay` handler against fake APNs).
- [ ] 3.4 The routes under `/api/v1/push/apple` through `routes.handle` with `.demoDenied()` and entries in `internal/httpapi/demo.go`; the due route as `public(...)` with its bearer, its limit and its title rule. Verify: `go test ./internal/httpapi` (`TestRouteMatrix`, and an authentication and an error case per route as the spec lists), and `make docs` updates `docs/openapi.json`.
- [ ] 3.5 When to wake: `refresh` after `NotifyApplied`, coalesced to one every 20 min per device and skipping the origin device; `due` in the reminders job only for a stale schedule; the retry rules and `Retry-After`; `410` deletes the row; the push test route also sends `due`. Verify: `go test ./internal/push` (`TestRefreshCoalesced`, `TestRefreshSkipsOrigin`, `TestDueOnlyWhenStale`, `TestDueRetryWindow`, `TestGoneDeletes`, `TestRelayFailureDoesNotDelayWebPush`).
- [ ] 3.6 The relay's state in the delivery check. Verify: `go test ./internal/httpapi -run DeliveryCheck`.

## 4. The web app

- [ ] 4.1 `web/src/lib/applePush.ts` (lazy): enable, report the schedule after every hand-over, renew on `renew` or `tokenChanged`, re-register on 404, and disable on off, sign-out, lock and server change. Verify: `npm test` (each path), `npm run build`, `make bundle-budget`.
- [ ] 4.2 The iPhone row in `ShellNotifications` and the owner row in Settings → Notifications (the switch, with the address under it while on), with translations. Verify: `npm test` (each state; the Android row's iPhone scenario), `make i18n-check`, the Settings stories.

## 5. The iPhone app

- [ ] 5.1 The device secret in the shared Keychain (`ThisDeviceOnly`), key derivation equal to `vectors.json`, DeviceCheck, remote-notification registration, and the bridge methods (listed only with the entitlement). Verify: `make ios` (`ApplePushTests`: derivation against the vectors, the state answers, forget deletes the item).
- [ ] 5.2 Silent push runs `HiddenRun` with a 25 s budget and completes on `backgroundDone`. Verify: `make ios` (unit test of the completion on done and on timeout).
- [ ] 5.3 The `OpenTodoNotify` extension: the due fetch with an 8 s timeout, the title or the generic text, the category and `userInfo`, removing the local duplicate, the count for several reminders, and ignoring payload URLs; and the bundle ID in the CI registration script. Verify: `make ios` (`NotifyTests` against a stub server: title, encrypted account, timeout, 401, a duplicate removed, a URL ignored).

## 6. Release and deployment (needs the owner's items 2 to 4)

- [ ] 6.1 Build, sign and attest the relay image from the release workflow (a workflow change in its own pull request), plus a `Dockerfile` target. Verify: `scripts/repo-checks.test.mjs` ("published artefacts are signed and attested" covers the relay image), `make repo-check`.
- [ ] 6.2 `deploy/push-relay/`: a compose file with Caddy, access logs off, the image pinned by digest, and secrets by file. Verify: `make deploy-check`; after the owner deploys, `GET https://<relay domain>/v1/health` answers protocol 1.

## 7. Docs and threat model

- [ ] 7.1 `docs/push-relay.md`: what the relay is, who sees what (design D1 in plain words), what it logs, its host, how to turn it on, and how to run your own. Also `docs/push-notifications.md` (On iPhone and iPad), `docs/ios-app.md`, `mobile/README.md` (the bridge table, the extension) and `RELEASING.md` (the relay image). Verify: `make docs`, `make docs-check`.
- [ ] 7.2 `docs/security/threat-model.md`: the additions of design D13. Verify: `make docs-check`; every test named there exists (`go test ./...`).
- [ ] 7.3 `ROADMAP.md` and `changelog.d/Added/ios-push-relay.md`. Verify: `make docs`, `make repo-check`.
- [ ] 7.4 Run `make check`. Verify: it passes.

## 8. On a phone (owner)

- [ ] 8.1 With the relay deployed and turned on: turn the iPhone setting on, force-quit the app, add a reminder two minutes ahead on a computer, and see it arrive on time with its title and actions.
- [ ] 8.2 Move a reminder on the computer with the app in the background, and see the phone's schedule follow (or a `due` deliver it) without a duplicate.
- [ ] 8.3 Stop the relay: reminders scheduled on the phone still arrive; the delivery check reports the relay.
- [ ] 8.4 Sign out: the registration is gone from the server, and a test wake shows at most the generic text.
