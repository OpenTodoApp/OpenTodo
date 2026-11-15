# Proposal

## Why

Today is the only screen that fails the interface audit's layout shift rule (M12, limit 0.1), at 360 and at 768 px (GitHub issue [#1383](https://github.com/OpenTodoApp/OpenTodo/issues/1383)). Just after the screen opens, the briefing under the title grows by a line and the quick add and the whole list move down: 20 px on a phone, 44 px on a tablet. On a phone that is a list moving under the finger.

The cause, measured: the list is drawn as soon as the tasks are read, and the briefing is worded from whatever else has been read by then. The notifications are read by a separate local query that answers a frame or two later, so "One thing matters today. Water the plants is 2 days late." becomes "Two things matter today. … and 2 replies are waiting." after the list is on screen.

## What Changes

- **A day page is drawn once its briefing can be worded whole.** Today and Upcoming wait for the local reads the sentence is made of (the tasks, the cached notifications, the review row, the preferences) before they draw anything, the same gate that already waits for the tasks. All of them are asked for in the same render and answered from the device, so nothing waits for the network.
- **A hidden briefing never flashes.** The preference that hides the briefing is read before the page is drawn.
- **The audit measures a device that has synced.** A new browser context is a device that never synced; the tour now waits for its first sync to end before the first capture, so M12 measures how a screen opens, not the first sync's notifications arriving from the server.

Out of scope: what a sync brings later (a reply that arrives while Today is open still makes the sentence longer, as a new task makes the list longer); the counts on a row (comments, attachments) and a slot's time, which are read after the rows are drawn and can wrap one title; the project screen's own late parts (reported in the design); the Assistant's Ask button, which arrives in the header's row without moving anything below it.

Advances the ROADMAP item "Shells that feel native" (the phone reads like an app: a screen opens in place).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-list-presentation`: a new requirement, "A day page opens with its briefing".

## Impact

- `web/src/app/task-list/useListReady.ts` (new, the list's gate moved out of `TaskListView.tsx`), `web/src/app/Briefing.tsx` (`useBriefing` answers `undefined` while it reads), `web/src/lib/localData.ts` (`useNotificationsRead`), `web/src/app/TaskListView.tsx`.
- `scripts/ux-audit/tour.mjs`: each browser context waits for `ot:sync-idle` before its first capture.
- No data, op, route, setting or string changes. No dependency.
- No screenshot changes: the settled screens are the same.
