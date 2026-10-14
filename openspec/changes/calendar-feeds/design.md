# Design: calendar feeds

## Context

See proposal.md (Why). What exists and shapes the approach:

- **Outbound requests already have a policy.** `internal/webhook/ssrf.go` holds `ValidateURL` (scheme, host, 2,048 characters), `IsDenied` (loopback, private, link-local, CGNAT, NAT64, 6to4, metadata…), a `Dialer` that resolves the host itself, filters the addresses and dials the one it checked, and `NewClient` (no proxy from the environment, no redirects, 10 s timeout). The owner's "allow private network targets" lives in the settings table as `webhooks_allow_private` (`internal/webhook/service.go:29`, `AllowPrivate`), preset by `OPENTODO_WEBHOOKS_ALLOW_PRIVATE` on first start.
- **Background work runs under one leader.** `cmd/opentodo/main.go:197-226` starts the audit pruner, backups, push, email polling, Trash retention and the webhook worker inside `runJobsWhenLeader` (`internal/store.LockJobs`), and skips outbound work on a demo instance. The webhook worker (`internal/webhook/worker.go`) polls a `next_attempt_at` column every second and processes due rows with bounded concurrency.
- **Per-user secrets have a pattern.** App passwords (`internal/auth/apppasswords.go`): `otap_` + `ids.Secret(32)`, stored as `hashToken`, shown once, `requireFresh` on creation, `last_used_at`, revoked on deactivation, audited. Failed CalDAV sign-ins share a per-address limiter (`davLimiter`, 10/min; `internal/httpapi/server.go:88-91`).
- **An owner switch has a pattern.** CalDAV: settings key `caldav.enabled`, cached in an atomic (`internal/httpapi/caldav.go:19-80`), `OPENTODO_CALDAV` seeded with `INSERT OR IGNORE` on first start, `GET` for everyone and `PUT` for the owner recorded as `settings.changed`, 404 for the endpoint while off.
- **iCalendar code exists for VTODO.** `internal/caldav/ical.go` tokenises and serialises (`Parse`, `Unfold`, `ParseLine`, `Component.Encode`, folding at 75 octets) with limits of 1 MB and 5,000 properties per resource; `vtodo.go` maps tasks to VTODO, renders `DUE`/`DTSTART` as DATE, floating or `TZID` values with a `VTIMEZONE` (`vtimezone`, line 519), and `recurrence.Rule.RRULE()` renders the app's rules. There is no VEVENT reading or RRULE expansion anywhere: `internal/recurrence` only computes the next due of the app's own grammar.
- **The server reads a user's visible tasks** through `sync.List(ctx, uid, "task", false)` plus `Memberships` and `List(... "project")`, as the CalDAV view loader does (`internal/httpapi/caldav_dav.go:180-230`).
- **Cached server data on devices has a pattern.** Memberships and notifications are server data adopted after a sync exchange, never ops (`web/src/lib/sync.ts:169,194`, `web/src/lib/notifications.ts`), kept in Dexie tables declared with each version bump (`web/src/lib/db.ts`). The live channel sends only `event: ops` lines, with `{}` for a membership change (`internal/httpapi/events.go:60-75`).
- **The grid is a pure projection.** `calendarTasks` and `blockFor` (`web/src/lib/calendar.ts:98-110`) turn tasks into `Block`s; `layoutDay` (`web/src/lib/layout.ts`) lays any `{id, start, end}` list out side by side with an overflow marker; `CalendarView.tsx:99-110` builds each day's lane, blocks and layout, and `DayColumn` draws blocks with `data-overlap`. Grid preferences are per device in Dexie `meta` (`GRID_PREFS_META_KEY`). Zoned dues are viewed through `viewedTask`/`localDueOf` (`web/src/lib/dates.ts:171,255`).
- **Encryption** lists content fields in `internal/e2ee.ContentFields` and shows `e2ee.Placeholder` ("Encrypted item") where server-built text would otherwise show ciphertext.

## Goals / Non-Goals

