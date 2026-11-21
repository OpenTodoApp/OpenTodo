# Change: Edit when a completed task was completed

## Why

A task ticked off at the wrong moment keeps the wrong completion time
forever: there is no way in the app to fix it afterwards. The reporter
(issue #1667, via Discord) wants to retroactively edit the done timestamp
of a ticked-off task. The completion day drives the Completed logbook
grouping, the statistics and the streaks, so a wrong timestamp misplaces
the task everywhere it is counted.

## What Changes

- A completed plain task (no recurrence rule, no series) shows its
  completion as a **Completed** part on the task panel's When line and as a
  Completed row in the panel's Schedule facts, reading
  `Completed 14 Oct, 3:04 PM`.
- Activating the part opens an editor with a day and a time of day,
  prefilled from the completion. Every pick commits at once, as the date
  picker does; the inputs refuse a future day or time, and a write is
  never later than now.
- Clearing the part reopens the task, the same as unchecking it.
- A task with a recurrence rule or a series shows no Completed part:
  its completions live on occurrence records, and editing them is out of
  scope.
- The Completed logbook, statistics and streaks follow the new value
  with no further change: they are all computed from `completed_at`.
- The server already accepts a past `completed_at` on
  `PATCH /api/v1/tasks/{id}`; a Go test pins that the value sticks and
  stamps `completed_by`.
- One line in the user guide's "Complete, reopen and delete" section and
  one changelog fragment under `Added`.

## Capabilities

- `web-app`: the Completed part, its editor, and the logbook following
  the edited day (spec delta).

## Design

- The part is built by `facetsOf` in `web/src/lib/facets.ts` (the When
  line) and surfaced in the panel facts by `TaskFacts.tsx`; the editor
  is a new `CompletedEditor.tsx` opened from `PartEditor` in
  `Facets.tsx`. The write is `updateTask(id, { completed_at: ms })`
  through the ops layer; a patch without `completed_by` stamps it in
  the same batch, and a `null` patch deletes it, so the editor needs
  no new op, endpoint or schema.
- The editor reuses the existing `Day`, `Time`, `Save` and `Cancel`
  messages and the `at`/`hhmm` helpers from `TimeTab.tsx`, so no new
  translated string is added.
- Recurring tasks are excluded in `facetsOf` (`task.recurrence` or
  `task.series_id` set), matching how `updateTask` carries patches to
  occurrences for a task with a recurrence rule.

## Impact

- Affects: the task panel (one new part and editor), the Completed
  logbook grouping, statistics and streaks (all derived, no code
  change), one Go test, one web test, one guide line, one changelog
  fragment.
- Does not affect: the sync schema, the ops schema, any other surface
  that reads `completed_at` (the Activity tab already shows the time
  from the same value), translations, or the bundle budget (one small
  component, no dependency).
