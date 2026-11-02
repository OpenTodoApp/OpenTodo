## Why

Today's folded **Waiting for a slot** group lists the waiting tasks with a time today (#766, #770). A task whose time has already passed looked exactly like one still to come, and the heading's "next:" could name it ("next: Call the school, 9:00 AM" at noon). Community feedback after 0.20.0 asked for an explicit overdue state for these tasks, and for "next" to name the next one that is actually still ahead.

## What Changes

- In the folded list, a time-sensitive task whose time today is before now shows its time in the danger tone that overdue dates use, followed by **Time passed**. It stays in its place, soonest first, and keeps Take a slot.
- The heading's "next:" names the first one whose time has not passed (a deadline today without a time never passes during the day). When every one has passed it says so: "time passed: Call the school, 9:00 AM" for one, "2 past their time" for more.
- The list follows the clock: it is read again on each minute boundary while tasks wait. "Now" is the wall time of the logical today, so after midnight and before the day start every time of that day has passed.
- `ot today` uses the same heading words, adds "(time passed)" to those lines, and `--json` adds `time_passed` to each time-sensitive waiting task. `today_summary` adds `time_passed` to each time-sensitive waiting task.
- The rule stays one pure function in `web/src/lib/closedList.ts` and `internal/closedlist`, with `now` and `passed` in the shared vectors.

Out of scope: moving a passed task into Earlier or into a slot (the fill order stays first come, first served), notifications, and reordering by time. Advances no ROADMAP.md row: a follow-up to `today-waiting-time-sensitive` (#766, #770). No **BREAKING** change: no op field and no environment variable.

## Capabilities

### New Capabilities

### Modified Capabilities
- `today-closed-list`: a passed time is marked, and "next" skips it.
- `cli-client`: `ot today` marks passed times and names the next one still ahead; `--json` `time_passed`.
- `mcp-server`: `today_summary` marks `time_passed`.

## Impact

`web/src/lib/closedList.ts`, `closedList.vectors.json`, `listGroups.ts`, `web/src/app/task-list/WaitingSoon.tsx`, `useClosedList.ts`, `useListModel.ts`, the six catalogues; `internal/closedlist`, `internal/cli/closedlist.go`, `internal/agenttools/read_closedlist.go`, `read.go`, `data.go`; docs `today-limit.md`, `cli.md`, `mcp.md`. No data model, API route or dependency.
