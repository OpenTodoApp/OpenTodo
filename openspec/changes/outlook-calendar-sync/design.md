# Design

## Context

`internal/calsync` runs one cycle per connection on the jobs leader: discover, pull (read the target's changes, turn changes of OpenTodo's events into ops through `ApplyStrict` with device `calsync:<connection-id>`), push (write up to 200 events with `If-None-Match: *` / `If-Match`), then refresh the shown calendars into managed calendar subscriptions. Google is reached through **Google's CalDAV API** with an OAuth bearer token (`google.go`: PKCE, state hashes in `calsync_oauth`, a token cache, refresh tokens in `<data>/secrets/calendar-sync.json` under per-connection keys, the client under the reserved `google.` prefix). So today there is one transport, WebDAV (`dav.go`, `remote.go`), and the cycle (`cycle.go`) calls it directly.

Microsoft has no CalDAV for Outlook.com or Exchange Online. Graph offers, per calendar:
- `GET /me/calendars` (id, name, color, `canEdit`), and events under `/me/calendars/{id}/events`;
- `GET /me/calendars/{id}/calendarView/delta?startDateTime=…&endDateTime=…`, paged with `@odata.nextLink` and ending with `@odata.deltaLink`; removed events come as `@removed`; an expired token answers `410` (`syncStateNotFound`/`resyncRequired`);
- `@odata.etag` on each event and `If-Match` on `PATCH`/`DELETE` (412 on mismatch);
- single-value extended properties (`singleValueExtendedProperties`) to tag and filter events;
- `Prefer: IdType="ImmutableId"` for ids that survive moves; `Prefer: outlook.timezone="…"` for the zone of returned times;
- throttling as `429` (and `503`) with `Retry-After`.

## Goals / Non-Goals

**Goals:**
- Outlook.com and Microsoft 365 behave exactly like a CalDAV or Google connection from the person's point of view: the same card, states, limits, conflict rule, E2EE rule and history label.
- No new op, no mandatory variable, no host contacted before the owner opts in.
- The cycle stays one algorithm; only the transport differs.

**Non-Goals:**
- National clouds, certificate credentials, Microsoft To Do, Exchange on-premises (proposal "Out of scope").

## Decisions

**D1. A transport interface under the cycle, with WebDAV and Graph behind it.** The cycle needs six things from a calendar: its version (has anything changed?), the changes since a cursor, a fetch of named events, a window query for shown calendars, a conditional create/replace, and a conditional delete. These become one small interface in `internal/calsync`; `DAV` implements it as today (CalDAV and Google), `Graph` implements it on Graph. The pull/push order, the 200-write cap, conflict resolution, snapshots and ops stay in `cycle.go` untouched. Rejected: a separate `calsync/microsoft` cycle (two conflict implementations drifting apart); converting Graph events to iCalendar and feeding the existing parser (lossy for time zones and needs a VTIMEZONE generator).

**D2. Owner-configured Microsoft client, mirroring Google.** `PUT /api/v1/settings/calendar-sync/microsoft` stores `client_id`, `tenant` and the secret (under the reserved `microsoft.` prefix in `calendar-sync.json`); `GET` reports `client_id`, `tenant`, `secret_set`, `from_env` and the `redirect_uri` to register (`<base URL>/api/v1/calendar-sync/microsoft/callback`). `OPENTODO_MICROSOFT_CLIENT_ID`, `OPENTODO_MICROSOFT_CLIENT_SECRET` or `OPENTODO_MICROSOFT_CLIENT_SECRET_FILE`, and `OPENTODO_MICROSOFT_TENANT` are optional and, when set, win and make the fields read-only (409 `managed_by_environment`), as the Google ones do. The tenant is `common` by default (personal and work accounts), and may be `organizations`, `consumers` or a tenant GUID or verified domain, validated by shape. The docs walk the owner through an Entra ID app registration: "Accounts in any organizational directory and personal Microsoft accounts" for `common`, a **Web** platform redirect URI, delegated permissions `offline_access`, `User.Read`, `Calendars.ReadWrite` and `MailboxSettings.Read`, and a client secret with its expiry date noted.

