---
title: Switch from Todoist
summary: Move your Todoist projects, sections, subtasks, labels, priorities and dates to OpenTodo in a few minutes.
audience: user
section: Switch from another app
specs: [data-import]
screens: []
order: 10
---
# Switch from Todoist

Your projects, sections, subtasks, labels, priorities, due dates and recurring tasks come with you. It takes a few minutes, and you can undo the whole import with one click.

## Export from Todoist

Use a **backup**: it holds every project and keeps their names.

1. In Todoist, open its settings and find **Backups**.
2. Download the latest backup. It is a ZIP file such as `Todoist_backup_2026-09-19.zip`.

A single project can also be exported as CSV from the project's menu, but a lone CSV file does not say which project it was, so its tasks go to the project you choose when importing.

## Import into OpenTodo

1. Open **Settings → Data → Import data** (or press `g` then `Shift+I`).
2. Choose the ZIP file. The preview shows **Todoist backup (ZIP)** and lists every project, section and task.
3. Check the warnings, choose a time zone if your tasks have times, and select **Import**.

<picture><source srcset="../images/import-todoist-dark.webp" media="(prefers-color-scheme: dark)"><img src="../images/import-todoist-light.webp" alt="The import preview of a Todoist backup: the detected format, how many projects, sections and tasks will be created, and the first tasks with their project and labels."></picture>

Projects that were boards in Todoist open as boards on this device. Your other devices receive everything on their next sync.

## What carries over

- Projects, sections and subtasks (by their indent), in the same order.
- Priorities: Todoist's red flag is p1, as you saw it.
- Labels written in tasks (`@errands`), removed from the title.
- Descriptions and estimates (task durations in minutes).
- Due dates and times, in the language you used Todoist in (English, German, French, Italian, Spanish or Portuguese). Dates without a year take the year of the backup.
- Recurring dates such as `every monday` or `jeden Montag`, when OpenTodo's [recurrence rules](../recurrence.md) can express them.
- Reminders with a time or an offset.

The full mapping is in [Import formats](../import.md#todoist-todoist-csv-todoist-backup).

## What does not

- **Comments** are added to the task's description under "Comments", because their authors cannot be kept.
- **Deadlines** are kept as a "Deadline: …" line in the description; OpenTodo has no deadline field yet.
- **Assignees** are dropped; invite people and [share the project](../sharing.md) instead.
- Dates or rules OpenTodo cannot read leave the task without a due date, with a warning that quotes them.

Changed your mind? [Undo the import](../import.md#jobs-limits-and-undo) from the list of past imports.
