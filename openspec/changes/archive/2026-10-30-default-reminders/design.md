# Design

## Context

A reminder (`internal/sync/ops.go` `reminder`) has a kind (`relative`, `absolute`, `deadline`), an offset in minutes and a resolved `fire_at`; a relative reminder fires at the due time plus the offset, 09:00 local for a date-only due. Every device that changes a task's due recomputes its relative reminders in the same batch (`reminderFollowUps` in `web/src/lib/ops.ts`, `reminderOpsForTask` in `internal/httpapi/push.go`, the agent tools' `ExtraOps` hook). Reminders live in their creator's personal scope; `followSharedDueChanges` recomputes one's own reminders when another member moves a shared task. `user_prefs` is one synced row "me" in the personal scope that the server can read (`internal/httpapi/quickadd.go`, `internal/rules/engine.go`). The CLI creates reminders after the task with `POST /api/v1/reminders`. `ids.NameID` / `nameId` give the same id on every side for the same name.

## Goals / Non-Goals

**Goals:** opt-in defaults that produce real reminders (so push, the shells, CalDAV and every device see them), applied exactly once per task and person, identically in TypeScript and Go.

**Non-Goals:** a derived "virtual" reminder, deadline defaults, defaults for others' tasks, backfilling existing tasks.

## Decisions

### D1: Two synced `user_prefs` strings

`reminder_default_timed` and `reminder_default_dated`, empty meaning none. The value is the offset in minutes as a decimal string (`"-30"`, `"0"`, `"-1440"`); a malformed or out-of-range value (beyond ±`MaxReminderOffset`) reads as none and is kept. Strings rather than numbers because "none" must differ from `0` (at the due time) and every other `user_prefs` field already follows the "unknown reads as the default" rule. Synced, not per device: the issue is about not missing things on any device, and the server needs to read them for agent and REST writes.

*Alternative:* a per-device setting: the phone and the laptop would add different reminders to the same task, and the server could never apply it.

### D2: Materialised, not derived

The default becomes an ordinary `relative` reminder op written with the task's due. A derived reminder (computed at firing time from the preference) would need the push scheduler, the Android/iOS shells, the CalDAV alarm mapping and every client to learn a second kind of reminder, could not be deleted on one task, and would change retroactively when the preference changes. A real reminder costs a handful of ops per scheduled task and works everywhere already.

### D3: The trigger: a task gains a due date

The rule (`defaultReminderChanges` in TS, `defaultreminder.Plan` in Go) runs on one write by one person and returns the reminder changes to add to that write's batch. It adds a reminder when all hold:
1. the write sets `due` on a task whose stored due was null (a create with a due counts; a due moved from one day to another does not);
2. the person's default for that kind of due (timed: `due.time` set; dated: no time) is set;
3. the task is neither completed nor deleted, and is not a habit (a daily habit would remind every day; decided 2026-10-29);
4. the task has no live `relative` reminder, neither stored nor in the same batch (a quick-add "remind me 30 min before", `ot add --remind` or a CalDAV alarm wins);
5. no reminder with the default id exists, live or deleted (D4), except one that Undo removed (deleted with no offset, see D4).

The reminder gets `kind: relative`, the default offset, `fire_at` computed from the new due (09:00 local for a date-only due, as today), `created_at` now. Recurring tasks are tasks like others: one reminder, which follows each next occurrence through the existing due follow-up. Habits are excluded.

### D4: A name-based id makes it once per task

The id is `nameId('default-reminder', userId + '\0' + taskId)` (Go `ids.NameID`). Two devices that schedule the same undated task offline write the same reminder id, so after sync there is one reminder (per-field last-writer-wins on identical values). A default reminder the person deleted keeps its tombstone, and condition 5 stops it from coming back when the due is cleared and set again. Undo is different: the person took back the whole write, not the reminder, so Undo tombstones the default reminder it added and also clears its `offset_minutes`; a deleted default reminder without an offset does not block, and the next due date writes it again in full (the tombstone is lifted by `deleted_at: null`). The user id in the name keeps two members of a shared project apart, since reminders are personal.

### D5: Following the kind of due