**D3. Connecting: authorization code with PKCE and the existing state table.** `POST /api/v1/calendar-sync/microsoft/start` (fresh session) creates a state row in `calsync_oauth` (the table is provider-neutral: it gains nothing but a `provider` value inside the state hash input, so a Google callback cannot consume a Microsoft state) and returns `https://login.microsoftonline.com/<tenant>/oauth2/v2.0/authorize` with `response_type=code`, the scopes above, `prompt=select_account`, the state and the S256 challenge. The callback accepts only the session the state belongs to, exchanges the code at `…/oauth2/v2.0/token`, reads `GET /me` for the account name (`userPrincipalName` or `mail`) and `GET /me/mailboxSettings/timeZone`, lists the calendars, stores the refresh token and lands on the panel. Microsoft's `error` parameter maps to the panel's reasons: `access_denied` → `denied`; `consent_required`, `interaction_required` or an AADSTS code for admin approval (`AADSTS65001`, `AADSTS90094`) → `admin_consent_required`, with a sentence telling a work user that their administrator must approve the app; anything else → `authorization_failed`.

**D4. Refresh tokens rotate.** Microsoft returns a new refresh token on each refresh; the server SHALL store it before using the access token, so a crash between the two cannot lose the grant (write secret, then cache access token). `invalid_grant` (revoked, password reset with token revocation, 90 days unused) stops the connection in `reconnect`, as a revoked Google grant does. `invalid_client` (`AADSTS7000215` wrong secret, `AADSTS7000222` expired secret) is not the person's fault: every Microsoft connection stops with the reason `microsoft_client_refused`, the owner's Microsoft client form shows "Microsoft refused the client secret; it may have expired", and saving a new secret clears that stop on all of them and schedules a cycle. Access tokens are cached in memory only, per connection, until 60 seconds before expiry.

**D5. Owning events: an extended property, immutable ids and a transaction id.** Each event OpenTodo creates carries a single-value extended property `String {6f1c1c9e-2c8b-4d0e-9a51-6f70656e746f} Name opentodoTaskId` = the task id (the GUID is fixed in code and documented), and a `transactionId` equal to `opentodo-<connection-id>-<task-id>` so a retried create after a lost response does not make a duplicate. All requests send `Prefer: IdType="ImmutableId"`; the link stores the immutable event id as `href` and `@odata.etag` as `etag`. Pulling expands the property (`$expand=singleValueExtendedProperties($filter=id eq '…')`) and only events carrying it are linked to tasks; every other event is never changed and never becomes a task (spec "Calendar changes come back to the task"). Rejected: matching by subject or a marker in the body (users edit both).

**D6. Changes: `calendarView/delta` per calendar over the sync window.** The target calendar and each shown calendar have a cursor in a new side table `calsync_cursors(connection_id, calendar_id, delta_link, window_from, window_to, updated_at)`. A cycle follows `@odata.nextLink` pages to the `@odata.deltaLink`, applies `@removed` as deletions, and stores the new delta link. Because `calendarView/delta` is bound to its window, the cursor is re-based (a fresh delta without a token) when the sync window (30 days back to 365 ahead) has moved by a day, and on `410`; a re-base is a full listing compared with the links' ETags, the same fallback CalDAV uses without `sync-collection`. The target's "has it changed" check is the delta call itself (an empty page is "no change"). Rejected: `/me/events/delta` without a window (not available on v1.0 for events) and subscriptions/webhooks for change notifications (need a public HTTPS endpoint reachable from Microsoft, which a home server often is not, and a renewal job; the 5-minute cycle is the same cadence as CalDAV).

**D7. Writes.** Create: `POST /me/calendars/{id}/events` with the extended property and `transactionId`. Replace: `PATCH /me/events/{id}` with `If-Match: <etag>`. Delete: `DELETE /me/events/{id}` with `If-Match`. A `412` is a concurrent change: the event is re-read and handled by the conflict rule on the next cycle (as a CalDAV `412` is today). `404` on update or delete means the event is gone (the person deleted it): the link is removed and the task left without a due date per the existing rule. Bodies are plain text (`contentType: text`) with the task's notes; for an encrypted account the subject is "Encrypted item" and the body empty. No `$batch`: 200 writes per cycle per mailbox is far below Graph's per-mailbox limits, and one request per change keeps errors per event.

