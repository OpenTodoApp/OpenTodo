# A move to the Inbox puts the task in the Inbox

## Why

GitHub issue #2137: a task added while Today is on screen gets today's date, so it is not an Inbox task (`project-organization` "Inbox is the default container": no project and not scheduled). Dragging it onto Inbox in the sidebar did nothing: the drop only writes `project_id: null`, and the task already had none, so no operation was written and no toast appeared. A dated task dropped there from a project lost its project but kept its date, so it went to Today or Upcoming instead of the Inbox. The task panel also named the place "Inbox" for every task without a project, so the reporter saw "Inbox" on a task the Inbox did not list. No data was lost; the tasks were out of sight of the Inbox and the process flow.

## What Changes

- Every move to the Inbox (a drop on the sidebar's Inbox, "No project" in the task panel's project picker, the list's inline project field, a title edit, bulk Move to the Inbox) clears the project and the schedule (do-on date, start, time sector, evening, part of the day) in one batch with Undo, so the task is an Inbox task.
- A repeating task keeps its date, since clearing it would end the series; the toast says it stays scheduled because it repeats.
- The task panel says "No project" for a task without a project that is not in the Inbox, and Today's and Upcoming's "by project" grouping heads such tasks "No project".

No new mandatory environment variable, no change to the op log format, routes or stored fields.

## Out of scope

- A drop into a list's "No project" group (for example Today grouped by project): it changes the project only and keeps the date, since the list is a date view.
- Moves through REST, MCP, CalDAV or the CLI, which write exactly what they are sent.
- Subtasks that carry their own date: they follow the parent's project as before and keep their date.

ROADMAP.md: none (a bug fix).

## Capabilities

### Modified Capabilities

- `project-organization`: a move to the Inbox unschedules the task; "No project" names a task without a project outside the Inbox.
