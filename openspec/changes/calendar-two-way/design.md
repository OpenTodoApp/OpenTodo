# Design

## Context

The server already reads iCalendar (`internal/calfeed`: VEVENT parsing, recurrence expansion, zone resolution), writes tasks as VEVENTs for the task feed (`calfeed.WriteFeed`, with the task selection in `httpapi.feedTasks`), speaks WebDAV XML (`internal/caldav`), polls user-typed hosts on a schedule with per-connection secrets (`internal/issues`), and writes server-made changes through `ApplyStrict` with a reserved device prefix. Calendar sync assembles these into a CalDAV client. It runs on the jobs leader (a self-hosted server's background jobs, a host's shared scheduler).

## Decisions

### D1. One owner switch, shared helper

`calendar_sync.enabled` in the settings table, off by default, read through a cache and never on on a demo instance. Four integrations already carry their own copy of "read the setting through an atomic cache, answer 404 while off, audit the change"; this change adds `ownerSwitch` in `internal/httpapi/switch.go` (key, refusal code and message, cache) with `enabled`, `get`, `put` and `gate`, uses it for calendar sync and moves issue connections onto it as its second user. The other copies can move later; nothing about their behaviour changes. No environment preset: the switch is the owner's.

### D2. Connections and their state

`calsync_connections` (server data: never ops, never exported, not in the op log): id, user, provider (`caldav` | `google`), name, server URL, username, principal and calendar-home URLs, the discovered calendars (JSON: URL, name, colour, time zone, read-only), the target calendar URL, the read calendar URLs (JSON), `include_date_only`, the target's last sync token and CTag, `enabled`, the schedule (`next_sync_at`, `backoff_seconds`), `last_sync_at`, `last_success_at`, `last_error`, `last_error_at`, `stopped_reason`, the last cycle's counts (JSON), timestamps. At most **3** connections per user. A connection without a target calendar is in the state `choose_calendar` and is never synced.

States served to the client: `off` (disabled), `choose_calendar`, `pending` (never synced), `ok`, `failed` (last cycle failed, retrying with backoff), `reconnect` (stopped: credentials refused or Google grant revoked), `stopped` (stopped for another reason: `private_target`, `calendar_missing`).

### D3. Secrets

`<data>/secrets/calendar-sync.json` through `settings.SecretsFile`: one entry per connection id (the CalDAV app password, or the Google refresh token) and the reserved entry `google.client_secret`. The API reports `password_set` only. Deleting a connection removes its entry; an hourly sweep removes entries of connections that no longer exist (an account deleted by cascade), never the reserved one. Google access tokens are kept in memory only, per connection, until 60 seconds before they expire.

### D4. Discovery (RFC 6764, RFC 4791)

Input: a URL, a host name or an email address (the domain is used). Steps, each request through the outbound client:

1. If the URL has no path (or `/`), `PROPFIND {current-user-principal}` on `/.well-known/caldav` first; otherwise on the URL itself. Redirects are followed by hand (PROPFIND must stay PROPFIND), at most 3, and credentials are only sent to the same host or a host under the same parent domain (`caldav.icloud.com` → `p52-caldav.icloud.com`); any other hop is refused with `redirect_refused`.
2. `PROPFIND {calendar-home-set}` on the principal.
3. `PROPFIND Depth: 1` on the home for `resourcetype`, `displayname`, `supported-calendar-component-set`, `current-user-privilege-set`, `calendar-color`, `calendar-timezone`, `getctag`, `sync-token`. Collections that are calendars and support VEVENT (or say nothing, which RFC 4791 reads as "all") are kept; read-only ones (no `write` privilege) can be read but not chosen as the target.

Hrefs in answers may be absolute or relative and are resolved against the request URL. A 401/403 is `unauthorized` (the form says the password was refused). Google uses the same steps from `https://apidata.googleusercontent.com/caldav/v2/` with a bearer token. Discovery runs when a connection is created, when its password is replaced, after a Google reconnect, and on **Sync now**.

### D5. Which tasks are written (push set)

Exactly the task feed's selection (`httpapi.feedTasks`, shared through a `Tasks(ctx, userID)` hook the server installs on the worker): open, visible to the user (own and shared projects, not archived), with a due date from 30 days back to 365 days ahead. Date-only tasks only with `include_date_only`. The event (`calfeed.WriteEvent`, the feed's event code):

- resource `<target>/<task-id>.ics`, `UID:<task-id>` (as in the feed);
- a timed task: `DTSTART`/`DTEND` of its estimate or 30 minutes, with `TZID` and a `VTIMEZONE` for a zoned due, floating for a floating one;
- a date-only task: an all-day event of one day;
- `SUMMARY` the title, `DESCRIPTION` the notes, `URL` the day in the app when `OPENTODO_BASE_URL` is set, `X-OPENTODO-TASK:<task-id>`; no `RRULE` (a recurring task is its next occurrence), no alarms, no categories.

