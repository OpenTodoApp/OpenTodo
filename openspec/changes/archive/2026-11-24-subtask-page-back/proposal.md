# Back from a subtask's page

## Why

#1952 (Joonas12334): after opening a task as a page and then one of its subtasks, the browser's Back skipped the parent and went to the list. Opening any task from a task page replaced the page's history entry, which only stepping through the list with `j` and `k` should do.

## What Changes

- Opening a subtask, the parent or a related task from a task page adds a history entry, so Back returns to the task it was opened from. `j` and `k` still open in place.
- Each task page's entry records how many task pages were opened over the first one, so Escape and Close still go back to the list's own entry in one step.
- The phone bar's Back is unchanged: it returns to the list, as Escape does.

## Out of scope

- Remembering a list position per task page, or a Back that walks through stepped tasks.

Advances no ROADMAP.md row; a fix to the task page (task-full-page). No new field, no new string, no op-log or API change, no new environment variable.
