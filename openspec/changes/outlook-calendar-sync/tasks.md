# Tasks

Backend tasks are verified with `go test ./...`; frontend tasks with `npm test` and `npm run build` in `web/`. Graph is never called from tests: a new in-process fake, `internal/calsync/graphtest`, serves calendars, `calendarView/delta`, ETags, extended properties, `transactionId`, 412, 410, 429 and the token endpoint. `make check` runs before the last task is ticked.

## 1. Transport seam

- [ ] 1.1 Extract the transport interface the cycle uses (version/changes since a cursor, fetch, window query, conditional put, conditional delete) and make `DAV` implement it without behaviour change (design D1). Verified by the existing `cycle_test.go`, `more_test.go` and `fuzz_test.go` passing unchanged against `calsynctest`.

## 2. Owner client and settings

- [ ] 2.1 `MicrosoftConfig` beside `GoogleConfig`: client id, tenant (validated: `common`, `organizations`, `consumers`, GUID, domain), secret under `microsoft.` in `calendar-sync.json` (reserved prefix), environment overrides `OPENTODO_MICROSOFT_CLIENT_ID`, `OPENTODO_MICROSOFT_CLIENT_SECRET`, `OPENTODO_MICROSOFT_CLIENT_SECRET_FILE`, `OPENTODO_MICROSOFT_TENANT` in `internal/config` (all optional). Verified by `internal/config` tests mirroring `google_test.go` and secrets tests (never returned, swept with the connection).
- [ ] 2.2 Routes `GET`/`PUT /api/v1/settings/calendar-sync/microsoft` with `ownerOnly(...).DemoDenied()` and `.Credential()` on PUT; audit `settings.changed` for `calendar_sync.microsoft_client` without values; `GET /api/v1/settings/calendar-sync` reports `microsoft`. Verified by httpapi tests: 401 anonymous, 403 member, 403 `insufficient_scope` full token, 400 tenant, 409 `managed_by_environment`, 403 `demo_restricted`; by `policy_test.go` (demo list agrees) and `route_matrix_test.go` with the new rows.

## 3. Connecting

- [ ] 3.1 `POST /api/v1/calendar-sync/microsoft/start` (`signedIn.Recent().DemoDenied()`, owner-switch gate, 409 `microsoft_not_configured`, shared discovery limit) and `GET /api/v1/calendar-sync/microsoft/callback` (`signedIn.SessionOnly().DemoDenied()`), state bound to user and provider in `calsync_oauth`, PKCE S256, code exchange, `/me`, `/me/mailboxSettings/timeZone`, `/me/calendars`. Verified by httpapi tests against `graphtest`: connect, reconnect, wrong/expired/Google state, 401, 403 `reauth_required`, `limit_reached`, `denied`, `admin_consent_required` (AADSTS65001, AADSTS90094), `authorization_failed`.
- [ ] 3.2 Refresh-token rotation stored before use; in-memory access-token cache; `invalid_grant` → `reconnect`; `invalid_client` → `microsoft_client_refused` on every Microsoft connection, cleared by saving a new secret. Verified by unit tests with a token endpoint that rotates, revokes and refuses the client.

## 4. Graph transport and cycle

- [ ] 4.1 `Graph` transport: `calendarView/delta` paging to the delta link, `@removed`, cursor table `calsync_cursors` (migration `NNNN_calsync_cursors.sql`), re-base on window move and on 410. Verified by `graphtest` cycle tests (changed event, removed event, window moved, 410 rebuild without duplicates) and the migration test (`PRAGMA user_version`, idempotent create).
- [ ] 4.2 Writes: create with the extended property and `transactionId`, `Prefer: IdType="ImmutableId"`, PATCH/DELETE with `If-Match`, 412 left to the next cycle, 404 as a deleted event. Verified by `graphtest` tests (retried create makes one event, 412 not forced, other events never touched).
- [ ] 4.3 Time zones: IANA first, Windows name from an embedded CLDR `windowsZones` table, floating and all-day tasks in the mailbox zone, UTC fallback with the card note. Verified by a table test over every zone the date picker offers, and round-trip tests for zoned, floating and all-day tasks.
- [ ] 4.4 Encrypted accounts: "Encrypted item", no body, renamed event not applied. Verified by a cycle test with an E2EE account.
- [ ] 4.5 Throttling: 429/503 `Retry-After` honoured as the minimum wait, partial cycle kept, `rate_limited`; `calendar_missing` and `calendar_read_only` stops. Verified by `graphtest` tests.
- [ ] 4.6 All Graph and token requests through `internal/outbound`, redirects refused, 20 s timeout, 4 MB cap; no Microsoft request while the switch is off or no client is complete. Verified by a test with a recording dialer.

## 5. Web

- [ ] 5.1 Settings → Integrations → Calendar sync: Microsoft client fields for the owner (client id, tenant, secret, redirect URI copy, last refusal), "Connect Microsoft" when available, panel messages for the callback reasons; stacked add buttons at 360 px. Verified by happy-dom tests and stories at 360 and 1280 px, `make ui-check`.
- [ ] 5.2 Strings in the six languages (`web/src/locales/*.json`). Verified by `make i18n-check`.

## 6. Docs and changelog

- [ ] 6.1 `docs/calendar-sync.md`: replace "Outlook" with "Connect Microsoft Outlook" and "Set up the Microsoft client (server owner)" (Entra ID app registration, account types per tenant, Web redirect URI, delegated permissions, secret expiry), the two hosts in "What the server contacts", reasons on the card. Verified by `npm run docs:check`.
- [ ] 6.2 `docs/api.md` Calendar sync section: the four routes, `microsoft` in the settings answer and `provider`, the new reasons (`microsoft_not_configured`, `microsoft_client_refused`, `calendar_read_only`, `admin_consent_required`). Verified by `npm run docs:check`.
- [ ] 6.3 `docs/self-hosting` environment variable table gains the four optional `OPENTODO_MICROSOFT_*` variables. Verified by the config docs test.
- [ ] 6.4 CHANGELOG entry under Unreleased. Verified by `make check`.
