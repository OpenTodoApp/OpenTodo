# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **Completion of a series is already a convergent record.** `planCompletion` (`web/src/lib/recurring.ts:62-83`) writes an occurrence record with the id `occurrenceId(seriesId, date)` plus a `due` op on the series; the server does the same in `RecurringCompletion` (`internal/sync/recurring.go:62-131`) for REST, CalDAV and assistant completions. `completedOccurrences` (`recurring.ts:26-38`) counts records whose id matches the derived id, which is how `for N times` converges.
- **A skip leaves nothing.** `planSkip` (`recurring.ts:93-100`) is one `due` op; `skipOccurrence` in `web/src/lib/ops.ts:739-752` applies it. There is no server-side skip.
- **Devices do not keep the op log.** The client holds materialized rows in Dexie plus a bounded local `activity` table (at most 500 events per project, `docs/sync.md` "Activity"). History of a date can therefore only be read from entities that exist as rows: occurrence records.
- **The rule grammar is closed and shared.** `Rule` (`web/src/lib/recurrence.ts:15-29`) has seven kinds; six are predicates on a date (`weekday`, `weekdays`, `monthDay`, `lastDay`, `lastWeekday`, `nthWeekday`) and one is an interval anchored at the current due (`interval`, with `afterCompletion`). `nextCalendar` only walks forward.
- **Rows and the detail panel.** `TaskRow.tsx:134-138` shows the repeat indicator; `RecurrenceField.tsx` holds the rule, the preview and the Skip / This occurrence only buttons and already live-queries the series' records (`db.tasks.filter((t) => t.series_id === task.id)`). `task-detail-redesign` (in flight) moves these into a "Repeat" properties row; this change adds to `RecurrenceField`, which that change relocates without changing behaviour.
- **Completed and `completed`.** `TaskListView.tsx:126-127` lists every task with `completed_at`; `evaluate.ts:157` matches `completed_at !== null`.
- **Icons.** The bundled sprite has 63 Lucide glyphs (`web/src/ui/icons/names.json`); `flame` and `minus` are not among them.

## Goals / Non-Goals

**Goals:**
- Everything derived, nothing stored beyond two booleans; the server stays ignorant of habits except for excluding skipped records from the occurrence count.
- A streak that two devices with the same rows compute identically, specified by test vectors.
- A heat-map that passes the axe check at 360 px in light and dark, with no chart library.

**Non-Goals:**
- Editing history (backfill, undo a skip from the grid), goals per week, cross-habit statistics (`stats-and-review`).
- Changing how non-habit recurring tasks skip, complete or end.
- A Dexie index on `series_id` (a version bump for a per-panel query that already runs today).

## Decisions

### D1. Two additive booleans on `task`, no new entity

`task.habit` and `task.skipped`, both `kBool` in `Schema`. `habit` lives on the series; `skipped` lives on an occurrence record. Clients read a missing value as `false` (`habit?: boolean`, `skipped?: boolean` in `Task`, like `notes_doc`), so rows synced before the fields existed need no migration and no Dexie version.

- **Alternative: a `habit_log` entity (one row per day and series).** Rejected. It duplicates what occurrence records already are, needs scope wiring like `section` (`internal/sync/scope.go:280-284`), purge handling (`trash.go:483-484`) and an export key, for no behaviour the record cannot carry.
- **Alternative: derive skips from due-date jumps in the op log.** Rejected. Devices do not hold the op log (Context), and a catch-up jump after being overdue looks exactly like a skip.
- **Alternative: a `skipped_at` timestamp instead of a boolean.** Rejected. The record already carries `completed_at` as the time of the action; a second instant adds nothing the streak uses.

**Data model impact:** two additive fields, no rename, no new entity. Not content (not in `e2ee.ContentFields` / `CONTENT_FIELDS`): a skipped day reveals no text. `internal/activity` and `lib/activity.ts` classify ops on these fields as "edited" through the default branch (`activity.go:207-208`); a skip record, having `created_at`, is a "created" event exactly like a completion record today. One op of each field is added to `internal/activity/testdata/activity_fixture.json` to pin that.

### D2. A habit skip writes the occurrence record marked `skipped`

`planSkip(series, rule, now, today)` gains the `now` argument and, when `series.habit` is true, returns the same two changes as `planCompletion` with the record patch `{ ...copyOf(series, now), due, completed_at: now, skipped: true }`, and `planCompletion` writes `skipped: false` explicitly for a habit. The record id is `occurrenceId(series.id, date)`, so two skips, or a skip and a completion of the same date, converge to one row: every field of the record is written in one batch with one HLC timestamp, so per-field LWW picks one batch wholesale (done or skipped). A server-side completion (`RecurringCompletion`) writes no `skipped` op; if it lands after a device's skip, the device's `skipped: true` stays while `completed_at` takes the server's value. The streak is unbroken in every combination; only the glyph of that day differs. This is acceptable and documented.

