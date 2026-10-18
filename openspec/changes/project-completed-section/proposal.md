## Why

Issue #145: a completed task leaves its project's list and only appears in the global Completed view. For lists that are ticked off and reused (groceries, packing), people coming from Microsoft To Do expect the completed items to stay in the same list, in a closed "Completed" part at the end, so they can open it later and untick what they need again. Today the only way is a saved filter or the global logbook. A section whose tasks are all done already offers "n completed" with Show, but only for that case.

While building it, a visual bug showed up: a completed task's circle carried both the priority ring and the ticked style, which set the same border and background, and the ring won, so completed rows looked unticked (the white check sat on a pale background) in the logbook, in a revealed section and in the task panel.

## What Changes

- A per-project "Show completed tasks" switch in the Project menu, offered in the list layout. It is a preference of this device, like the board layout and the columns layout, and is off by default.
- With it on, the project's list ends with a "Completed" group: closed by default with its count on the heading, newest completion first when opened, its open or closed state remembered on the device. Completing a task moves it into the group; unticking one there reopens it and it returns among the open tasks.
- With it on, sections no longer offer their own "n completed" and Show, since the group holds those tasks.
- A completed task's circle shows the filled check without the priority ring, in list rows and in the task panel.

## Impact

`web/src/lib/sections.ts` and `liveData.ts` (the preference), `lib/listGroups.ts` (order and open key), `app/task-list/useListModel.ts`, `ListGroups.tsx` and `TaskListView.tsx` (the group), `app/ProjectHeader.tsx` (the switch), `app/TaskRow.tsx` and `task-detail/TaskDetail.tsx` (the check). One new string, translated in the five shipped languages. No data, sync or API change: the preference is device-local Dexie meta and is never synced. New guide page `docs/completed-in-projects.md` with its screenshot. No bundle size change beyond a few hundred bytes.