**Goals:**
- Reuse the webhook outbound policy verbatim rather than a second SSRF guard.
- Keep every piece of new state out of the op log and bounded: at most 10 subscriptions, 2 MB per fetch, 5,000 occurrences per subscription, 92 days per events request.
- A feed that Google Calendar, Outlook and Apple Calendar accept as is (`VEVENT`, `METHOD:PUBLISH`, calendar name, folded lines, `VTIMEZONE` for zoned times).
- Degrade honestly for encrypted accounts and refuse everything on the demo.

**Non-Goals:**
- A complete RFC 5545 recurrence engine. The expander covers what Google, Outlook, iCloud and Nextcloud emit for everyday calendars; the rest yields one occurrence and a warning.
- Interpreting `VTIMEZONE` definitions. Zones resolve by name (IANA, then Windows); the definitions in the feed are ignored.
- Showing events anywhere but Day and Week, or counting them toward capacity.

## Decisions

### D1. One capability, one owner switch, one panel

`calendar-feeds` owns both halves. A single owner switch (`calendar_feeds.enabled`, default off, `OPENTODO_CALENDAR_FEEDS=true` preset on first start, seeded and cached exactly like `caldav.enabled`) enables subscriptions and the task feed together.

- **Alternative: two capabilities (`external-calendars`, `task-feed`).** Rejected: both need the owner switch, the demo refusal, the iCalendar module, the Settings panel and the encryption rules, and each alone would be small. A split later is a rename of requirements, not a redesign.
- **Alternative: subscriptions on by default like webhooks, only the feed behind a switch.** Rejected: the roadmap row says "operator-allowed" for the URLs, and a server that quietly starts polling third-party hosts on behalf of any member is what an operator least expects. The switch body is `{enabled}` only; splitting it into two booleans later is additive.

### D2. The SSRF guard moves to `internal/outbound`

`ssrf.go` and `ssrf_test.go` move to a new package `internal/outbound` (`ValidateURL`, `IsDenied`, `Dialer`, `NewClient(d, timeout)`, `MaxURLLength`, `ErrPrivateTarget`, `ErrBadURL`). `internal/webhook` keeps `var ValidateURL = outbound.ValidateURL` and friends so its tests and `internal/httpapi/webhooks.go` do not change. The `AllowPrivate` callback keeps reading `webhooks_allow_private` through the webhook service; the calendar fetcher receives the same function, so the owner's toggle governs both (spec `webhooks`, "Private network policy shared with calendar subscriptions").

