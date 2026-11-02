## Why

With a Today limit on and Today full, capturing "send the form today by 4" puts the task in **Waiting for a slot**. That is right (nothing planned is displaced), but the group is folded and shows only a count, so a time-sensitive task can sit there unseen until its time has passed (#766, community feedback). A closed list must never hide a deadline.

## What Changes

- While the Waiting for a slot group is folded, the waiting tasks due today with a time, or with a deadline today, are listed under its heading, soonest first, each with its time (or "Deadline") and **Take a slot** right there. At most three are listed; "n more with a time" opens the group.
- The folded heading names the next one: "Waiting for a slot · 4 — next: Send the form, 4:00 PM" (a deadline without a time: "next: File the taxes, deadline today"), as part of the toggle's accessible name.
- Opened, the group is as before: every waiting task in fill order, with the hint.
- The fill order is unchanged (first come, first served; nothing moves automatically). Take a slot keeps its rules: refused with the usual message while every slot holds a focus or taken task, and Give back the slot undoes it.
- `ot today` prints the same under its Waiting heading (the count, the next task, the time-sensitive tasks soonest first) and `--json` adds `time_sensitive` to each waiting task.
- `today_summary` marks each waiting task with `time_sensitive` and returns `waiting_time_sensitive`, their ids soonest first.
- The rule is one pure function in `web/src/lib/closedList.ts` and `internal/closedlist`, checked by the shared vectors.

Out of scope: reordering slots by time or priority, moving a task whose time has passed into Earlier the same day (Earlier stays date-based, so it does from the next day), notifications. Advances no ROADMAP.md row; it refines the shipped `today-closed-list` (#766). No **BREAKING** change: no op field, no environment variable.

## Capabilities

### New Capabilities

### Modified Capabilities
- `today-closed-list`: time-sensitive waiting tasks shown under the folded Waiting for a slot heading.
- `cli-client`: `ot today` shows the time-sensitive waiting tasks and marks them in `--json`.
- `mcp-server`: `today_summary` marks time-sensitive waiting tasks.

## Impact

`web/src/lib/closedList.ts`, `closedList.vectors.json`, `listGroups.ts`, `web/src/app/task-list/ListGroups.tsx` and the new `WaitingSoon.tsx`, `web/src/ui/patterns/ListGroupHeader.tsx` (a `detail` prop), the six catalogues; `internal/closedlist`, `internal/cli/closedlist.go`, `internal/agenttools/read_closedlist.go`; docs `today-limit.md`, `cli.md`, `mcp.md`. No data model, API route, dependency or measurable bundle change.