**D8. Time zones.** A zoned task (due 09:00 Europe/Berlin) is written with `start.timeZone` set to the IANA name when Graph accepts it and otherwise to the Windows name from the embedded CLDR `windowsZones` table; returned times are requested in that zone with `Prefer: outlook.timezone`. Graph has no floating time, so a floating task is written in the **mailbox's time zone** read at discovery (`MailboxSettings.Read`) and refreshed on every discovery; reading back, a floating task's event is interpreted in the same zone, so its wall-clock time round-trips. An all-day task is `isAllDay: true` from midnight to the next midnight in the mailbox zone. When the mailbox zone is unknown or unmappable, `UTC` is used and the connection card says "Times in UTC: set your Outlook time zone". Recurring tasks are written as their next occurrence; a recurring Outlook series is never created.

**D9. Throttling and errors.** `429` and `503` honour `Retry-After` (seconds) as the minimum wait, recorded as the existing `rate_limited` reason with the doubling backoff from 5 minutes to 6 hours; a cycle stops at the first throttling answer and keeps what it did. Requests time out after 20 seconds and read at most 4 MB per response, as for CalDAV. Graph `401` after a successful refresh (the grant lost the calendar permission) stops the connection in `reconnect`. `403 ErrorAccessDenied` on the target (a calendar the user can no longer edit) stops it with `calendar_missing`'s sibling `calendar_read_only`. The target calendar's `404` stops it with `calendar_missing`.

**D10. Outbound.** Every Graph and token request goes through `internal/outbound` with redirects refused and the fixed hosts `login.microsoftonline.com` and `graph.microsoft.com` (both public, so the private-network rule never applies). Nothing is contacted while the owner switch is off, while no Microsoft client is complete, or for a user with no Microsoft connection. The list "What the server contacts" in `docs/calendar-sync.md` and AGENTS rule 5's "calendar subscriptions" sentence already cover "calendar sync"; the docs gain the two hosts by name.

**D11. Routes and policies.**
- `GET /api/v1/settings/calendar-sync/microsoft`: `ownerOnly("manage the Microsoft client of calendar sync").DemoDenied()`.
- `PUT /api/v1/settings/calendar-sync/microsoft`: the same `.Credential().DemoDenied()` (owner's session or an admin token; a full token gets `insufficient_scope`), audited as `settings.changed` for `calendar_sync.microsoft_client` without values.
- `POST /api/v1/calendar-sync/microsoft/start`: `signedIn.Recent().DemoDenied()`, behind the owner switch gate (404 `calendar_sync_disabled`), 409 `microsoft_not_configured` without a client, the shared limit of 12 discoveries per user per hour.
- `GET /api/v1/calendar-sync/microsoft/callback`: `signedIn.SessionOnly().DemoDenied()`.
The demo deny list in `internal/httpapi/demo.go` already holds both prefixes; the policy test checks the declarations agree. Read and agent tokens keep `GET` only on `/api/v1/calendar-sync`.

**D12. Screen and progressive disclosure.** Nothing changes for people whose owner never turned calendar sync on. In Settings → Integrations → Calendar sync the owner sees a "Microsoft client" disclosure below "Google client" (client id, tenant, secret, redirect URI to copy, a link to the guide); people see "Connect Microsoft" beside "Connect Google" only when a Microsoft client is complete. The connection card is the existing one with the Microsoft account's address. At 360 px the add-connection choices stack as three full-width buttons. No new shortcut, no new sidebar destination, no list chrome.

## Data model

- No op, no op field.
- `calsync_connections.provider` gains `microsoft`; `server_url` holds `https://graph.microsoft.com/v1.0`, `username` the account's address, `target_url` and `read_urls` hold calendar ids, `calendars[].time_zone` the mailbox zone.
- New side table `calsync_cursors` (migration `NNNN_calsync_cursors.sql`, `CREATE TABLE IF NOT EXISTS`), deleted with its connection. CalDAV and Google keep using `sync_token`/`ctag`.
- Secrets: `microsoft.client_secret`, and the per-connection refresh token under the existing per-connection key.

## Size and runtime

No new dependency. About +60 KB of binary (Graph transport, the zone table). Memory per cycle unchanged (4 MB response cap, at most two cycles at a time).

## Risks / Trade-offs

- **Work tenants that forbid user consent** cannot connect until an administrator approves; the error says so (D3).
- **Client secrets expire** (at most 24 months in Entra ID); D4 makes it one visible owner action instead of silent failures.
- **Delta re-basing daily** costs one full listing per calendar per day; with at most 11 calendars per connection and 3 connections per person this stays small.
- **IANA names in Graph** are accepted for most zones but not guaranteed; the embedded mapping is the fallback and has a test over every zone the date picker offers.
