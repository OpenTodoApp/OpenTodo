---
title: Time tracking
summary: Track the time you spend on a task with a start and stop, add past work by hand, compare it with the estimate, and export it as a CSV.
audience: user
section: Reference
specs: [web-app, statistics, time-tracking]
screens: []
order: 25
---
# Time tracking

A task can carry an [estimate](time-blocking.md); time tracking records what it actually took. Each stretch of work is one **time entry**: when it started, when it ended (nothing while it runs) and an optional note. Entries are stored on your device first, work offline and sync like your tasks.

## Start and stop

- In any task list, select a task and press <kbd>y</kbd> to start tracking it; press <kbd>y</kbd> again to stop. With the task panel open, <kbd>y</kbd> acts on the open task.
- The row's actions menu (<kbd>.</kbd>) and the panel's **⋯** menu offer **Start tracking** or **Stop tracking**.
- Only one entry runs at a time: starting another task ends the running entry at that moment.
- Completing the task you are tracking stops the entry in the same step.

Completed and deleted tasks offer no start, and viewers of a shared project cannot track.

## The running indicator

While an entry runs, the sidebar footer shows the elapsed time and the task's name, `1:05 · Write the report`, with a **Stop** button; activate it to open the task. On a phone the bar shows the time as a pill that opens a sheet with **Open** and **Stop**. The time counts in minutes, then as hours and minutes from one hour, and turns to a caution colour after 12 hours in case you forgot to stop. Screen readers hear it once when tracking starts and once when it stops.

If you stop the entry on another device, the indicator disappears here after that device syncs.

## The Time tab

The task panel's **Time** tab lists the task's entries, newest first, with their day, times, duration and note, and in a shared project who tracked each one. It shows the total, **Start tracking** or **Stop tracking**, and **Add time**:

- Type a duration, `45m`, `1h30` or `90` (minutes). On today it ends now; on another day it ends at 17:00.
- Or choose **Enter a start and an end** and type both times.
- Add a note if you like.

An end before the start is refused. The **⋯** menu of each of your own entries edits its start, end and note, or deletes it. Other members' entries can be read, not changed. The start, the end and the note are separate fields, so edits made on two devices at once are both kept.

## Tracked against estimated

Once a task has entries, its row shows the tracked time with the estimate, `35m / 1h`, or `35m tracked` without one. In Detailed rows it replaces the estimate chip; in Calm rows it sits in the quiet group at the end of the row. A running entry counts up to the current minute. Rows and the Time tab show the task's total, everyone's entries included.

Today's header adds `3h planned · 1h 20m tracked`: the estimates of the open tasks listed, and your own entries that started today, each counted whole on the day it started even across midnight, with your [day start](dates-and-times.md#when-a-day-ends) applied.

## Statistics, filters and quick add

- [Statistics](statistics.md) shows the time you tracked in the period, per day and per project.
- The filter terms `tracked` and `tracked > 1h` list tasks by their tracked time; see [Filter queries](filters.md).
- In [quick add](quick-add.md#time-spent), `30m/2h` means 30 minutes already spent and a two-hour estimate.

## Export

**Export time entries** in Statistics downloads a CSV of the chosen period, made on your device. Its columns are `date`, `start`, `end`, `minutes`, `task`, `project`, `labels` (joined by `;`) and `note`, then one column per custom field of the projects present. Times are in your time zone, a running entry has no end and counts up to the export, and the file starts with a byte-order mark so spreadsheets read it as UTF-8. The server writes the same file for `ot time export` and the API; see [Command-line client](cli.md#time) and the [HTTP API](api.md#time-entries).

## Shared projects and encryption

In a shared project every member reads every entry, and each entry names its author. Only the author edits an entry; the author, project admins and the owner can delete it. Statistics and Today count only your own entries.

With [end-to-end encryption](e2ee.md) the note is encrypted on your device; the times stay readable so the server can total and export them. The server's CSV and AI assistants then show `[encrypted]` for the note.
