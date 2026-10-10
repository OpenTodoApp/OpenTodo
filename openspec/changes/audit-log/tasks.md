# Tasks

## 1. Server: recorder and storage

- [x] 1.1 Migration for `audit_events` with indexes; `settings` keys `audit.retention_days` and `audit.log_ip` (create the `settings` table if no earlier change did); verify the store migration test reaches the new `user_version`
- [ ] 1.2 `internal/audit`: event catalogue, typed constructors with allow-listed detail keys, `Record` and `RecordTx`, address policy and user-agent truncation; verify `TestConstructorsNeverCarryEntityFields` (deny-list scan), `TestRecordRespectsAddressPolicy` with `go test ./...`
- [ ] 1.3 Pruner at startup and hourly in batches; address scrubbing when logging is disabled; verify `TestPruneByRetention` and `TestDisablingAddressLoggingScrubs`

## 2. Server: instrumentation

- [ ] 2.1 Record `login.succeeded`, `login.failed` (reason, collapsed to one event per rate-limit window once limited), `logout`, `token.created` and `token.revoked` (in transaction), `export.requested`, `settings.changed`; verify `TestAuthEventsRecorded` and `TestTokenCreationAtomicWithEvent` (injected failure after the token insert leaves neither row)
- [ ] 2.2 Provide constructors for events emitted by `invitations`, `passkeys`, `oidc-login`, `mfa-totp` and `backups`, and wire whichever of those capabilities already exist at merge time; verify each wired path with one test per event name in the owning package

## 3. Server: routes

- [ ] 3.1 Owner-only `GET /api/v1/audit` with filters, cursor pagination and `limit<=200`, `GET /api/v1/audit/export` as newline-delimited JSON recording `audit.exported`, `GET/PUT /api/v1/settings/audit` with bounds; verify `TestAuditRoutesRequireOwner` (401 anonymous, 403 member), `TestAuditFiltersAndCursor`, `TestAuditExportRecordsItself`, `TestAuditSettingsBounds`
- [ ] 3.2 `GET /api/v1/me/activity` bound to the session user; verify `TestActivityShowsOnlyOwnEvents` and that `/api/v1/export` output contains no audit events (`TestUserExportExcludesAudit`)
- [ ] 3.3 `docs/api.md` routes, filters and event catalogue; `SECURITY.md` section "What is logged"; verify documented payloads match handler tests

## 4. Web app

- [ ] 4.1 `web/src/lib/api.ts` functions for list, export URL with filters, settings and activity, with no IndexedDB writes; verify `npm test` passes `api.audit.test.ts` and `npm run build`
- [ ] 4.2 `AuditPanel` (owner): filters, table with load more, export, retention and address-logging controls, offline notice; `ActivityPanel` (everyone) under Security; keyboard reachable; verify component tests for owner/member visibility and offline state in `npm test`, plus a browser run; `npm run build` passes

## 5. Docs and release

- [ ] 5.1 `docs/self-hosting/docker.md` and `coolify.md` notes on retention, address logging behind proxies and disk use; `README.md`; CHANGELOG entry; verify links resolve and `make check` passes
- [ ] 5.2 End-to-end run: failed sign-in → successful sign-in → token created → export requested → owner filters and exports the log → enables addresses, signs in, disables and confirms the scrub → lowers retention and observes pruning; verify the run completes without console errors
