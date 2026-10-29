# Proposal

## Why

Calendar sync (0.14.0, `calendar-sync`) writes dated tasks into the calendar people already use and brings moves, resizes and renames back. It covers every CalDAV service and Google, but not the calendar most office workers live in: Outlook.com and Microsoft 365 offer no CalDAV, so `docs/calendar-sync.md#outlook` tells them to fall back to a one-way task feed and a published-calendar overlay. The research lists two-way time blocks with "Google, Outlook" as the Morgen-style strength people switch for (§1 Morgen, §3.3), and the gap analysis marks Outlook as the one missing provider (gap rows "Time block propagates…" and "Two-way time blocks", size M, no data-model impact).

Microsoft Graph has what the existing cycle needs: OAuth with refresh tokens, a delta query per calendar (the analogue of a sync token), ETags for conditional writes and extended properties to mark the events OpenTodo owns.

## What Changes

- **A third provider, `microsoft`, in calendar sync**: "Connect Microsoft" next to "Connect Google" in Settings → Integrations → Calendar sync, for Outlook.com, Hotmail and Live accounts and Microsoft 365 work or school accounts.
- **A Microsoft client configured by the owner**, like the Google one: an app registration's client id and secret (and a tenant: `common` by default, or `organizations`, `consumers`, or one tenant id), stored in `<data>/secrets/calendar-sync.json`, never returned; optional `OPENTODO_MICROSOFT_CLIENT_ID`, `OPENTODO_MICROSOFT_CLIENT_SECRET` (or `_FILE`) and `OPENTODO_MICROSOFT_TENANT` mirror the Google variables. Nothing is mandatory.
- **Connecting**: `POST /api/v1/calendar-sync/microsoft/start` and `GET /api/v1/calendar-sync/microsoft/callback` with PKCE and a single-use state, exactly like Google; the refresh token is the connection's secret and is replaced whenever Microsoft rotates it.
- **The same cycle on Graph**: pull before push on the jobs leader; `calendarView/delta` over the sync window for the target and shown calendars; events created with an OpenTodo extended property carrying the task id and with immutable ids; updates and deletes with `If-Match`; task changes as ops through `ApplyStrict` with device `calsync:<connection-id>`; the same conflict rule (newest change wins), limits (3 connections, 200 writes a cycle, 10 shown calendars), states and backoff.
- **Throttling and failures**: a 429 or 503 waits at least Graph's `Retry-After`; a revoked grant or an expired client secret stops the affected connections with a reason the person or the owner can act on.
- **Docs**: the Outlook section of `docs/calendar-sync.md` becomes "Connect Microsoft Outlook" with the owner's app-registration steps.

Not **BREAKING**: no op schema change, no mandatory environment variable; one additive server migration (cursor side table).

## Out of scope

- National clouds (Microsoft 365 GCC High, DoD, Azure China): different hosts; a later change if asked.
- Certificate credentials or managed identities for the app registration (a client secret only).
- Microsoft To Do tasks (a separate API and a different product question; the importer already reads To Do exports).
- Teams meetings, attendees, reminders and categories on the written events (same limits as the CalDAV and Google events).
- Shared mailboxes and delegated calendars of other people as the **target** (they can be shown when Graph lists them under the user's calendars).
- Exchange on-premises (EWS): retired by Microsoft; not Graph.

ROADMAP-1.0 item advanced: 0.20 "Everywhere" → `outlook-calendar-sync`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `calendar-sync`: a Microsoft client configured by the owner, a Microsoft connection flow, and the cycle's Graph behaviour (delta, ETags, extended property, time zones, throttling); the owner switch's status reports whether Microsoft can be connected.

## Impact

- **Data model, sync, op schema**: no op field. Task changes from Outlook are ordinary ops (`ApplyStrict`, device `calsync:<connection-id>`), so devices converge on them with their next sync, offline edits reach Outlook after the device syncs and the next cycle runs. One additive migration: `calsync_cursors` (a delta link per calendar of a connection, with the window it covers). `calsync_connections.provider` gains the value `microsoft`.
- **E2EE**: unchanged rule: an encrypted account's events are titled "Encrypted item" with no body, and a title changed in Outlook is not applied. No new content field.
- **API**: new routes `GET`/`PUT /api/v1/settings/calendar-sync/microsoft` (owner; PUT needs the owner's session or an admin token), `POST /api/v1/calendar-sync/microsoft/start` (fresh session), `GET /api/v1/calendar-sync/microsoft/callback` (the session that started); `GET /api/v1/settings/calendar-sync` gains `microsoft`; connections report `provider: "microsoft"`. All under the existing `/api/v1/calendar-sync` and `/api/v1/settings/calendar-sync` demo-deny prefixes and declared `.DemoDenied()`. `docs/api.md` and the route matrix (`internal/httpapi/route_matrix_test.go`) updated.
- **CLI / MCP**: none (connections are managed in Settings; the agent tools do not manage connections).
- **CalDAV, vault**: none.
- **Outbound (AGENTS rule 5)**: `login.microsoftonline.com` and `graph.microsoft.com` are contacted only after the owner configured a Microsoft client and a user connected; through `internal/outbound` with redirects refused. They are added to the documented list "What the server contacts".
- **Size**: no dependency (stdlib HTTP and JSON; the OAuth code is shared with Google). One embedded table mapping Windows time zone names to IANA names (CLDR `windowsZones`, about 12 KB). Binary about +60 KB; memory per cycle bounded by the existing 4 MB response cap.
