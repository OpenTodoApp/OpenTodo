# Proposal

## Why

Issue #565, item 8: a person plans with an AI assistant and keeps a "now" panel beside the screen (a small web page, a Home Assistant card, an e-ink display). Nothing outside the app can see the running Focus session, so the panel runs its own timer and the two drift apart. The server already knows part of it, the running time entry that a work session writes (`focus-mode` "Sessions are time entries"), but not the mode, the session number or when the session is meant to end. `focus-mode` "Timer state stays on the device" keeps all of that on the device by design, so making it readable is a decision about that rule, which is why it is split from `agent-tools-complete`.

## What Changes

- The time entry a Focus work session writes carries three additive, non-content fields: `focus_mode` (`pomodoro`, `flowtime`, `countdown`), `focus_session` (the work session's number in the Pomodoro cycle) and `planned_end_at` (when the session will end if nothing changes; empty for Flowtime). They are written by the device that runs the session, offline like any entry field, and converge per field.
- `GET /api/v1/time-entries/running` answers the caller's running entry with those details, or `null`, with the server time, for every token scope; one stable shape so a panel can poll it.
- MCP: `list_time_entries` carries the same `focus` object per entry, and a resource `opentodo://time-entries/running` holds the running entry.
- `focus-mode` "Timer state stays on the device" is narrowed: the pause bookkeeping, the phase, breaks and the countdown before a resume stay on the device; the three facts above travel with the entry.

No new environment variable, no migration beyond the additive fields, not **BREAKING**.

## Out of scope

- Breaks and pauses as visible states: neither writes a time entry, so outside readers see "nothing running" during them (stated in the docs).
- A webhook event for time entries or Focus sessions; a later change if a receiver needs a push rather than a poll.
- Starting, pausing or ending a Focus session from outside (agents can start a plain timer through `agent-tools-complete`'s `start_timer`, which is not a Focus session).
- The native Live Activity and Dynamic Island (change `focus-live-activity`, which reads the session on the device through the bridge and does not depend on this change).
- Statistics on Focus sessions.

ROADMAP: milestone 0.20 "Everywhere", split out of row `agent-tools-complete`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `focus-mode`: "Timer state stays on the device" lets the mode, session number and planned end travel with the work session's time entry; a new requirement says what the Focus screen writes.
- `time-tracking`: the time entry gains the three fields and a running-entry read route.
- `mcp-server`: the Focus details in time entry reads and a running-entry resource.

## Impact

- **Data model and op schema:** three additive `time_entry` fields in `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts`; the schema fixture. Not content fields (no user-written text), so nothing for `e2ee.ContentFields`.
- **Sync:** written with the entry's other fields in the batch that starts or resumes the entry; an older server refuses the new fields as invalid and the device keeps them locally, as for every additive field.
- **E2EE:** none; the fields are plaintext like `started_at`.
- **API/CLI/MCP:** one read route, `docs/api.md`, `docs/mcp.md`, `docs/focus.md`; `ot time` prints the mode and planned end of the running entry.
- **Export:** the entries in the JSON export carry the three fields; the CSV export is unchanged.
- **CalDAV and vault:** none.
- **Size:** no dependency; a few dozen lines on each side.

Fixes #565 (item 8)
Relates to #543
