## 1. Protocol and storage

- [x] 1.1 `internal/caldav/push.go`: the WebDAV-Push names, the `push-register` parser (bounded size, every refusal) and the `push-message` writer; table tests with the draft's examples. Verify: `go test ./internal/caldav`.
- [x] 1.2 Migration `dav_push_subscriptions` and `internal/davpush` store (create or renew by push resource, delete by id and user, delete by app password, expire, limits). Verify: `go test ./internal/davpush ./internal/store`.

## 2. Endpoint

- [x] 2.1 Owner switch `caldav.push` (`settings.Switch`, `OPENTODO_CALDAV_PUSH`, routes from `switch.go`), refused on the demo. Verify: `go test ./internal/settings ./internal/httpapi -run Switch`.
- [x] 2.2 `davroutes`: `DAV: webdav-push`, the three properties on the home and calendars in scope, `POST` registration (201/204, `Location`, `Expires`, 403 preconditions, 401, scope 404), `DELETE /dav/push/<id>`, revoking an app password removes its subscriptions. Verify: `go test ./internal/httpapi/davroutes` with one test per scenario of "Push subscriptions".

## 3. Sending

- [x] 3.1 The `dav-push` job in `internal/tenant/jobs.go`: due subscriptions from the DAV view (scope, moves, deletes), merging, 30-second minimum, `Push-Dont-Notify`, encrypted send through `internal/outbound` with VAPID, 404/410 removal, failure tolerance. Verify: `go test ./internal/davpush` against an in-process push service that decrypts and checks the message, one test per scenario of "Push messages".

## 4. Settings, docs, checks

- [x] 4.1 The **Push to calendar apps** toggle under CalDAV in Settings, label in every locale. Verify: `npm test` and `npm run build` in web/, `make i18n-check`.
- [x] 4.2 `docs/caldav.md` (DAVx⁵ with UnifiedPush, what the push service can see), `changelog.d/Added/caldav-push.md`, the row in `ROADMAP.md`. Verify: `make docs`, `make docs-check`, `make openspec-validate`, `go test ./...`, `make check`.
- [ ] 4.3 Real client: DAVx⁵ with a UnifiedPush distributor against a test server; a change in the web app syncs the phone without a poll (the reporter offered to test). Recorded in `docs/caldav-verification.md`.

---

Shipped in 1.6.0; device check moved to the owner's list (the board task "Owner: device checks from shipped changes").