When a write changes a task's due between date-only and timed, and the reminder with the default id is live, `relative`, and its offset still equals the default of the old kind, its offset becomes the default of the new kind (if set; otherwise it is left alone) and `fire_at` is recomputed in the same batch. A reminder the person edited no longer matches and is never touched. Clearing the due keeps the reminder without a firing time (existing rule).

### D6: Where the rule runs

| Writer | Applies | How |
|---|---|---|
| Web app: quick add, task panel, date pickers, schedule menu, calendar and Plan drag, bulk Set date, Close-the-day carry-over, templates, the assistant's applied change sets, share capture; Android and iOS shells (same web app) | yes | `mutateMany` adds `defaultReminderChanges` next to `reminderFollowUps`, reading `user_prefs` from Dexie |
| Undo, redo, history restore, Trash restore | no | these restore earlier values; the batch is marked restorative (`MutateOptions.restore`) and skipped. An undoable action (`applyBatch`) adds the default reminder to its own batch first, so the Undo entry removes it with the date |
| Changes pulled from the server | no | the writing device already applied it |
| MCP and agent tools (`create_tasks`, `schedule_tasks`, any tool that sets `due`), and REST writes with an `agent` token (they run through the same tools) | yes | the `ExtraOps` hook calls `defaultreminder.Plan`, device `agent:<token-id>` |
| REST `POST /api/v1/tasks`, `PATCH /api/v1/tasks/{id}` | only with `?default_reminder=true` | opt-in so scripts, n8n and Home Assistant keep today's behaviour |
| CLI `ot add`, `ot edit` | yes, unless `--no-default-reminder` or `--remind` | sends the query flag |
| Browser extension | yes | its `api.js` sends the query flag |
| CalDAV PUT, calendar sync, issue import, importer, Markdown vault (raw sync), automation rules, email capture | no | they write what their source says; a calendar client has its own alarm defaults, and adding one would echo a second alarm into it |

### D7: Shared vectors

`web/src/lib/defaultReminder.vectors.json` lists cases (before task, patch, existing reminders, prefs, zone offset → expected reminder ops or none) for D3 and D5, read by `web/src/lib/defaultReminder.test.ts` and `internal/defaultreminder/defaultreminder_test.go`, like `inbox.vectors.json`. The Go package is a leaf (imports `zoned` and `ids` only).

### D8: Settings

Settings → Notifications → push page (`notifications/push`), a "Default reminders" card above the device's push card and outside the demo's disabled block (it touches no server feature): two selects, "Tasks with a time" and "Tasks with no time", each with the presets above and Custom… (a number with minutes/hours/days before, reusing the reminder editor; for a date-only due, days before at 09:00). One help line: "Added when a task gets a date. You can remove it from any task." The reminder menu in the task panel is unchanged; a default reminder shows there like any other.

## Data model, size and budget

Two additive `user_prefs` fields; no reminder field, no migration, no route (one optional query parameter on two existing routes, under their current policies: `signedIn`, writes refused to `read` tokens). Not content, not encrypted, no activity event for the preference; the reminder appears in the task's history like any reminder, attributed to the writing device. No dependency; negligible size and memory. Interface budget: one settings card; no list chrome, task property, sidebar destination, scroll region or shortcut. Progressive disclosure: both defaults start at None, so Simple-list users see nothing new.

## Risks / Trade-offs

- [Bulk scheduling 200 undated tasks adds 200 reminders] → that is the asked behaviour; it stays within the bulk batch limit (one reminder op set per task), and one Undo removes the reminders with the dates.
- [Push storms from imports] → the importer never applies it (D6).
- [A shared task scheduled by a teammate has no reminder for me] → by design (reminders are personal and the teammate's device cannot write mine); noted as a later idea (defaults for tasks assigned to me).
- [Older clients] → they ignore the new `user_prefs` fields and do not apply the rule, but they keep and move the reminders others created; mixed devices converge.
- [Server time zone for date-only dues] → the server uses the person's last known zone (`tzLocation`), as for every server-computed relative reminder; the next device that changes the due recomputes it locally.

## Open Questions

- (Resolved 2026-10-29, DECISIONS.md 0.17) Habits are excluded. Automation rules and teammates' scheduling on shared tasks apply no default.
