# Proposal

## Why

Most of the tasks people keep in a task manager repeat: take out the bins, pay rent, water the plants, review the backlog every other Tuesday. Today each repetition has to be recreated by hand, which is the single biggest reason users of commercial apps say they cannot switch. Recurrence is also the feature most likely to go wrong in a multi-device, offline-first system, because two devices can complete the same occurrence without seeing each other; it needs a design that converges by construction rather than by luck.

## What Changes

- An additive `recurrence` field on tasks holding a human-readable rule such as `every day`, `every weekday`, `every last weekday`, `every 2nd tuesday`, `every 3 days after completion`, optionally ending with `until 2026-12-31` or `for 10 times`. The rule is validated by the server and the client against one shared grammar.
- Completing a recurring task records the completed occurrence and moves the task to the next occurrence instead of closing it; the last occurrence (end condition reached) completes normally. This modifies the "Complete and reopen" requirement of `task-management`.
- Completion-relative rules compute the next occurrence from the completion date; calendar rules compute it from the schedule; overdue recurring tasks catch up to the first future occurrence instead of piling up.
- Skip an occurrence without recording a completion.
- Edits apply to the series by default; "this occurrence only" detaches the current occurrence into a standalone task.
- Convergence rule: the completed-occurrence record has an id derived from the series id and the occurrence date, and all devices compute the same next due date, so two devices completing the same occurrence offline end with one completion and one next occurrence.
- Detail panel gains a recurrence field with suggestions and a live preview of the next three occurrences; task rows show a repeat indicator.

Out of scope: natural-language quick-add of rules ("water plants every 3 days" typed into quick add belongs to `nlp-quick-add`; this change ships the grammar it will reuse), iCalendar RRULE import or export (`caldav`), projected future occurrences in Upcoming beyond the next one, per-occurrence notes or history views (`trash-and-history`), rules relative to a time zone (`absolute-datetimes`).

This change advances ROADMAP.md section 4, "Recurring rules incl. 'every last weekday', 'every 3 days after completion'" (`recurring-tasks`).

Not **BREAKING**: two additive task fields (`recurrence`, `series_id`); no field is renamed; no new environment variable.

## Capabilities

### New Capabilities
- `recurring-tasks`: the rule field and its grammar, next-occurrence computation for calendar and completion-relative rules, end conditions, skipping, series versus occurrence edits, convergent completion, and how recurring tasks appear in views.

### Modified Capabilities
- `task-management`: "Complete and reopen" is extended so completing a task with a recurrence rule records the occurrence and reschedules the task, and reopening a completed occurrence yields a standalone task.

## Impact

- Op schema: `task.recurrence` (string or null, validated by the grammar) and `task.series_id` (id string or null) in `internal/sync/ops.go`, `web/src/lib/types.ts`, defaults in `web/src/lib/ops.ts`.
- A rule parser and next-occurrence calculator implemented twice (Go for validation and REST, TypeScript for the client) and kept identical by a shared fixture file of test vectors.
- Client data layer: completion, skip and detach helpers that emit the deterministic occurrence record.
- Views: Completed shows occurrence records; Today/Upcoming show the series task once; a repeat indicator in rows.
- Docs: `docs/recurrence.md` (grammar reference), `docs/sync.md` schema table, `docs/api.md` field list.
- No new dependencies; bundle growth estimated at 4 KB gzipped for the parser and calculator.