### D6. What was pushed (links)

`calsync_links(connection_id, task_id, href, etag, snapshot, synced_at)`, primary key (connection, task), unique (connection, href). The snapshot is the event in task terms: `{date, time?, tz?, minutes, all_day, title_hash}` (minutes 0 for all-day; `title_hash` the first 16 hex characters of SHA-256 of the written SUMMARY). Comparing in task terms (not raw iCalendar) makes a server's re-serialisation harmless: an event whose ETag changed but whose times and title did not only updates the stored ETag.

### D7. A cycle

Per connection, serialised per connection, at most 2 in flight per server:

1. **Authorize**: the stored password (Basic) or a Google access token (refreshed when needed).
2. **Check the target**: `PROPFIND Depth: 0 {getctag, sync-token, getetag}`; 404 stops the connection with `calendar_missing`.
3. **Pull** when the CTag or sync token changed since the last successful cycle (or on the first cycle):
   - with a sync token stored and the server supporting it: `REPORT sync-collection` (RFC 6578) from it; an invalid token (403/409 `valid-sync-token`) falls back to a listing;
   - otherwise `PROPFIND Depth: 1 {getetag}` on the target (every resource and its ETag); linked hrefs that are missing were deleted.
   - linked events whose ETag differs are fetched with `REPORT calendar-multiget` (in groups of 50) and compared (D8).
4. **Load tasks** again if the pull applied anything.
5. **Push**: for each task in the push set, compare its event in task terms with the link's snapshot; PUT when it differs or when there is no link, DELETE links whose task left the push set. At most 200 writes per cycle; the rest is due again in 20 seconds.
6. **Read calendars**: for the target and each chosen read calendar whose CTag or sync token changed, `REPORT calendar-query` with a time range (the subscription store window) returning `calendar-data`, parsed and expanded by `calfeed`, and stored as the occurrences of a managed subscription (D10). The target's own events written by OpenTodo are left out (they are tasks already).
7. Record success (counts, next cycle in 5 minutes) or failure (D11).

### D8. Conflicts and the pull rules

For a linked event whose content changed (in task terms) since the snapshot:

- If the task's own event also changed since the snapshot (the task's due, estimate or title was edited, or it left the push set), **the newer change wins**: the event's `LAST-MODIFIED` (or, without one, the time the cycle saw it) against the task's last modification time. A task that wins is pushed over the event (step 5, with the new ETag); an event that wins is applied.
- Applying an event: the due becomes the event's start in task terms: an all-day event gives `{date}`; a timed event gives `{date, time}` in the task's zone when the task is zoned, else as wall time in the event's own zone, else in the target calendar's zone (`calendar-timezone`), else UTC; a zoned task keeps its zone. A timed event's length becomes `estimate_minutes` when it differs from the snapshot's. A changed SUMMARY becomes the title (never for an encrypted account, D12). Ops: one per field, ids derived from (connection, task, field, ETag) so a repeated cycle is a duplicate, `ApplyStrict` with device `calsync:<connection-id>`, then `NotifyApplied`.
- A deleted linked event: if the task changed since the snapshot, the task wins and the event is written again; otherwise the task's due becomes `null` (it moves to the Inbox or its project, unscheduled). It is never deleted or completed.
- A refused write (a viewer on a shared project, a server limit) records the event's ETag and snapshot so the next push writes the task's version back over it.
- Events in the target calendar that OpenTodo did not write are never changed and never become tasks.

Last-writer-wins within the op log is unchanged: a device that edited the same field offline and syncs later wins over the calendar's change by its own timestamp, and the next cycle pushes the result.

### D9. Schedule and the debounced trigger