`completedOccurrences` (client) and the `done` loop in `RecurringCompletion` (`recurring.go:93-104`) ignore records with `skipped` true, which keeps the `for N times` contract ("skipped occurrences do not count") true for the new record.

The record stays a task row: it is hidden from Completed and from `completed` queries (D6) but exported like every row and shown in the habit's history. The recovery path for a skip by mistake is the existing one: set the due date back to that day and complete; the completion writes the same record id with `skipped: false`.

- **Alternative: a tombstoned record (`deleted_at` set).** Rejected. The trash would list it, and the purge after the retention period would erase the history.
- **Alternative: an open record (`completed_at` null) with a marker.** Rejected. It would be an open task in every list until every list learned to hide it; a completed row is hidden from open views by the existing rule.

### D3. Streak and schedule in a pure module `web/src/lib/habits.ts`

```
scheduled(rule, dueDate, date): boolean      // predicate kinds: match the date; interval kinds: anchored at dueDate, stepping by the interval
previousScheduled(rule, dueDate, before, records): string | null
habitStats(series, records, today): { current: number; best: number; pending: boolean; atRisk: boolean }
monthGrid(series, records, year, month, today): Array<{ date; state: 'blank'|'done'|'skipped'|'missed'|'pending'|'upcoming' }>
```

Rules:
- The schedule is the union of the rule's dates and the dates that have a record (a record proves the day was scheduled, even if the rule changed since). Predicate rules are evaluated per date; interval rules step from the current due date by `interval` days, weeks, months (same day of month, clamped like `nextCalendar`) or years. `every N weeks` and `every day` are intervals, so this covers the common habits.
- The current occurrence (`series.due.date`) is pending: not missed whatever today is. `atRisk` is true when it is before today, for the chip's hint only.
- `current` walks back from the scheduled date before the current occurrence while each has a record; a `skipped` record continues the walk without adding to the count; the current occurrence adds one when it has a record (it cannot, in practice, since completing moves the series, but a concurrent completion on another device can leave the series behind for a moment).
- `best` runs the same walk over every maximal run of records.
- The month grid marks a scheduled date before the current occurrence with no record as missed, the current occurrence as pending, later scheduled dates as upcoming.

The module takes the series row, its records and `today` and nothing else, so two devices with the same rows agree. A vector file `web/src/lib/habits.vectors.json` pins the spec scenarios (daily, weekday set, `every 1st`, a rule change mid-history, catch-up after being overdue) and the interval stepping across month ends and DST (dates are floating, so DST cannot matter, and a test says so).

- **Alternative: reuse `nextCalendar` by walking forward from the first record.** Rejected. Interval rules are anchored at the current due, so walking forward from an old date drifts from the series' actual rhythm after a catch-up; walking backward from the anchor is what the series itself does.
- **Alternative: count a completion-relative habit by "done by its due date".** Rejected for now. There is no schedule to show in a grid; the flag is not offered for those rules (Non-Goals).

### D4. Heat-map on tokens, no library

`web/src/app/HabitHistory.tsx`: a `role="grid"` of seven columns with weekday headers from `lib/dates.ts` `weekDays` (week start follows `date-time-preferences`), one `gridcell` per day with `aria-label` "6 October, skipped", roving tabindex and arrow, Home, End, Page Up and Page Down keys (month change). Prev/next month buttons with accessible names and a live heading "October 2026". Cells are 24 px squares at 360 px (7 × 24 + gaps fits the panel), using only token classes:

| state | background | glyph |
| --- | --- | --- |
| done | `bg-success` with `text-on-accent` | `check` |
| skipped | `bg-sunken` border `border-muted` | `minus` (added to the sprite) |
| missed | `bg-danger-soft` | none, dashed border |
| pending | `bg-accent-soft` | `circle` outline |
| upcoming | `bg-surface` | none |
| blank | transparent | none |

Contrast of each glyph on its background is checked by the existing `web/src/ui/tokens/contrast.test.ts` table. The component is a Storybook story (`make ui-check`) in both themes. `flame` is added to `web/src/ui/icons/lucide.ts` for the chip and `minus` for the grid (two paths, a few hundred bytes).

- **Alternative: a calendar-heatmap or chart dependency.** Rejected ("keep it small"); the grid is about 120 lines.
- **Alternative: a GitHub-style 52-week strip.** Rejected: it does not fit 360 px without scrolling and reads badly for weekly habits.

