---
title: Places
summary: The seven homes a task can have in Open Loops - Inbox, Next, Waiting, Scheduled, Later, Someday and Projects - and the screen and keys for each.
audience: user
section: Open Loops
specs: [method-views, start-dates]
screens: [next#the-next-and-waiting-views, waiting#the-next-and-waiting-views]
order: 7
---
# Places

Every task lives in exactly one Place. The Place says what the task is waiting for: a decision, a moment, a person, or just you.

| Place | Means | Where you see it |
| --- | --- | --- |
| **Inbox** | Caught, not yet decided. | Inbox (<kbd>g</kbd> <kbd>i</kbd>), triage (<kbd>g</kbd> <kbd>p</kbd>) |
| **Next** | The next action of every project, by context. | Next (<kbd>g</kbd> <kbd>Shift+N</kbd>) |
| **Waiting** | Waits for someone or something else first. | Waiting (<kbd>g</kbd> <kbd>Shift+W</kbd>) |
| **Scheduled** | Has a day: Today and Upcoming. | Today (<kbd>g</kbd> <kbd>t</kbd>), Upcoming (<kbd>g</kbd> <kbd>u</kbd>) |
| **Later** | Not before its start date. | The Later group of its project |
| **Someday** | Maybe one day: parked without a date. | Someday (<kbd>g</kbd> <kbd>o</kbd>) |
| **Projects** | Outcomes that take more than one step. | The sidebar's Projects |

## How a task moves between Places

- Clarifying moves a task out of the **Inbox**.
- A task in a project is in **Next** when it is the project's first actionable task. The others wait their turn in the project's own list.
- Assigning a task to someone else, or making it wait for another open task with **Blocked by**, puts it in **Waiting**. Completing the blocker brings it back.
- A due date puts it in **Scheduled**; a future start date in **Later** until that day comes.
- **Someday** keeps it out of the way until a review promotes it.

## The Next and Waiting views

**Next** (<kbd>g</kbd> <kbd>Shift+N</kbd>) lists the next action of every project you can edit, grouped by context (labels starting with `@`; a task with two contexts is under both, one without under **Anywhere**). **Waiting** (<kbd>g</kbd> <kbd>Shift+W</kbd>) lists open tasks assigned to someone else, under each person, then the ones blocked by another open task, each naming what it waits for. Both are under **More** in the sidebar, can be pinned there in **Settings → Appearance**, and can be the view a device opens on. The list keys work as in any list, offline too.

## Projects without a next action

A project is **without a next action** when none of its open tasks can be done now, waits for someone or another task, or starts later. A project is **stalled** when it has open tasks, the oldest created more than three weeks ago, and nothing in it was completed in the last three weeks. The weekly review and the Loop home show both, and the weekly email digest lists the first.
