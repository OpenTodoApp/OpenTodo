# GitHub replies (tasks 4.3 and 5.4)

Ready to paste. Posting is the maintainer's: both are public comments.

## Issue #196: CalDAV interop with OpenTodo / Mitra

> Thanks again for the table and for the follow-up on Mitra's fix. Here is where each row stands now that `caldav-interop` (and `caldav-mitra-echo`, #252, for your second comment) is in `main`:
>
> | Case | Now |
> |---|---|
> | Task with due date only | ✅ unchanged |
> | Task with deadline | ✅ served as `DTSTART` = due date, `DUE` = deadline, as before; a client that writes `DTSTART` + `ESTIMATED-DURATION` without `DUE` now moves the due date and keeps the deadline |
> | Recurring task | ✅ served with `DTSTART` = `DUE`; a move without `DUE`, or with the `DUE` Mitra was served, moves the series and keeps the rule, with no deadline |
> | Estimate | ✅ served as `ESTIMATED-DURATION` (`PT1H30M`) and read back |
> | Schedule an undated task in Mitra | ✅ `DTSTART` + `ESTIMATED-DURATION` sets the due date and time; it is served back with `DTSTART` = `DUE`, so Mitra keeps it scheduled |
> | Move a deadline/recurring task in Mitra | ✅ a VTODO without `DUE` never clears the due date or the deadline |
>
> Your second comment: timed tasks are now served with `DTSTART` = `DUE`, and an inbound `DUE` that is exactly the one we served (on a task without a deadline) counts as an echo, so a move never adds a deadline. The Mitra shapes are fixtures in `internal/caldav/testdata/mitra/`.
>
> What is left on Mitra's side is its point 1, reading `DTSTART` = `DUE` with no duration as a task due at that time rather than a zero-length block; your linked commit looks like it covers it.
>
> The full mapping is in [docs/caldav.md](https://github.com/pixari/OpenTodo/blob/main/docs/caldav.md#scheduled-times-and-estimates). If you can try it with your Mitra setup, a short report in #9 would let us mark the Mitra row as verified. Thanks for making both projects better.

## Issue #9: Call for testers

> **CalDAV update.** Thunderbird and todoman (with vdirsyncer) have now been run against a real server; the results are in the verification table of [docs/caldav.md](https://github.com/pixari/OpenTodo/blob/main/docs/caldav.md#limits). The run found one bug, completing a repeating task in Thunderbird's task list, which is fixed.
>
> Still not verified, and reports are very welcome:
>
> - **Apple Reminders** on iOS and on macOS
> - **DAVx⁵** with **Tasks.org**, and with **jtx Board**
> - **Mitra**
>
> **What to try** (a few minutes; use a test project):
>
> 1. In OpenTodo, make four tasks: one due on a date, one due at a time, one with a due date and a deadline, and one that repeats every day. Give the timed one an estimate (`1h`) and a reminder (30 minutes before).
> 2. In the app: check that each shows the right date or time, the timed one its reminder, and the repeating one its repeat.
> 3. In the app: change a title, move the timed task to another day, add a reminder to the dated task, then remove it. Check OpenTodo after each step: dates, the deadline, the estimate and reminders should be as you left them.
> 4. Complete the repeating task in the app. In OpenTodo it should move to the next day, with one entry in Completed.
> 5. Delete a task in the app (it goes to OpenTodo's Trash), and delete another in OpenTodo (it leaves the app after a refresh).
>
> Please comment with the app and its version, your OpenTodo version (`opentodo version`), and which steps worked. Please never paste tokens or passwords.