### D5. Placement: rows, the repeat field, a filter keyword

- `TaskRow.tsx:134-138`: after the repeat indicator, a chip `<Icon name="flame" size="xs" />` plus `current` for a habit (`aria-label` "12-day streak", "at risk" appended when `atRisk`). The row already receives the task; it needs the series' records for the streak, so the list computes `habitStats` once per habit from the tasks it already holds (`allTasks` in `TaskListView`) and passes it down, rather than each row querying.
- `RecurrenceField.tsx`: a `Switch` "Track as a habit" rendered only for a parsed calendar rule on an open task; below it, for a habit, "Streak 12 · Best 30" and `HabitHistory`. Skip stays where it is. `task-detail-redesign` moves the whole field into its properties card; nothing here depends on its layout.
- `lib/filter/parse.ts:143,163`: `habit` joins `SIMPLE_KEYWORDS`; `evaluate.ts` tests `t.habit === true`. `docs/filters.md` lists it. Saved views do the rest; no built-in view, no sidebar entry.

- **Alternative: a Habits section in Today.** Rejected. Habits due today are already in Today; a second list of the same rows is noise, and a weekly habit due Friday does not belong in Today on Monday.
- **Alternative: a dedicated Habits screen with every grid side by side.** Deferred: the query view lists habits with chips; the grids are one click away. It can be added later without data changes.

### D6. Skipped records hidden from Completed and `completed`

`TaskListView.tsx:126-127` filters `!t.skipped`; `evaluate.ts:157` `completed` becomes `completed_at !== null && !skipped`; `open` is unchanged (a skipped record has `completed_at`, so it is already not open). Dashboards and `evaluateViews` go through the same evaluator. The server's REST `tasks` list keeps returning the record (it is a task; `include_deleted` semantics unchanged), with `skipped: true` visible, and `docs/api.md` says so.

### D7. Server and integrations

- `RecurringCompletion` skips `skipped` records when counting (`recurring.go:93-104`). No other server change: the record list copied into a server-side occurrence record (`recurring.go:117-124`) deliberately does not include `habit` or `skipped`, matching `copyOf` on the client, so records never carry the flag.
- `internal/agenttools/data.go` `taskOut` gains `Habit bool \`json:"habit,omitempty"\``. Write tools do not accept `habit`; an assistant completes a habit through `complete_tasks` like any task (mcp-server "Write tools", "Complete a recurring task"). No tool skips.
- CalDAV: unchanged. The flag is not mapped to a VTODO property; a CalDAV completion is a server completion.
- REST: `habit` and `skipped` are ordinary schema fields; `fieldOps` (`server.go:1484-1490`) already passes any schema field through `Validate`.

## Risks / Trade-offs

- **[Older server rejects `habit` and `skipped` ops as unknown fields]** → Same as every additive field: client and server ship in one binary; a device talking to an older server keeps the flag locally and the rejected-op path applies. The skip record's other fields are accepted, so the record arrives as a plain completion on the old server; the device's `skipped` value re-syncs after the upgrade only if the op is retried, which the rejected-op path does not do. The release notes say to upgrade the server first, as they do for every schema addition.
- **[A rule change rewrites the schedule retroactively]** → Records prove past scheduled days (D3), so done and skipped days never disappear; only which past days read as missed can change. Documented in `docs/recurrence.md`.
- **[Catch-up after being overdue produces missed days]** → That is the truth: `every day` due Monday, completed Wednesday, records Monday and jumps to Thursday; Tuesday and Wednesday were missed. The grid shows it; the streak restarts. The guide explains it with this example.
- **[Server completion after a device skip leaves a `skipped: true` record with the server's `completed_at`]** → Streak is unaffected; the day reads as skipped. Rare (same day, two channels) and documented in D2.
- **[Streak per row costs a scan of the series' records]** → `TaskListView` computes stats once per habit from the tasks it already holds (D5); a habit with three years of daily records is about 1,100 rows, a sub-millisecond walk. No Dexie index is added.
- **[Colour-only heat-map]** → Every state has a glyph or border difference and an `aria-label`; the axe check in the component test and the Storybook story in both themes guard it.

**Size:** no dependency. `lib/habits.ts` plus the grid and chip are an estimated 3–4 KB gzipped on the web bundle; two sprite paths add well under 1 KB. The Go binary grows by the embedded bundle only; runtime memory on the server is unchanged.

## Migration Plan

No data migration. Missing `habit` and `skipped` read as false, so every existing series and record behaves as before; no Dexie version bump. Rollback is shipping the previous binary: old clients ignore the two fields and skip habits like any series (no record); the old server rejects the two field ops and keeps everything else.
