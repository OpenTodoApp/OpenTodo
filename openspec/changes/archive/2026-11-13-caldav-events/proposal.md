# Proposal

## Why

CalDAV serves tasks as to-dos (VTODO). Apple's Calendar and most calendar apps put to-dos in a reminders list, where a multi-day task is one tick-off on its Do on date, not an event across its days. People who want their dated tasks in the calendar itself, one calendar per project, have to set up Calendar sync with its own Google or Microsoft app instead (issue #1230, and the CalDAV half of #1160).

## What Changes

- **An app password can serve events.** When creating a CalDAV app password, **Show tasks as: To-dos** (default, today's behaviour) **or Events**. With Events, the same calendars (one per project, the Inbox) are served as event calendars.
- **What an event is:** the same as Calendar sync writes (`calendar-sync` "Tasks written to the calendar", `multi-day-tasks`): a timed task as an event of its estimate (30 minutes without one), a date-only task as an all-day event, a multi-day task as one all-day event over its days, the notes as the description, the task's link as the URL, a recurring task as its next occurrence. Undated and completed tasks are not served.
- **Edits come back as Calendar sync's do:** moving or resizing an event moves the task (its due, start and estimate), renaming it renames the task, deleting it unschedules the task (never deletes it). A new event in an event calendar becomes a task, as today.
- **No completion over events**, since events have none: completing stays in OpenTodo or a to-do app.
- The app password list shows **Events** on such a password; its scope (`sync-scope`) applies as before.

## Capabilities

### Modified Capabilities

- `caldav-sync`: an app password's event mode.

## Impact

`internal/store/migrations` (the marker table `app_password_events`), `internal/httpapi/davroutes` (component set, reports and GET serve VEVENTs in event mode; PUT of a VEVENT over a served event changes only the title, notes and timing), `internal/calfeed` (`WriteEvent` reused), Settings → CalDAV app password dialog, docs (`docs/caldav.md`). No new route, no environment variable.