The worker ticks every 15 seconds and runs connections whose `next_sync_at` passed: 5 minutes after a success. The tenant's post-commit observer passes task changes to the worker: when a task's `due`, `estimate_minutes`, `title`, `description`, `completed_at`, `deleted_at`, `project_id` or `recurrence` changed by any device other than `calsync:*`, the connections of every user who can see it (the change's scope) become due in 20 seconds unless they already are sooner. The observer does nothing (no query) while no enabled connection exists on the server, tracked in memory.

### D10. Connected calendars in Day and Week

A row in `calsync_calendars` (subscription, connection, calendar URL; a side table because SQLite cannot add a column idempotently) marks a **managed subscription**: one per chosen calendar (the target and the read calendars), named "<connection> · <calendar>" with the calendar's colour. Managed subscriptions are never listed, counted, fetched or changed by calendar feeds' routes and worker; `calfeed.Store.Success` stores their occurrences (same window and limits); `GET /api/v1/calendar-feeds/events` serves them, and answers while either switch is on (with calendar feeds off it serves only managed subscriptions). Their CTag or sync token is kept in the subscription's `etag` column so unchanged calendars are not fetched again. The web app's calendar views need no change beyond that.

### D11. Errors and backoff

A failed cycle records the reason and its time and waits 5 minutes, doubling up to 6 hours (`backoff_seconds`); a success resets it. Reasons: `unauthorized` (401/403, or Google `invalid_grant`) → stopped, state `reconnect`; `private_target` → stopped; `calendar_missing` → stopped; `timeout`, `connection_failed`, `redirect_refused`, `too_large`, `invalid_response`, `http_<status>`, `rate_limited` (429, honouring `Retry-After`) → retried. A stopped connection is not polled until the user acts (a new password, Reconnect with Google, another target calendar, or Enable). Per-request timeout 20 seconds, response bodies at most 4 MB, a cycle at most 2 minutes.

### D12. End-to-end encryption

The server cannot read an encrypted account's titles, so it writes events titled with `e2ee.Placeholder` ("Encrypted item") and no description, exactly like the task feed, and never applies a SUMMARY change from the calendar. Dates, times and lengths are plaintext in OpenTodo and sync both ways. Refusing encrypted accounts outright was considered; writing placeholders keeps the part people need most (time blocking in their calendar) and leaks nothing the task feed does not.

### D13. Google OAuth

The owner registers an OAuth client of type "Web application" in Google Cloud with the redirect URI `<origin>/api/v1/calendar-sync/google/callback` and enters its id and secret (or sets `OPENTODO_GOOGLE_CLIENT_ID` and `OPENTODO_GOOGLE_CLIENT_SECRET` / `_FILE`, which make the fields read-only). `POST /api/v1/calendar-sync/google/start` (fresh session) stores a state (SHA-256 of 32 random bytes as the key, the PKCE verifier, the user, an optional connection to reconnect, 10 minutes) in `calsync_oauth` and returns Google's authorization URL (`access_type=offline`, `prompt=consent`, `code_challenge_method=S256`). The callback (`GET`, session cookie only, so the state must belong to the signed-in user) exchanges the code at `https://oauth2.googleapis.com/token`, stores the refresh token, creates (or reconnects) the connection, runs discovery and redirects to the panel with `?calendar-sync=connected` or `?calendar-sync=<error>`. The state is single-use. Google's endpoints are fixed and contacted only when the owner configured a client and a user chose Google.

### D14. Routes and policies

| Route | Policy |
| --- | --- |
| `GET /api/v1/settings/calendar-sync` | signed in |
| `PUT /api/v1/settings/calendar-sync` | owner, demo denied |
| `GET /api/v1/settings/calendar-sync/google` | owner |
| `PUT /api/v1/settings/calendar-sync/google` | owner, admin token, demo denied (holds a secret) |
| `GET /api/v1/calendar-sync/connections` | signed in |
| `POST /api/v1/calendar-sync/connections` | signed in, fresh session (carries a password) |
| `PATCH /api/v1/calendar-sync/connections/{id}` | signed in; the handler asks for a fresh session when the body carries a password |
| `DELETE /api/v1/calendar-sync/connections/{id}` | signed in |
| `POST /api/v1/calendar-sync/connections/{id}/sync` | signed in, 12 per hour per user with discovery |
| `POST /api/v1/calendar-sync/google/start` | signed in, fresh session |
| `GET /api/v1/calendar-sync/google/callback` | session only |

Every route is demo denied (`/api/v1/calendar-sync` and `/api/v1/settings/calendar-sync` in the deny list), and every connection route is behind the switch (404 `calendar_sync_disabled`). Read and agent tokens are refused on writes as everywhere.

### D15. Interface budget

One new settings page under Integrations (no new chrome on any list screen, no new task property, no sidebar destination, no new scroll region, no shortcut). Connected calendars' events reuse the existing event chips of Day, Week and Plan.

## Data model impact

New tables `calsync_connections`, `calsync_links`, `calsync_oauth` and the side table `calsync_calendars` (which calendar subscriptions are managed); no op field is added, renamed or removed; tasks change only through ops on existing fields (`due`, `estimate_minutes`, `title`). The device prefix `calsync:` is reserved like `issues:`.

## Size and memory

No dependency. Server binary about +250 KB; web bundle about +6 KB gzipped (the panel, lazily with Settings). Memory: nothing while no connection exists; per cycle in flight one listing (at most 4 MB) and the parsed events.

## Risks

- Google's CalDAV endpoint was exercised only against the in-process test server; the steps follow Google's documented CalDAV API, and the panel reports Google's own errors.
- Servers differ in ETag handling (weak ETags, no ETag on PUT). A missing ETag is stored empty and filled from the next listing; comparing in task terms keeps that from being seen as a change.
- A user who also subscribes the task feed into the same Google account sees tasks twice; the docs say to pick one.
