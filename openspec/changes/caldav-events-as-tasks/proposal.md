# Proposal

## Why

GitHub issue [#500](https://github.com/OpenTodoApp/OpenTodo/issues/500) (v0.16.0, iPhone): an item created in **iOS Calendar** on the OpenTodo account disappears after saving and never reaches OpenTodo. An existing iCloud event moved to the OpenTodo account disappears too. The same account works from **iOS Reminders**.

Calendar writes events (`VEVENT`) and Reminders writes to-dos (`VTODO`). The CalDAV endpoint refuses every `VEVENT` with `403 supported-calendar-component`, as the `caldav-sync` spec requires. iOS shows the item, gets the refusal, and silently drops it. On a move, iOS first deletes the event from the calendar it came from, so the refusal loses the event. Someone who saves an item to their task server means "this is something to do". A refusal that silently loses data is the worst possible answer.

## What Changes

- An event PUT into an OpenTodo calendar becomes a **task** instead of being refused:
  - its title, description and alarms map as they do for a to-do;
  - its start is the task's due date, with the time when the event is timed;
  - a timed event's length is the estimate;
  - a repeat rule becomes the task's repeat rule where the task grammar can express it.
- The server then serves the object back as a `VTODO` under the same name and UID. Calendar apps drop it from their calendar view on their next sync, and it shows in OpenTodo and in task apps such as iOS Reminders. Nothing is lost.
- Journals and free/busy objects stay refused. One object holding both a to-do and an event is still invalid.
- Collections keep advertising `VTODO` only: the server never serves events.

No op schema, migration or environment variable change. Not **BREAKING**: a client that sent events used to get a refusal, and now gets a task.

**Out of scope:**
- serving tasks as events (the read-only calendar feed and calendar sync already do that);
- per-occurrence overrides of a recurring event, which are ignored as they are for to-dos;
- mapping an event's free-text location onto the task's map location, which needs coordinates. The text is kept as client data, as it is for a to-do.

ROADMAP.md: no numbered row. A fix to the shipped CalDAV sync (`caldav-sync`, `caldav-interop`).

Fixes #500.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `caldav-sync`: "Writes become operations" now covers a `VEVENT` read as a task, and its invalid-data scenario no longer lists `VEVENT`. A new requirement, "Events become tasks", states the mapping and its scenarios.

## Impact

- **Code:**
  - `internal/caldav/decode.go`: the master component may be a `VEVENT`, with the timing mapped into the existing shapes;
  - `internal/caldav/vtodo.go`: the error texts.
  - The HTTP write path (`internal/httpapi/davroutes/write.go`) is unchanged: the decoded result is the same `Inbound` a to-do produces.
- **Tests:**
  - decoder tests with an Apple Calendar fixture (`testdata/apple-calendar-event.ics`);
  - an endpoint test, `TestEventsBecomeTasks`;
  - the updated invalid-data test.
- **Docs:** `docs/caldav.md`, `CHANGELOG.md`.
- **Dependencies:** none.