The fetch client differs from the delivery client in three parameters, all arguments of `NewClient`: a 20 s timeout, a redirect policy that allows three hops and runs `ValidateURL` on each (the dialer still checks every address, so a hop to a private address fails as `private_target` before connecting), and transparent gzip (the transport's default). The body is read through `io.LimitReader(2 MB + 1)`; one byte over is `too_large`.

- **Alternative: `internal/calfeed` imports `internal/webhook` for the dialer.** Rejected: a calendar package depending on the webhook package for an HTTP dialer is the wrong direction, and `NewClient` hard-codes the delivery timeout.
- **Alternative: refuse redirects like deliveries.** Rejected: `http`→`https` upgrades and provider path changes are common for published calendars, and re-checking each hop keeps the guarantee that no connection goes to an unchecked address.

### D3. Package `internal/calfeed`

- `vevent.go`: `ParseCalendar(data []byte, limits)` on top of `caldav.Parse` with raised limits (2 MB, 200,000 properties; the caldav defaults stay for CalDAV resources), reading `VEVENT`s into a typed `Event` (uid, recurrence-id, summary, location, dtstart, dtend or duration, all-day, rrule, rdate, exdate, status, transp, sequence) and the calendar's `X-WR-CALNAME`, `X-WR-TIMEZONE`, `REFRESH-INTERVAL` and `X-PUBLISHED-TTL`.
- `expand.go`: `Expand(events, window, cap) ([]Occurrence, Warnings)`. Groups by UID, applies overrides by `RECURRENCE-ID` (`RANGE=THISANDFUTURE` treated as one override plus a warning), expands `RRULE` for `FREQ=DAILY|WEEKLY|MONTHLY|YEARLY` with `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY` (with ordinals), `BYMONTHDAY`, `BYMONTH`, `BYSETPOS`, `WKST`, adds `RDATE`, removes `EXDATE`, drops `STATUS:CANCELLED`, clips to the window and the cap. Anything else (`BYHOUR`, `BYMINUTE`, `BYSECOND`, `BYYEARDAY`, `BYWEEKNO`, `FREQ=HOURLY` and below) returns the first occurrence and a warning. Stdlib only; the expander iterates calendar days with `time.Time` in the event's location, so DST is right by construction.
- `zones.go`: `Resolve(tzid string) (*time.Location, bool)`: `zoned.Load` for IANA names and vendor paths (the `ianaZone` rule from `internal/caldav/vtodo.go:452`), then a Windows-to-IANA table generated from CLDR `windowsZones.xml` (about 140 territory-001 entries, 6 kB). CalDAV keeps its own fallback and is not changed here; a later change may adopt the table.
- `fetch.go`: `Fetcher` with the outbound client, conditional headers (`If-None-Match`, `If-Modified-Since` from the stored `etag` and `last_modified`), `Accept: text/calendar`, `User-Agent: OpenTodo/<version>`. A fetch returns one of: unchanged, replaced (with occurrences and metadata), or failed with a reason (`private_target`, `too_many_redirects`, `timeout`, `http_<code>`, `too_large`, `invalid_calendar`, `connection_failed`).
- `store.go`: the three tables below; `Replace(subscriptionID, occurrences)` deletes and inserts in one transaction; `Events(userID, from, to)`; `Due(now)` for the worker; `Backoff`.
- `worker.go`: `Run(ctx)` polls every 30 s for subscriptions with `next_fetch_at <= now` (enabled, not stopped, feature on), fetches at most two at a time, records the result, and calls `Notifier.NotifyCalendar(userID)` when the stored occurrences changed. Runs under the jobs leader; skipped entirely on a demo instance, like the webhook worker.
- `feed.go`: `WriteFeed(w, tasks, projects, now, opts)` renders the task feed (D6).

Size: parser and expander about 700 lines with tests; the package about 1,100 lines total.

### D4. Data model: three tables, nothing in the op log

Migration (the next free number):

| table | columns |
| --- | --- |
| `calendar_subscriptions` | `id`, `user_id REFERENCES users ON DELETE CASCADE`, `url`, `name`, `color`, `enabled`, `etag`, `last_modified`, `refresh_seconds` (from the calendar's hint, nullable), `interval_seconds` (current, after backoff), `next_fetch_at`, `last_fetch_at`, `last_success_at`, `last_error`, `stopped_reason` (`private_target` or null), `warnings` (JSON: unsupported rules, zone fallbacks, truncated), `event_count`, `created_at`, `updated_at` |
| `calendar_events` | `subscription_id REFERENCES calendar_subscriptions ON DELETE CASCADE`, `uid`, `instance` (the `RECURRENCE-ID` or occurrence start as text; `(subscription_id, uid, instance)` primary key), `summary`, `location`, `start_date`, `start_time`, `start_tz`, `end_date`, `end_time`, `end_tz`, `all_day`, `free`, `start_ms`, `end_ms` (UTC instants for range queries; floating times are indexed as if UTC and the query pads the range by one day each side, then the exact overlap is decided in Go) with an index on `(subscription_id, start_ms)` |
| `calendar_feed_tokens` | `user_id PRIMARY KEY REFERENCES users ON DELETE CASCADE`, `hash` (SHA-256 of the secret, unique), `created_at`, `last_used_at` |

No op field, no entity in `Schema`, nothing in `e2ee.ContentFields`, nothing in the export. Offline behaviour and convergence of tasks are untouched. Subscription URLs are stored in plaintext because the server needs them to fetch, as webhook secrets are; they are never logged (the request logger sees only the subscription id, and the fetch log line prints the host, not the path) and never audited.

### D5. Routes

| Method | Route | Auth | Purpose |
| --- | --- | --- | --- |
| `GET`/`PUT` | `/api/v1/settings/calendar-feeds` | any signed-in / owner | `{enabled}`; `PUT` records `settings.changed` for `calendar_feeds.enabled` |
| `GET` | `/api/v1/calendar-feeds/subscriptions` | session or token | `{subscriptions: [...]}` with status fields |
| `POST` | `/api/v1/calendar-feeds/subscriptions` | session or full token | `{url, name?, color?}` → policy check, store, one inline fetch (bounded by the 20 s timeout), 201 with the subscription and its status |
| `PATCH` | `/api/v1/calendar-feeds/subscriptions/{id}` | session or full token | `{url?, name?, color?, enabled?}`; a URL change re-runs the check and an inline fetch; `enabled: true` clears `stopped_reason` |
| `DELETE` | `/api/v1/calendar-feeds/subscriptions/{id}` | session or full token | 204, cascades the events |
| `POST` | `/api/v1/calendar-feeds/subscriptions/{id}/refresh` | session or full token | inline fetch, 200 with the subscription |
| `GET` | `/api/v1/calendar-feeds/events?from&to` | session or token | `{events: [...], subscriptions: [{id, name, color, lastSuccessAt}]}` |
| `GET` | `/api/v1/calendar-feeds/feed` | session or token | `{feed: {createdAt, lastUsedAt} \| null}` |
| `POST` | `/api/v1/calendar-feeds/feed` | session or full token, `requireFresh` | create or rotate; 201 `{feed, url}`, the only time the URL is returned |
| `DELETE` | `/api/v1/calendar-feeds/feed` | session or full token | 204, 404 when none |
| `GET` | `/feeds/{secret}/tasks.ics` | the secret only | `text/calendar`; `ETag`, `Cache-Control: private, max-age=900` |

All `/api/v1/calendar-feeds` handlers first check the owner switch (404 `not_found` with message "calendar feeds are not enabled" while off; the `code` is `feeds_disabled` so the panel can say why). `requireAuth` already refuses `read` and `agent` tokens on writes. Hand-triggered fetches (create, URL change, refresh) share a per-user limiter of 12 per hour (`429 rate_limited`). Literal patterns are registered before `{collection}` routes like the other feature routes in `server.go:223-260`; `/feeds/` is registered on the mux before the SPA fallback, like `/dav/`.

An event in the response: `{id, subscriptionId, uid, summary, location, start: {date, time?, tz?}, end: {date, time?, tz?}, allDay, free}`. Reusing the due shape lets the client convert with `localDueOf` and the server with `internal/zoned`; `tz: "UTC"` carries `Z` times.

### D6. The feed emits `VEVENT`

Calendar apps that subscribe to a URL ("From URL" in Google Calendar, "Subscribe from web" in Outlook, "New Calendar Subscription" in Apple Calendar) import `VEVENT` components and ignore `VTODO` (Google and Outlook have no task list to put them in; Apple would route VTODO to Reminders only over CalDAV). The purpose of the feed is to make tasks visible on a calendar grid, which is an event. So:

- `VCALENDAR` with `VERSION:2.0`, `PRODID` (the CalDAV one), `CALSCALE:GREGORIAN`, `METHOD:PUBLISH`, `X-WR-CALNAME:OpenTodo` (`X-WR-CALNAME:OpenTodo (<account name>)` would leak the name into shared calendar lists; plain "OpenTodo" is enough), `X-PUBLISHED-TTL:PT15M` and `REFRESH-INTERVAL;VALUE=DURATION:PT15M` as hints.
- One `VEVENT` per task from `sync.List(uid, "task")` filtered like the CalDAV view (not deleted, not completed, project not archived or deleted, visible through ownership or membership), with a due date in `[today-30d, today+365d]`: `UID:<task id>`, `DTSTAMP` and `LAST-MODIFIED` from `sync.Modified`, `SUMMARY`, `DESCRIPTION` when non-empty, `DTSTART`/`DTEND` from `dueProp` (date-only: `VALUE=DATE` with `DTEND` the next day; timed: `DTEND = DTSTART + estimate_minutes` or 30 minutes; zoned: `TZID` plus the `vtimezone` component once per zone), `RRULE` from `recurrence.Parse(...).RRULE()`, `CATEGORIES` from label names, `X-OPENTODO-PRIORITY` for the priority, `URL:<base>/day/<date>` when `OPENTODO_BASE_URL` is set (no per-task route exists). `ical_extra` is VTODO data and is not emitted.
- `ETag: W/"<generation>-<cursor>-<today>"` from `sync.Cursor` and the op-log generation; `If-None-Match` matching answers 304. The window moves with the day, hence the date in the tag.
- Encrypted account (`encryptionStatus(...).Enabled`): `SUMMARY` is `e2ee.Placeholder`, `DESCRIPTION` and `CATEGORIES` are omitted (label names are ciphertext too); everything else is unchanged.

- **Alternative: `VTODO`, reusing `caldav.Encode`.** Rejected for the reason above: the apps the roadmap names would show nothing.
- **Alternative: a feed per project or a filter.** Deferred; `GET /feeds/{secret}/tasks.ics` leaves room for `/feeds/{secret}/projects/<id>.ics` later.

### D7. The feed secret is its own credential

`otfeed_` + `ids.Secret(32)`, stored as `hashToken` (SHA-256) in `calendar_feed_tokens`, one row per user (create replaces the row, so rotation is `INSERT OR REPLACE` in the same transaction as the audit event). Lookup by hash, then `subtle.ConstantTimeCompare` on the stored hash, then the account's active status (the `user_status` join from `UserByAppPassword`). `UserByToken` and `UserByAppPassword` never see it because of the prefix, and the feed handler reads nothing but the path. Unknown secrets count on a per-address limiter (the `davLimiter` is reused: same policy, same window); valid feeds count on a per-token limiter of 60 per hour. A hit updates `last_used_at` best-effort, like app passwords.

- **Alternative: store the secret so Settings can show the URL again.** Rejected: it is a credential; a user who needs the URL again rotates, as for app passwords and API tokens. The panel says so when it shows the URL.
- **Alternative: a signed URL with an expiry.** Rejected: calendar apps store the URL once and poll for years; expiry means silent breakage.

### D8. Devices: cache tables, a live signal, a pure grid projection

- Dexie gets the next free version with `calendarEvents: 'id, subscriptionId, startDate'` and `calendarSubscriptions: 'id'`, both server data adopted on refresh, never written as ops, cleared at sign-out with the rest. Two `meta` keys: `calendar.events.window` (`{from, to, fetchedAt}`) and `calendar.showEvents` (the toolbar toggle, default true).
- `web/src/lib/calendarFeeds.ts`: `refreshEvents(range, {force})` fetches `max(range ± 28 days)` when the visible range is outside the cached window or the cache is older than 10 minutes, replaces the tables in one transaction and stores the window; `ensureEventsFor(range)` is called by `CalendarView` on mount and on navigation; the sync loop calls `refreshEvents` on reconnect and on a `calendar` live event. All failures are swallowed like `refreshNotifications` (offline, an older server, the feature off).
- Live channel: `Notifier` gains a second signal kind; the SSE handler writes `event: calendar\ndata: {}\n\n` for it, and `sync.ts` adds a listener next to `ops`. Older clients ignore unknown event names.
- Grid: `calendar.ts` gains `eventBlocks(events, date, zone): EventBlock[]` (timed occurrences clipped to the day in the viewer's zone, floating ones taken as wall time) and `allDayEvents(events, date)`; `CalendarView.tsx` feeds task and event blocks together into `layoutDay`, so lanes and the marker work unchanged, and draws event blocks with `data-event` in the subscription's colour (palette hue through `hueFor`, outline only for `free`). Event blocks are `button`s with an `aria-label` ("Team sync, 10:00 to 11:00, Work calendar"), excluded from `order` (the `j`/`k` task selection and arrow moves), not registered as drop targets, and open a read-only `Popover` on Enter. The all-day strip is a row under the day header, above the unscheduled lane. Capacity (`dayLoad`) is unchanged: it never sees events. The toolbar gets a "Calendars" toggle button (`aria-pressed`) and a status text ("Calendars as of 09:40" when offline or the cache is older than 10 minutes, "Calendars unavailable offline for these days" when the visible range is outside the cached window).

- **Alternative: ship the events as ops in a personal entity.** Rejected: they are not user data, they are large, and every fetch would append thousands of ops to the log of every device.
- **Alternative: expand recurrences on the device from the raw feed.** Rejected: the expander would exist twice (Go for limits and warnings, JS for display), and raw feeds can be megabytes.

### D9. Settings panel

`CalendarFeedsPanel` in Settings → Integrations, after `CaldavPanel` (`SettingsView.tsx:215-223`), hidden on the demo like the webhooks panel. Owner: the switch row (state-first card, "On"/"Off"), with the note that private-network targets follow the webhooks toggle. "Other calendars" card: list rows (colour dot, name, "Refreshed 5 min ago" or "Failed: timed out · last success 2 h ago", warnings as a small note), row menu Edit, Refresh now, Disable/Enable, Delete (confirm dialog), and an "Add calendar" form (URL, name, colour) opened from a button. "Your tasks as a calendar" card: Off state with "Create feed URL"; On state with created and last-used times, Rotate (confirm) and Revoke (confirm); after create or rotate a dialog shows the URL once with Copy, the "shown only once" note and three short setup lines (Google Calendar: Other calendars → From URL; Outlook: Add calendar → Subscribe from web; Apple Calendar: File → New Calendar Subscription). Encrypted accounts see "Titles appear as 'Encrypted item' in calendar apps" and "Events from other calendars are stored unencrypted on the server". Screen id `settings/calendar-feeds`, help link to `docs/calendar-feeds.md`.

## Risks / Trade-offs

- **[Recurrence expansion diverges from the source app]** → The grammar covers what the four common sources emit; unsupported parts degrade to one occurrence and a visible warning instead of guessing. Fixtures from Google, Outlook, iCloud and Nextcloud exports live in `internal/calfeed/testdata/` and pin the expansion.
- **[Windows zone names in Outlook feeds]** → The CLDR table resolves them; an unresolved name becomes floating time and a warning, never a silent hour shift to another zone.
- **[A leaked feed URL exposes titles and dates]** → Read-only, revocable and rotatable in one click, rate limited per token, hashed at rest, audited, refused for encrypted accounts' titles. The docs say to treat the URL like a password.
- **[A subscription URL may itself carry a secret (Google's private address)]** → Stored like webhook secrets, shown only to its owner, never logged or audited; Settings warns for plain `http://` URLs as it does for webhooks.
- **[The fetcher is a new outbound actor on the operator's server]** → Off by default, the webhook policy is reused byte for byte, concurrency is two, bodies are capped, and every fetch logs host and outcome at debug level.
- **[Inline fetch on create blocks a request for up to 20 s]** → Bounded, rate limited (12 per user per hour), and the same pattern as the webhook test route; the panel shows a spinner.
- **[Occurrence rows grow]** → Bounded at 5,000 per subscription and 10 subscriptions per user; a replace deletes the old rows in the same transaction, and deleting a subscription cascades.
- **[Day and Week grow more code paths]** → Event blocks are a second input to the same `layoutDay`; the keyboard model for tasks is untouched because events are outside `order`. The existing calendar tests and the new ones run on the same fixtures.

**Size and memory:** no dependency. Binary: about 300 kB (Go code plus the zone table and the embedded JS growth). Web bundle: about 20 kB minified, 6 kB gzip, in the main chunk because `CalendarView` is already there. Runtime memory: idle unchanged; a fetch holds at most 2 MB of body plus its parsed form (roughly 3×) until it is stored; the worker holds at most two in flight. SQLite: at most about 1.5 MB of event rows per subscription at the cap.

## Migration Plan

One additive migration; no data migration. Rollback is shipping the previous binary: the three tables stay inert, the routes answer 404, and devices ignore the unknown Dexie tables (older clients never read them). A device that received events from a newer server keeps the cache until sign-out; it draws nothing when the toggle is off or the tables are empty. Enabling the feature needs no restart.

## Open Questions

- Should `month-and-timeline-views` get the all-day strip and events in the month grid in its own change, reusing `GET /api/v1/calendar-feeds/events` and the cache? Nothing here depends on the answer.
- Should the CalDAV mapping adopt the Windows zone table (`internal/caldav/vtodo.go:452` falls back to floating today)? It is a one-line change once the table exists and can land separately.
