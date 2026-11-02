## Context

Today's closed list (`today-closed-list`) fills the slots first come, first served and folds the rest into Waiting for a slot. The fill is derived on the device from local rows (D1 there); the only write is Take a slot on the review row.

## Decisions

### D1. Which tasks are time-sensitive, and their order
A waiting task is time-sensitive when it is due today with a time (the wall time in the user's zone, so a zoned due counts on the local day it falls on), or when its deadline is today. They are ordered soonest first: by time, then the deadlines without a time (read as the end of the day), ties in fill order. A task due today with a time and a deadline today sorts by its time. The rule reads the waiting tasks in fill order and returns ids with their time; it never changes the fill. It is `timeSensitive` in `web/src/lib/closedList.ts` and `TimeSensitive` in `internal/closedlist`, with cases in `closedList.vectors.json`.

A task whose time today has passed stays in the list (first, being the soonest) until the day ends; from the next day Earlier's usual rule applies and Earlier comes before the other tasks in the fill order. Rejected: moving it into Earlier or into a slot when the time passes (that would reorder the slots on a clock tick, which the issue rules out).

### D2. The folded group
`listGroups` adds `soon` (the time-sensitive tasks) and `detail` ("next: Send the form, 4:00 PM", with the account's time format) to the Waiting group while it is folded; opened, neither is set and the group renders as before. `ListGroupHeader` takes `detail`: muted words after the count, inside the toggle (so its name reads "Waiting for a slot, 4 open tasks, next: Send the form, 4:00 PM", WCAG 2.5.3) and truncated before the label is. Under the heading `WaitingSoonList` lists at most three: a fixed time column in tabular figures ("Deadline" for a deadline without a time), the title as a button that opens the task, and a small ghost **Take a slot** button named "Take a slot for <title>" that runs the same `runTakeSlot` (refused with the usual toast while Today is full). Beyond three, "n more with a time" opens the group. An undecryptable title reads "Untitled", as rows do.

### D3. CLI and agent tools
`ot today` prints "Waiting for a slot · n", with "— next: <title>, <HH:MM>" and the time-sensitive tasks (time or "deadline", short id, title) when there are any, then the waiting table in fill order as before; `--json` adds `time_sensitive` to each waiting task. `today_summary` sets `time_sensitive` on each waiting task and adds `waiting_time_sensitive` (ids, soonest first). Both use `closedlist.TimeSensitive` over the same fill.

## Data model

None: no op field, entity or migration; nothing new is written.

## Interface budget

No row of chrome above the list's first item: the additions sit inside Today's last groups. No new task property on rows, no destination, scroller or shortcut. At 360 px the time column is 4 rem, the title truncates and the button keeps its label; the heading truncates the detail first.

## Size

A few hundred bytes of code in the Today chunk; no dependency.

## Risks

Many timed tasks waiting: the list stops at three with a way to see the rest. A clock tick never reorders anything, so the list is stable while the user acts on it.
