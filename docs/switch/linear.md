---
title: Switch from Linear
summary: Bring your Linear issues to OpenTodo with their projects, statuses as board columns, priorities, labels and sub-issues.
audience: user
section: Switch from another app
specs: [data-import]
screens: []
order: 40
---
# Switch from Linear

OpenTodo is a good fit for small teams and personal work that want speed without process. Your issues come with their projects, statuses, priorities, labels, due dates and sub-issues.

## Export from Linear

Linear exports a workspace's issues as one CSV file from its workspace settings (look for **Import / Export**).

## Import into OpenTodo

1. Open **Settings → Data → Import data** (or press `g` then `Shift+I`).
2. Choose the CSV file. The preview shows **Linear export (CSV)**.
3. Check the warnings and select **Import**.

<picture><source srcset="../images/import-linear-dark.webp" media="(prefers-color-scheme: dark)"><img src="../images/import-linear-light.webp" alt="The import preview of a Linear CSV export: the detected format, how many projects, sections and tasks will be created, and the first issues with their project and status."></picture>

Each project opens as a board on this device, with one column per status.

## What carries over

- Projects (or teams, for issues without a project).
- Statuses become sections, in the order they appear, so the board shows the same columns.
- Titles, and descriptions that start with the issue identifier (`ENG-123`), so you can still find it.
- Priorities (Urgent, High, Medium, Low and No priority become p1–p4), labels and due dates.
- Sub-issues as subtasks.
- Completed issues; canceled ones are completed with the label `canceled`.
- Issues assigned to you stay assigned to you.

The full mapping is in [Import formats](../import.md#linear-linear-csv).

## What does not

- **Blocked by** relations between issues in the export become [Blocked by](../tasks-and-projects.md#wait-for-another-task) on the tasks. Estimates (points), cycles, milestones, initiatives, SLAs and the other issue relations (related, duplicate) are dropped with a warning.
- Issues assigned to other people arrive unassigned; [share the project](../sharing.md) and assign them again.
- Comments and attachments are not part of the CSV export.
