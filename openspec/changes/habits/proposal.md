# Proposal

## Why

A recurring task already models "meditate every day" or "gym every mon, wed, fri", and completing it records an occurrence in the op log (`docs/recurrence.md`, "Completing, skipping and editing"). What is missing is the feedback loop a habit tracker gives: how many days in a row, which days of the month were done, and a way to say "not today" without the chain breaking. People keep TickTick's habit tracker or a separate app for exactly this. The data for streaks is already there; only the skip leaves no trace today (`web/src/lib/recurring.ts:93-100`, `planSkip` writes a single `due` op), so a streak cannot tell a skipped day from a missed one.

## What Changes

- **A `habit` flag on a task.** An additive boolean on `task`. It is offered in the detail panel next to the repeat rule for a task with a calendar rule (`every day`, `every weekday`, `every mon, wed, fri`, `every 1st`); it is stored and synced like any field and converges by last-writer-wins. A task whose rule is later removed or made completion-relative keeps the flag but shows no habit statistics.
- **Skipping a habit leaves a record.** Today a skip is a bare due-date change. For a habit, skip writes the same occurrence record a completion would (same derived id, `completed_at` set) with an additive boolean `skipped` on it, and moves the series on. This is the one refinement to the roadmap note "completion history already lives in the op log": skip history does not, and a skipped day must be distinguishable from a missed one. Skipped records are not completions: they do not appear in Completed or match `completed` queries, and they do not count towards `for N times`. Non-habit recurring tasks skip exactly as before.
- **Streaks and a month heat-map, computed on the device.** The current streak, the best streak and a month grid (done, skipped, missed, upcoming) are derived from the series' rule and its occurrence records in IndexedDB. Nothing is stored for them, no route is added and the server computes nothing. A pending occurrence never breaks the streak; a scheduled day that passed with no record does; a skipped day keeps it without extending it.
- **Where habits show.** Habits stay ordinary rows in Today, Upcoming and their project, with a streak chip next to the repeat indicator. The detail panel gets a "Habit" block under the repeat rule with the streak, the heat-map with month navigation, and the existing Skip. A `habit` filter keyword makes a saved view "Habits" a one-line query; no new built-in view.
- **Integrations unchanged in behaviour.** The REST API, CalDAV and assistant tools complete a habit like any recurring task (server-side `RecurringCompletion`, `internal/sync/recurring.go:62-131`), which records a done day. The REST API accepts `habit` as a plain boolean; assistant tool results show `habit: true` so an assistant can list habits. CalDAV does not map the flag (a habit is a recurring VTODO).

Out of scope:
- Backfilling or editing past days from the heat-map ("I did it yesterday"), and undoing a skip from the grid. The recovery path (move the due date back and complete) exists and is documented.
- Habits with completion-relative rules (`every 3 days after completion`): there is no schedule to measure a streak against. The flag is not offered for them.
- Per-habit goals ("3 times a week"), reminders specific to habits (reminders already work), notifications, and any statistics beyond one habit (`stats-and-review` owns cross-task statistics and may reuse the streak code).
- A dedicated Habits screen or a Today section: the `habit` keyword and saved views cover it.
- Quick-add syntax for habits (`quick-add-recurrence` owns rule parsing in quick add).

This advances ROADMAP.md "Next: Parity and depth" row 19, **Habits** (`habits`).

Nothing here is **BREAKING**: two additive boolean fields on `task`, no new entity, no new route, no environment variable. Older clients store and ignore the fields; an older server rejects the two new field ops as unknown fields, as for every additive field before, and the device keeps its local value until the server is upgraded.

## Capabilities

### New Capabilities
- `habits`: the habit flag on a recurring task, what a skip records for a habit, how streaks and the month history are derived on the device, and where they are shown.

### Modified Capabilities
- `recurring-tasks`: "Skip an occurrence" gains the habit case (a skipped occurrence record); "End conditions" states that skipped occurrence records do not count towards `for N times`.
- `task-management`: "Task fields" adds the `habit` flag and the `skipped` marker to the field list.
- `filter-queries`: "Priority, state and search terms" adds the `habit` keyword and excludes skipped occurrence records from `completed`.

## Impact

- **Op schema:** `task.habit` and `task.skipped`, both `kBool`, in `internal/sync/ops.go` `Schema` (`:147-179`); `web/src/lib/types.ts` `Task` (`:53-104`), defaults in `web/src/lib/ops.ts` `TASK_DEFAULTS` (`:60-64`), `docs/sync.md` schema table. Not user-written content, so not in `e2ee.ContentFields` or `CONTENT_FIELDS`. No Dexie version bump (no index), no migration.
- **Server:** `RecurringCompletion` excludes skipped records when counting occurrences for `for N times` (`internal/sync/recurring.go:93-104`). The agent tools' task output gains `habit` (`internal/agenttools/data.go:249-268`). No route, no demo deny-list entry. `internal/activity` is unchanged: a skip record derives a "created" event exactly as a completion record does today (`internal/activity/activity.go:193-209`); the two new fields fall under "edited". A fixture op pins that.
- **Web:** `web/src/lib/recurring.ts` (`planSkip` writes the record for habits, `completedOccurrences` ignores skipped records), a new pure module `web/src/lib/habits.ts` (schedule walk, streaks, month grid), `web/src/app/RecurrenceField.tsx` (the habit switch and block), a new `HabitHistory` heat-map component on design tokens, `TaskRow.tsx:134-138` (streak chip), `TaskListView.tsx:126-127` (Completed hides skipped records), `web/src/lib/filter/parse.ts` and `evaluate.ts` (`habit` keyword, `completed` exclusion). Two Lucide glyphs (`flame`, `minus`) added to the bundled sprite.
- **Docs:** `docs/recurrence.md` (reference: habits, skip records, streak rules), `docs/recurring-and-reminders.md` (guide: "Track a habit"), `docs/filters.md` (`habit`), `docs/sync.md`, `docs/api.md` task fields.
- **Size:** no dependency. The streak module and the heat-map are hand-written, an estimated 3–4 KB gzipped on the web bundle; the Go binary grows only by the embedded bundle; runtime memory unchanged (the grid reads the series' records, already in IndexedDB).
