---
title: Switch from Asana
summary: Bring an Asana project to OpenTodo from its CSV export, with sections, subtasks, tags, dates, priorities, dependencies and custom fields.
audience: user
section: Switch from another app
specs: [data-import]
screens: []
order: 70
---
# Switch from Asana

Each project comes with its sections, subtasks, tags, dates, priorities, dependencies and custom fields.

## Export from Asana

1. Open the project and its menu (the arrow next to the project name).
2. Choose **Export/Print → CSV**.
3. Repeat for each project. The file name becomes the project name in OpenTodo, so rename the file if you like. Several project files in one ZIP import together.

## Import into OpenTodo

1. Open **Settings → Data → Import data** (or press `g` then `Shift+I`).
2. Choose the CSV file (or the ZIP). The preview shows **Asana project (CSV)**.
3. Check the warnings and select **Import**.

<picture><source srcset="../images/import-asana-dark.webp" media="(prefers-color-scheme: dark)"><img src="../images/import-asana-light.webp" alt="The import preview of an Asana project CSV: the detected format, the project with its sections and new fields, and the first tasks."></picture>

When every task has a section (a board project in Asana), the project opens as a board on this device.

## What carries over

- Sections, in the order they appear.
- Task names, notes (as the description) and subtasks.
- Tags as labels; High, Medium and Low priority as p1, p2 and p3.
- Due dates (with the time when there is one), start dates, completion and creation times.
- Dependencies: a task blocked by another task in the same file becomes [Blocked by](../tasks-and-projects.md#wait-for-another-task) it.
- Tasks assigned to you stay assigned to you.
- Every other column becomes a [custom field](../custom-fields.md) of the project: numbers become a number field, Yes/No a checkbox, dates a date field, a column with ten different values or fewer a choice, and anything else text. The preview shows how many fields will be created.
- Each task remembers its Asana task id (`origin: asana`).

The full mapping is in [Import formats](../import.md#asana-asana-csv).

## What does not

- Tasks assigned to other people arrive unassigned, and collaborators are dropped; [share the project](../sharing.md) and assign them again.
- A task that is in several projects is imported once, into this project.
- Comments, attachments, likes and approvals are not in Asana's CSV.
- A field's type cannot be changed later; if a column became the wrong type, delete the field and create it again.
