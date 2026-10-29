# Proposal

## Why

Today a reminder exists only if the person adds it to each task by hand, so a meeting planned at 15:00 or a bill due on Friday is easy to miss because the reminder was forgotten (issue #546). Todoist, TickTick and Apple Reminders all offer a default reminder for timed tasks, and TickTick one for all-day tasks too; the issue asks for both, with the same choices as the reminder menu plus Custom.

## What Changes

- **Two synced defaults** in Settings → Notifications, on a "Default reminders" card: one for tasks **with a time** (None, At the due time, 10 minutes before, 30 minutes before, 1 hour before, 1 day before, Custom…) and one for tasks **with a date only** (None, On the day at 09:00, 1 day before, 2 days before, 3 days before, 1 week before, Custom…). Both start at None, so nothing changes until a person opts in.
- **Applied when a task gets a due date.** When a person's write gives a task that had no due date a due date (creating a dated task, scheduling an undated one, dragging it onto the calendar, quick add, bulk Set date), the device adds one ordinary relative reminder with the matching default in the same batch, unless the task already has a relative reminder or got one in the same write. It is a real reminder: visible and removable in the task's Reminders, delivered by push and the Android/iOS shells, served to CalDAV clients as an alarm, and synced like any other.
- **Once per task.** The default reminder has an id derived from the person and the task, so two devices scheduling the same task offline create one reminder, and a default reminder the person deleted is not added again when the task is rescheduled.
- **It follows the kind of due.** If a task with an untouched default reminder gains or loses its time, the reminder switches to the other default (when that one is set), so "1 day before" for an all-day task does not become "1 day before 15:00" by accident.
- **Server-side writers that act for the person** apply the same rule from the same shared logic: the MCP and agent write tools (`create_tasks`, `schedule_tasks`), and the REST task routes when the caller asks with `?default_reminder=true`, which `ot add` and `ot edit` and the browser extension send.

Out of scope: default reminders for deadlines, for tasks assigned to me by someone else, per-project defaults, location reminders, and applying the default to tasks that already have a due date today (no backfill). CalDAV PUTs, calendar sync, issue import, the importer, the Markdown vault, automation rules and email capture do not apply it (they write what their source says; email tasks have no due date).

Advances ROADMAP-1.0 milestone 0.17 "Calm constraints", item `default-reminders`.

Fixes #546

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `reminders`: new requirements "Default reminder preferences", "Default reminder when a task gets a due date", "Default reminder follows the kind of due" and "Default reminders through the API, the CLI and agents".

## Impact

- **Data model and op schema:** two additive `user_prefs` string fields, `reminder_default_timed` and `reminder_default_dated` (empty = none, else a whole number of minutes relative to the due time, at most `MaxReminderOffset` before or after; malformed reads as none). Added to `internal/sync/ops.go` `Schema`, `web/src/lib/types.ts` (generated) and `USER_PREFS_DEFAULTS` in `web/src/lib/ops.ts`. No new reminder field: default reminders are ordinary `relative` reminders with a name-based id.
- **Sync:** the reminder is written in the same batch as the due change (offline first, one upload); concurrent schedulings converge on one reminder through the shared id; the existing "relative reminders follow the due time" rule keeps it in step afterwards. Reminders stay personal: a member scheduling a shared task gets their own default, never another member's.
- **E2EE:** no content; `user_prefs` and reminders are not encrypted, so the server can apply the rule for agent and REST writes on encrypted accounts too.
- **API, CLI, MCP:** `POST /api/v1/tasks` and `PATCH /api/v1/tasks/{id}` accept the optional query parameter `default_reminder=true|false` (default false: scripts and integrations behave as today); `ot add`/`ot edit` send it unless `--no-default-reminder` or `--remind` is given; MCP write tools apply the rule. No new route.
- **CalDAV:** a default reminder is served as a `VALARM` through the existing alarm mapping; CalDAV writes never create one.
- **Shared logic:** a small Go package `internal/defaultreminder` and `web/src/lib/defaultReminder.ts`, pinned by `web/src/lib/defaultReminder.vectors.json`.
- **Size:** no dependency; a few kilobytes of code on each side.
