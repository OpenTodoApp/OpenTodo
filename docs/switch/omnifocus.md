---
title: Switch from OmniFocus
summary: Bring your OmniFocus projects, actions, action groups, tags, dates, estimates and flags to OpenTodo with OmniFocus's CSV export.
audience: user
section: Switch from another app
specs: [data-import]
screens: []
order: 25
---
# Switch from OmniFocus

OmniFocus can export what you see as a CSV file. OpenTodo reads it: your projects, actions and action groups, tags, dates, estimates, flags and notes come with you.

## Export from OmniFocus

On a Mac:

1. In OmniFocus, open the **Projects** perspective and show everything you want to bring: choose **View → Show All** (or set the filter to **All**), and expand the folders. The export contains only what the window shows.
2. Choose **File → Export**, pick **Comma Separated Values (CSV)** as the format, and save the file. **CSV UTF-16** works too.

On iPhone or iPad, open **Settings → Database → Export to CSV**.

## Import into OpenTodo

1. Open **Settings → Data → Import data** (or press `g` then `Shift+I`).
2. Choose the CSV file. The preview shows **OmniFocus (CSV)**.
3. Pick the time zone you used OmniFocus in (OmniFocus writes its dates in UTC), check the warnings and select **Import**.

## What carries over

- Projects; done and dropped projects arrive archived, on-hold projects active with a warning.
- Actions, and action groups as tasks with subtasks, in their project. Actions outside a project go to your Inbox (or the project you choose as the target).
- Tags (or the context of OmniFocus 2) become labels.
- Due dates with their time, defer dates as start dates, and completion dates. With OmniFocus 4.7's planned dates, the planned date becomes the due date and the due date the [deadline](../tasks-and-projects.md#deadlines).
- Estimated durations, flagged actions as priority 1, and notes.
- Each action remembers where it came from, so importing a newer export of the same database skips what is already there.

The full mapping is in [Import formats](../import.md#omnifocus-omnifocus-csv).

## What does not

- Repeat rules are not in OmniFocus's CSV. Set the repeats again after importing; the preview says so.
- Folders, attachments, review intervals, and the order of a sequential project are not in the file either. Folders can be recreated as parent projects; [project flows](../project-flows.md) make a project sequential again.
- Items hidden in the window when you exported are not in the file.
