---
title: Switch from TickTick
summary: Move your TickTick folders, lists, columns, checklists, tags, priorities, dates and reminders to OpenTodo.
audience: user
section: Switch from another app
specs: [data-import]
screens: []
order: 30
---
# Switch from TickTick

Your folders, lists, board columns, checklists, tags, priorities, due dates, reminders and repeating tasks come with you.

## Export from TickTick

TickTick creates a backup as one CSV file from its settings (look for **Backup**). Download it; it is named like `TickTick-backup-2026-10-14.csv`.

## Import into OpenTodo

1. Open **Settings → Data → Import data** (or press `g` then `Shift+I`).
2. Choose the CSV file. The preview shows **TickTick backup (CSV)**.
3. Check the warnings and select **Import**.

<picture><source srcset="../images/import-ticktick-dark.webp" media="(prefers-color-scheme: dark)"><img src="../images/import-ticktick-light.webp" alt="The import preview of a TickTick backup: the detected format, how many projects, sections and tasks will be created, and the first tasks with their list and dates."></picture>

Lists you used as a board (kanban) open as boards on this device.

## What carries over

- Folders become parent projects; lists become projects inside them.
- Board columns become sections.
- Checklists become a task with one subtask per item; checked items are completed.
- Subtasks, tags, descriptions and priorities (high, medium, low, none become p1–p4).
- Due dates and times as you saw them, all-day tasks as dates.
- Reminders and repeat rules, when OpenTodo's [recurrence rules](../recurrence.md) can express them.
- Completed tasks; abandoned ones are completed with the label `canceled`.

The full mapping is in [Import formats](../import.md#ticktick-ticktick-csv).

## What does not

- Attachments, habits, focus records and comments are not part of the CSV backup.
- Repeat rules OpenTodo cannot express are dropped with a warning; the task is kept.
