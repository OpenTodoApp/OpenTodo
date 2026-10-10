# Design

## Context

Tasks carry a floating `due` (`{date, time?}`) and the UI is a set of list views over IndexedDB. Time blocking needs a duration per task and a time-axis view with direct manipulation. The constraints are the usual ones: every write is an op, the client must work offline, the bundle must stay small, and every action needs a keyboard path. The main design question is what a "block" is in the data model.

## Goals / Non-Goals

**Goals:**
- One additive field; no new entity.
- A calendar grid that is a pure projection of existing data.
- Drag and drop without a dependency; keyboard parity.
- A duration predicate reusable by `filter-query-language`.

**Non-Goals:**
- Distinguishing "deadline" from "planned start" (see D1).
- Time tracking of actual effort, timers, or Pomodoro.
- Rendering external calendars inside the grid (`caldav` may add a read-only layer later).

## Decisions

### D1. A block is `due.time` plus `estimate_minutes`
Chosen: no new scheduling field. A task appears on the grid at its due time, with the estimate as its length. Dragging sets `due`; resizing sets `estimate_minutes`.
- Why: one notion of "when" keeps Today, reminders (which fire relative to `due`), recurrence (which rolls `due`) and the calendar consistent, and adds exactly one field. Users who treat the due time as a deadline rather than a start can still use the grid; the unscheduled lane holds date-only tasks.
- Alternative: an additive `scheduled` `{date, time}` field separate from `due`. Deferred: it doubles the "when" surface in every view and in reminders; if demand appears it can be added additively later and the grid would prefer it over `due` when present.
- Alternative: a `time_block` entity with start and end. Rejected: a task has at most one block in practice; the entity adds joins to every view.

### D2. Field definition and validation
`estimate_minutes`: JSON number or null, integer, 1 ≤ n ≤ 10080. New validation kind `kMinutes` in `ops.go`; TypeScript mirror in `types.ts`, default `null` in `ops.ts`. REST and export include it. Rendering helper `formatMinutes(n)` → `15m`, `1h`, `1h 30m`.

### D3. Grid rendering
A `CalendarGrid` component takes a date range and renders columns; blocks are positioned absolutely from `time` and `estimate_minutes` (default 30 for unestimated, dashed). Layout of overlapping blocks is a pure function `layoutDay(blocks) → columns` (sweep line, assign the first free lane, width = 1 / lanes in the cluster), unit-tested. Data comes from the existing live queries over `tasks` filtered by date range; no new tables. Virtualisation is unnecessary at personal scale (a week is at most a few hundred blocks).

### D4. Drag and drop with pointer events
Native `pointerdown/move/up` with `setPointerCapture`; a ghost element follows the pointer; drop target is computed from pointer position to a 15-minute slot. Touch works through the same events with a long-press to start. Resize is a handle on the block's lower edge. No library (saves 10–30 KB and keeps control over keyboard parity).
- Keyboard: a selected block receives arrow keys (15 min / 1 day), `Shift+Up/Down` (estimate ±15), Enter (detail). `s` on a list row enters "placement mode" in the Day view, where arrows move a ghost and Enter commits; Escape cancels without writing.

### D5. Writes
Drop → `updateTask(id, { due: { date, time } })`; drop on lane → `{ due: { date } }`; resize → `{ estimate_minutes }`. Each is one `mutate` call, hence one op per field, offline-queued, LWW-converging. Nothing new in the sync layer.

### D6. Duration filter and predicate
`durationPredicate(kind)` in `src/lib/filters.ts` returns `(task) => boolean` for `quick` (≤15), `under30`, `over60`, `unestimated`. List views apply it after their own view predicate. Active filter stored in `localStorage` per view (per-device convenience, not synced). `filter-query-language` will map `estimate <= 15` to the same helper.

### D7. Preferences
Grid start/end hour and day length live in the Dexie `meta` table (per device, like the device id). Defaults 06:00–22:00 and 480 minutes. Not synced on purpose: screen size and work hours are device and context specific; a synced preference entity is a separate change.

### D8. Data model impact and footprint
Additive field `task.estimate_minutes`; no renames; export format unchanged apart from the extra key. No new dependency; bundle growth about 8 KB gzipped (grid, drag layer, layout, filter). No server memory or image impact.

## Risks / Trade-offs

- [Users want a planned time distinct from the deadline] → D1 keeps the door open for an additive `scheduled` field; the lane and the "due" wording in the UI make the current semantics explicit.
- [Drag on touch devices conflicts with scrolling] → Long-press to lift, visible lift state, scroll otherwise; keyboard placement mode is the fallback.
- [Overlapping clusters become unreadable with many tasks] → Side-by-side layout caps at four lanes then stacks with a "+N" marker that opens a list.
- [Capacity sums mislead when estimates are missing] → Unestimated tasks count as 0 and the header shows the unestimated count next to the total.
- [A device with the grid open receives remote moves mid-drag] → The drag ghost is local state; the commit writes the latest intent; LWW resolves.

## Migration Plan

Additive schema change only. Older clients ignore `estimate_minutes` in pulled ops and keep working.

## Open Questions

- Whether the Day view should become the default landing view when the user has any timed tasks today.
- Whether to show the current-time line and auto-scroll to it (cheap, likely yes during implementation).
