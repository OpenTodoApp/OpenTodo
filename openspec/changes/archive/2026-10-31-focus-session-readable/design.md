# Design

## Context

`focus-mode` keeps the running session (task, mode, phase, start, time accumulated before a pause, cycle count, countdown length) in the device's local store and never syncs it ("Timer state stays on the device"). What other devices and the server see is the time entry each stretch of work writes (`focus-mode` "Sessions are time entries"; `time-tracking` "One running entry per user"): a pause ends the entry, a resume starts a new one, breaks write nothing. `GET /api/v1/time-entries?running=true` and MCP `list_time_entries` with `running: true` already return that entry.

Issue #565 asks for "the task, the timer type, the session number, and the start and end times" of the running session, so that a panel beside the screen mirrors the app instead of running its own timer. The entry gives the task and the start; the type, the session number and the end exist only on the device.

## Goals / Non-Goals

**Goals:** a reader outside the app (REST with any token scope, MCP, the CLI) can show what the Focus screen shows during a work stretch: task, mode, session number, start, planned end. Offline-first, convergent, no new server state.

**Non-Goals:** visible breaks and pauses; controlling a session from outside; push delivery (webhooks); statistics.

## Decisions

**D1. The three facts travel with the time entry (chosen), not as ephemeral server state.** Alternatives considered:

| Option | What a panel gets | Cost |
| --- | --- | --- |
| (a) Only what the server knows today: the running entry | task and start; no mode, no session number, no end | nothing to build but docs and a convenience route; the issue's "end time" stays unanswered, so a Pomodoro panel still runs its own countdown |
| (b) An ephemeral "focus status" the web app publishes to the server (memory only, never stored or exported, cleared on sign-out) | everything, breaks and pauses included | a new write route and in-memory state per user (per tenant on a host), lost on restart, absent whenever the device is offline, invisible to sync, and a second, non-op data path the non-negotiables avoid; contradicts "Timer state stays on the device" wholesale |
| **(c) Additive fields on the work session's time entry** | task, start, mode, session number, planned end; nothing during breaks and pauses | three additive op fields; the rule "Timer state stays on the device" narrows to the bookkeeping |

(c) keeps the op log as the only path, works offline (the fields are written with the entry and upload with it), converges like every entry field, and needs no new server state. What it gives up (breaks and pauses) is honest: no time is tracked then, and the panel shows "nothing running", which is also what the running indicator shows in the app. **Decision (owner, recorded 2026-10-30):** (c), exposing only the running entry's mode, session number and planned end. Option (a) is not needed as a fallback.

**D2. The fields.** On `time_entry`, additive, plaintext, not content:
- `focus_mode`: string, default `""` (not a Focus session: an entry from the Start button, the API, an agent's `start_timer`, CalDAV or an import). Values written today: `pomodoro`, `flowtime`, `countdown`. A reader shows an unknown value as a Focus session of unknown mode and keeps it (forward compatibility, like `focus-mode` "Unknown mode from a newer client").
- `focus_session`: number, default `0`; for Pomodoro the work session's number in the current cycle (1 to the long-break count), `0` for the other modes.
- `planned_end_at`: instant (Unix ms) or null, default null; the moment the work stretch ends if nothing changes: start plus the remaining work time for Pomodoro and Countdown, null for Flowtime. A resume after a pause starts a new entry whose `planned_end_at` is the resume time plus what was left. A later change that extends a session (Focus polish's "+5 minutes") writes `planned_end_at` again on the running entry; the last writer wins like any field.
- Validation: `focus_session` an integer 0–99 (its own `Schema` kind, so an out-of-range value is an invalid op like any kind error); `planned_end_at` null or a positive instant (`kInstant`). "Not before `started_at`" needs the entry's start, so the sync resolver checks it against the batch's winning `started_at` or the stored one and refuses the op alone with reason `invalid_planned_end` (the stored value travels back, as for `forbidden`) rather than failing the whole batch, which would block a device's outbox. REST does not write the fields. The web app clamps the planned end to the start before writing. The schema fixture carries the field names and defaults; the bounds are pinned by `internal/sync` tests.
- Who may write them: the entry's author only, like `started_at` (`time-tracking` "Time entry authorship").
- Added to `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` and the defaults in `web/src/lib/ops.ts` (AGENTS rule 3). Not added to the E2EE content lists: no user-written text.

**D3. One read route with a stable shape.** `GET /api/v1/time-entries/running` → 200 `{entry, serverTime}`, where `entry` is the caller's own running entry in the list routes' shape plus `focus: {mode, session, plannedEndAt} | null` and `taskTitle`, or `null` when nothing runs. 200 rather than 404 when nothing runs, because a poller treats every non-200 as an error. Every token scope (`read` included), session or token, `signedIn` policy, nothing `demoDenied` (a read). Only the caller's own entry: another member's running entry on a shared task is never returned here. `taskTitle` is the stored value, so ciphertext for an encrypted account; the panel decrypts or shows a placeholder, and `docs/api.md` says so. The existing `?running=true` filter keeps working and gains the `focus` object too.

**D4. MCP.** Every entry in `list_time_entries` gains `focus: {mode, session, planned_end_at} | null`; a resource `opentodo://time-entries/running` returns `{entry | null, server_time}` with the task title under `untrusted_text`. A task in a project kept away from assistants is left out (the resource then reads `entry: null`, indistinguishable from nothing running), as `agent-project-exclusion` requires. No new tool: `list_time_entries` with `running: true` is the tool.

**D5. Freshness for a panel.** The server wakes the user's devices on every applied batch already; a panel with a token polls the route (documented interval: 15–30 s) and counts down locally from `plannedEndAt` against `serverTime`, so it stays within a second of the app without polling every second. When the device running the session is offline, the panel shows the last state the server has; the docs say so.

**D6. Progressive disclosure.** Nothing new on any screen. The Focus screen writes three more fields; Settings, the sidebar and the task row are unchanged. Simple-list users never see it. `docs/focus.md` gains a "Show the session elsewhere" section with the route, and `docs/home-assistant.md` a short REST sensor example.

## Data model impact

Three additive fields on `time_entry` (D2). No migration: materialised rows hold unknown fields already through the generic field store, and old entries read the defaults. Renames: none.

## Size

No dependency. A few dozen lines in `internal/sync`, `internal/httpapi`, `internal/agenttools`, `internal/cli` and the Focus screen's entry writes; no measurable change to the image, the web bundle or runtime memory.

## Risks

- **A stale planned end** when the session's device goes offline mid-session and the person ends early: the server keeps the old entry running until the device syncs. Same as the running indicator today; documented.
- **Clock skew** between the device and the panel: mitigated by returning `serverTime`; `planned_end_at` is the device's clock, like `started_at`.
