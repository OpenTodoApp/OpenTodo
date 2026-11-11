---
title: CalDAV verification script
summary: The steps a tester follows to verify a calendar app or a calendar server against OpenTodo, how to capture what it sent, and how to send the results.
audience: developer
section: Integrations
specs: [caldav-sync, calendar-sync]
screens: []
order: 46
---
# CalDAV verification script

The verification tables in [Calendar apps (CalDAV)](caldav.md#limits) and [Calendar sync](calendar-sync.md#tested-servers) hold one result per client and behaviour. This script is how a result is earned: the same numbered steps on every client, so reports on issue #9 compare. One block below is one column of the table.

## What a cell says

- `works`, with a short note on anything surprising. Only when the block was run on that client version and what the client sent is kept as a fixture and pinned by a test.
- `not supported by <client>: <reason>`, when the client has no way to do it (for example "jtx Board has no alarms on tasks").
- `defect #<issue>`, until the fix lands.
- `not verified (<date>)`, with the date of the last attempt.

A row names the client version, the platform and the date of the run, for example `DAVx⁵ 4.5.3 + Tasks.org 14.2 (Android 15, 2026-11-20)`. `make repo-check` refuses a blank cell, a `not verified` without a date and a row with results but no version or date. From 1.0 on, only the Mitra row may keep `not verified` cells.

## Before you start

1. Run a server you can throw away: `make build` and `./bin/opentodo`, on a fresh data directory. Create the owner account, turn on CalDAV in **Settings → Integrations → Calendar apps (CalDAV)** and create an app password for the client.
2. Create two projects, **Home** and **Work**, and in the app these tasks:
   - **A** in Home, due tomorrow, no time;
   - **B** in Home, due tomorrow at 09:00 in your time zone, estimate 45 minutes, a reminder 30 minutes before;
   - **C** in Home, due in three days, with a deadline in five days;
   - **D** in Home, repeating every day from tomorrow;
   - **E** in Work, with a subtask **E1**, which has its own subtask **E2**.
3. Turn on the client's own HTTP log, which records the request bodies: DAVx⁵ **Settings → Debugging → Verbose logging**; Thunderbird `calendar.debug.log` and `calendar.debug.log.verbose` in the Config Editor; vdirsyncer `-vdebug`. For Apple Reminders and other clients without one, put a recording proxy between the client and the server and save a HAR file. The server does not log bodies.
4. Connect the client as [Client setup](caldav.md#client-setup) says and let it sync.

Each block: do the steps in the client, check OpenTodo, then do the reverse in OpenTodo and check the client after its next sync. Write down what the client showed and what it sent.

## 1. Due forms

1. In the client, check that A shows tomorrow without a time and B tomorrow at 09:00.
2. Create **F** due on a day without a time, and **G** due at 14:30.
3. In OpenTodo, F has that date and no time, G that date and 14:30 (in the zone the client wrote, or the same moment in UTC).
4. Reverse: in OpenTodo give A a time; the client shows it.

## 2. Deadline

1. In the client, look at C: the deadline is served as `DUE`, the due date as `DTSTART`. Note which the client shows and how.
2. Change C's due (or end) date in the client. In OpenTodo, the deadline moved, the due date did not.
3. Reverse: give A a deadline in OpenTodo; note what the client shows.

## 3. Date shapes

1. In the client, clear only the due date of G (keep a start date if the client has one). In OpenTodo, check against [Scheduled times and estimates](caldav.md#scheduled-times-and-estimates).
2. Set a start date different from the due date, if the client can. In OpenTodo, the start is the due date and the due is the deadline.
3. Clear every date of F. In OpenTodo, F has no due date.

## 4. Estimates

1. In the client, look for B's 45-minute estimate (`ESTIMATED-DURATION`). Most clients keep it without showing it: write `kept (not shown)`.
2. If the client can change it, change it; OpenTodo shows the new estimate.

## 5. Alarms both ways

1. In the client, B shows an alarm 30 minutes before.
2. Add an alarm to A, change B's to 15 minutes, and remove one if the client can. In OpenTodo, the reminders follow, never doubled.
3. Reverse: add a reminder to C in OpenTodo; the client shows it.

## 6. Recurrence completion

1. In the client, complete D's current occurrence.
2. In OpenTodo, D moved to its next date and Completed has one occurrence record. If the client sent the next occurrence as a new task, write that down (todoman does).

## 7. Single occurrence

1. In the client, skip or move one later occurrence of D, if it can (Thunderbird can).
2. In OpenTodo, that occurrence is skipped or moved and the series keeps its date ([One occurrence alone](caldav.md#one-occurrence-alone)).

## 8. Moves

1. In the client, move A from Home to Work.
2. In OpenTodo, A is in Work, once, not in the Trash.
3. Reverse: move B to Work in OpenTodo; the client shows it in Work with its alarm.

## 9. Deletion

1. In the client, delete F.
2. In OpenTodo, F is in the Trash.
3. Reverse: delete G in OpenTodo; it disappears from the client.

## 10. Incremental sync

1. Rename C in OpenTodo and let the client sync. Only C changes in the client.
2. Note whether the client asked with a sync token (`sync-collection`) or by comparing ETags; the server log at `OPENTODO_LOG_LEVEL=debug` shows the method and path of each request.

## 11. Subtask hierarchy

1. In the client, E1 shows under E and E2 under E1, if the client nests tasks.
2. Create **H** with a subtask **H1** and a sub-subtask **H2** in the client. In OpenTodo, the same three levels appear in Work.
3. Move E to Home in the client. In OpenTodo, note where E1 and E2 are.
4. If the client cannot nest, write `not supported by <client>` and check that E1 and E2 are still subtasks in OpenTodo after the client saves them.

## Capture the fixtures

Turn the client's log into fixtures with the capture command. It keeps the bodies of PUT requests (`-all` keeps every calendar body), replaces UIDs with placeholders, titles, notes, categories and locations with neutral words, and names, email addresses, URLs and coordinates with placeholders, while property names, parameters and dates stay as the client sent them:

```sh
go run ./internal/caldav/capture davx5.log internal/caldav/testdata/davx5-tasksorg-14.2/
```

It writes `01.ics`, `02.ics`, … and prints the request of each. Rename each file after its step (`new-due-time.ics`, `alarm-changed.ics`, `subtask-three-levels.ics`) and delete the ones no step needs. Read every file before you commit it: the command cannot know what else a client puts in its own properties.

## Calendar sync

The calendar sync table has five columns. Connect the server in **Settings → Integrations → Calendar sync** with tasks A to D above, then:

1. **Connect**: the connection finds the calendars (discovery) and shows them.
2. **Task to event**: B appears as an event from 09:00 to 09:45, A as an all-day event only with **Include tasks without a time** on.
3. **Move or resize back**: move B's event to 11:00 and make it an hour long. In OpenTodo, B is due at 11:00 with a 60-minute estimate.
4. **Delete back**: delete C's event. In OpenTodo, C stays open without a date.
5. **Incremental sync**: rename A in OpenTodo; only its event changes. Note whether the server answered `sync-collection` or the check fell back to comparing ETags.

Keep the server's responses from a proxy's HAR file, sanitised, as replay fixtures under `internal/calsync/testdata/<server>-<date>/`.

## Send the results

Open a pull request with:

- the fixtures in `internal/caldav/testdata/<client>-<version>/`;
- a test in `internal/httpapi/caldav_clients_test.go` that sends each fixture and checks the result the cell claims, like the Thunderbird and todoman tests there;
- the row in [the CalDAV table](caldav.md#limits) or [the calendar sync table](calendar-sync.md#tested-servers), one cell per block;
- an issue for each defect, named in its cell.

`go test ./internal/httpapi -run Clients` and `make repo-check` must pass.
