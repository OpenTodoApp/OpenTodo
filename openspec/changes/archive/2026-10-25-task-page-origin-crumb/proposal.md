# The task page's first crumb leads back to where the task was opened

## Why

Opening a task from Today, Upcoming, a label or a saved view shows a breadcrumb that starts with the task's project, or, for a task without a project, with the list's name as plain text. Neither leads back: the project crumb goes to the project instead of the list the task came from, and the plain text is not a link at all. On a wide screen only Close and Esc returned to the list, so people looking for "back" at the start of the breadcrumb were stuck (reported by the owner from Today).

## What Changes

- When a task is opened from a list, the breadcrumb starts with that list's name ("Today", a view's or label's name) as a link. It returns like Esc and Close: to the same list, the task selected, the scroll restored.
- The project crumb follows it and still opens the project. Opened from the task's own project, the project is the first crumb and leads back the same way, so it is not shown twice.
- Without a trail (a link, a reload), a task without a project starts with **Inbox** as a link to the Inbox with the task selected, instead of plain text.
- The phone is unchanged: its bar already has Back with the list's name.

Not **BREAKING**: no op, API or storage change.

## Impact

- `web/src/app/TaskPage.tsx` (whether the trail starts at the task's project), `web/src/app/task-detail/TaskPageView.tsx` (the crumbs).
- Tests `web/src/app/taskPage.test.tsx`.
- `docs/task-panel.md`, CHANGELOG.
