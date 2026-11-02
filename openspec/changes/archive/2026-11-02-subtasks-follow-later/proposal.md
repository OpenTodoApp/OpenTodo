# Proposal

## Why

GitHub issue #755 (item 6, reported by Seventy-9DegreesNorth): a task with a date was deferred to Later. The parent moved to its project's **Later** group, but its subtasks stayed in the old group, at the top level with only a breadcrumb, so they looked cut off from their parent. The detail panel still showed them under it.

The cause: a project list put every deferred or parked task in Later one by one, and built the main list's tree from the rest. A subtask whose parent was in Later had no parent in that tree, so it became a top-level row there. The same happened the other way round: a deferred subtask of an active parent left its parent and sat alone in Later. Grouping by date, priority or label already keeps each subtree together under its top-level task (`list-display-options`); Later did not.

## What Changes

- In a project list (and display mode's project page), a subtree goes where its **top-level task** goes. A deferred or parked top-level task takes all its open subtasks into Later, nested under it as in the rest of the list, each keeping its own dates and chips (a subtask due tomorrow still shows "Tomorrow").
- A deferred or parked subtask of an active parent stays under its parent, with its "Starts" or "Someday" chip.
- The Later group is a tree: its parents fold and unfold like any other parent.
- Today, Upcoming, Anytime, Someday and the counts do not change: they decide per task, as before.

Nothing is written: this is how the list is drawn from local data, so it is the same offline and on every device.

Not **BREAKING**: no op field, no environment variable.

## Out of scope

- The other five suggestions of #755 (a Today list to drag tasks into, printing, renaming Projects, a workspace switcher, section colours) are tracked in their own issues.
- Moving a parent's subtasks to its date when it is rescheduled (the dates stay as the user set them).

## Roadmap

Community bug report, GitHub issue #755 (item 6). Not a ROADMAP.md row.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `subtasks`: a new requirement, "Subtasks in a project's Later group".
- `start-dates`: "Deferred tasks" and "Someday" say that a subtask is listed in Later with its top-level task, not on its own.

## Impact

- **Web:** `lib/listGroups.ts` (`splitLater`, the Later group as a tree), `app/task-list/useListModel.ts`, `app/display/DisplayScreen.tsx`; a story in `app/taskList.stories.tsx`.
- **Bundle:** a few hundred bytes; no dependency.
- **Docs:** `docs/deadlines-and-start-dates.md`, `docs/group-and-order.md`.
