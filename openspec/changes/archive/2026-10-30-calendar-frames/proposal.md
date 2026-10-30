# Frames: recurring background windows on the calendar

## Why

People who plan with a calendar decide the shape of their week before they decide its tasks: deep work in the morning, admin late in the afternoon, no meetings on Friday. Morgen calls these windows "Frames" and charges for them; Cal Newport's time-blocking starts from the same idea. The research lists "recurring background Frames on the Week calendar grid (Deep Work · 09:00–11:00, Admin Batch · 16:00–16:45)" as one of the three primitives OpenTodo needs to replace Sunsama, Akiflow and Morgen (research §"Commercial daily planners", roadmap P2.2). Today the Day and Week grids show tasks and other people's events, but nothing that says what a stretch of time is *for*, so every morning the user re-decides where the deep work goes.

## What Changes

- A new personal entity, the **frame**: a title, the weekdays it repeats on, a start and an end time, a colour from the project palette, an optional first and last date, and an optional **planning source** (a project, label or saved view) that says which tasks belong in it. Frames sync to the user's own devices only, through the op log, offline first.
- Day and Week draw each frame occurrence as a quiet **background band** behind the blocks: a faint tint of its colour across the column with its title and times at the top in the faint tone. Frames never cover, move or block anything: tasks and events are drawn above them and drops land on the slot under the pointer as today.
- Activating a frame's title (click, or Tab then Enter) opens a small popover: title, times, repeat, **Plan from this frame** (opens the planning list with the frame's source; the next placement proposes the first free start inside the frame), **Edit** and **Delete**.
- Frames are created and managed from the Day and Week overflow menu (**Frames…**, a dialog listing them with Add), from the command palette (**New frame**) and, with `calendar-clarity` (#555), from the empty-slot menu of the grid as **New frame here…**, prefilled with that weekday and time.
- Frames do not count toward capacity, are not obstacles for `replan-the-day`, and never create tasks or events.
- On a phone (the Week's vertical agenda below 640 px) a frame is a subtle heading inside its day ("Deep work · 09:00–11:00") above the timed tasks that start inside it.
- REST `GET/POST/PATCH/DELETE /api/v1/frames`, `ot frames` in the CLI, and a read-only MCP resource and tool so an assistant can plan into frames.
- End-to-end encrypted accounts encrypt the frame title.

Not **BREAKING**: one new entity and two new value kinds in the op schema (additive), new routes behind sign-in, no environment variable.

Out of scope:
- Skipping or moving a single occurrence of a frame (a later change can add an exception list, as `series-exceptions` does for tasks).
- Frames across midnight, frames in Month or Plan, frames shared with project members.
- Publishing frames to an external calendar as busy time (calendar sync, CalDAV).
- Auto-placing tasks into frames: frames guide; the person places (anti-roadmap "no change without approval").
- Slots, which hold tasks inside one block: `calendar-slots`, which builds on this change.

ROADMAP: 0.18 "The mindful daily planner", `calendar-frames` (research P2.2).

Relates to #555 (adding with the mouse on the grid is the gesture that also creates a frame; delivered by `calendar-clarity`).

## Capabilities

### New Capabilities

- `calendar-frames`: the frame entity, its occurrences, how Day and Week draw them, managing them, and their API, CLI and MCP surface.

### Modified Capabilities

None. The interaction with capacity (`time-blocking`), the planning list and re-planning is stated in the new capability as "frames do not change them", so no existing requirement changes.

## Impact

- Data model and op schema: new entity `frame` in `internal/sync/ops.go` `Schema` (personal scope, like `rule` and `place`), two new value kinds (`kClock` "HH:MM", `kWeekdays`), `internal/sync/testdata/schema_fixture.json`, `web/src/lib/types.ts`, the defaults in `web/src/lib/ops.ts`, the Dexie store version in `web/src/lib/db.ts`. Materialized table via a new migration `internal/store/migrations/NNNN_frames.sql`.
- E2EE: `frame.title` added to `internal/e2ee.ContentFields` and `CONTENT_FIELDS` in `web/src/lib/e2ee.ts`; the server and MCP show it through `e2ee.Display`.
- API: `internal/httpapi/frames.go` routes registered with `signedIn` (reads) and `signedIn` writes refused to `read` tokens; `.demoDenied()` not needed (no outbound, no bulk). Writes via `ApplyStrict` and `NotifyApplied`. `docs/api.md` and the route matrix.
- CLI: `ot frames`, `ot frames add`, `ot frames rm` in `internal/cli`.
- MCP and agent tools: a read tool `list_frames` and resource `opentodo://frames` in `internal/agenttools`; no write tool in this change.
- Export includes frames; backup and restore carry them with the database.
- CalDAV, vault, calendar feeds: none.
- Web: `web/src/lib/frames.ts` (occurrences, validation), `web/src/app/calendar/FrameBand.tsx`, `FramesDialog.tsx`, the Day and Week grid layering, the phone agenda heading.
- Bundle: about 4 KB gzip for the dialog (lazy) and the band; no dependency. Binary: a few KB.
- Docs: new guide `docs/frames.md`, links from `docs/time-blocking.md` and `docs/calendar-views.md`; strings in the six catalogs; CHANGELOG.
