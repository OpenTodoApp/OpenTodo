---
title: Switch from Notion
summary: Bring the tasks of your Notion databases to OpenTodo with Notion's Markdown & CSV export, choosing which column holds the status, due date, tags and priority.
audience: user
section: Switch from another app
specs: [data-import]
screens: []
order: 120
---
# Switch from Notion

Notion task databases have columns you named yourself, so OpenTodo guesses which column is which and lets you change each choice before importing. Each database becomes a project; its rows become tasks, with the page of each row as the task's description.

## Export from Notion

1. Open the page that holds your task database (or the database itself) in Notion.
2. Open the **•••** menu at the top right and choose **Export**.
3. Pick **Markdown & CSV**, turn on **Include subpages**, and select **Export**. Notion saves a ZIP (for a large workspace it may email a link to it). Keep the ZIP as it is; do not unpack it.

You can also export your whole workspace from **Settings → Workspace → General → Export all workspace content**: every database in it becomes a project.

## Import into OpenTodo

1. Open **Settings → Data → Import data** (or press `g` then `Shift+I`).
2. Choose the ZIP. The preview shows **Notion (Markdown and CSV export)**.
3. Under **Which column holds what**, check the column chosen for the done or status, due date, labels, priority, project and notes. Change any of them, or choose **Not imported**; the preview updates right away.
4. Check the warnings and select **Import**.

A single CSV file from Notion is not recognised on its own, because it looks like any spreadsheet. Choose **Notion (Markdown and CSV export)** as the format to import it the same way, without the pages.

## What carries over

- Each database becomes a project named after it. Rows become tasks.
- The page of a row becomes the task's description: its text, checklists, links and images (as links).
- Sub-items stay under their parent item.
- **Done or status**: rows whose status is Done, Complete, Completed or Archived (or a ticked checkbox) arrive completed.
- **Due date**: Notion's dates with or without a time; a date range gives the start date and the due date.
- **Labels**: each tag of a multi-select becomes a label.
- **Priority**: High, Urgent or P1 become priority 1, Medium or P2 priority 2, Low or P3 priority 3.
- **Project**: a relation or select naming a project puts the task in that project instead of the database's.
- **Notes**: a text column is added to the top of the description.
- Each task remembers its Notion page, so importing the same export again skips what is already there.

The full mapping is in [Import formats](../import.md#notion-notion-csv).

## What does not

- Columns you leave as **Not imported**, and every other column (people, numbers, formulas, rollups, files): the preview names them once.
- People assigned to a task: an import only adds tasks to your account; [share the project](../sharing.md) and assign them again.
- Pages that are not rows of a database, and comments.
- Files and images stored in Notion: their links stay in the description, but the files are not copied.
