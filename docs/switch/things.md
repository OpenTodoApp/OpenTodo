---
title: Switch from Things
summary: Bring your Things 3 areas, projects, headings, to-dos, checklists and tags to OpenTodo by copying its database.
audience: user
section: Switch from another app
specs: [data-import]
screens: []
order: 20
---
# Switch from Things

Things 3 has no export button, but OpenTodo can read a copy of its database directly. Your areas, projects, headings, to-dos, checklists, tags and notes come with you.

## Copy the Things database

On a Mac, as Cultured Code's support article "Accessing the Things database" describes:

1. **Quit Things.** The copy must be made while the app is closed.
2. In Finder, choose **Go → Go to Folder** and open `~/Library/Group Containers/JLMPQHK86H.com.culturedcode.ThingsMac/`.
3. Open the `ThingsData-…` folder and **copy** (do not move) `Things Database.thingsdatabase` to your Desktop.
4. Right-click the copy, choose **Show Package Contents**, and find `main.sqlite`. Alternatively, compress the whole folder into a ZIP.

On iPhone or iPad, the same article lists a diagnostics code (Settings → General → Diagnostics → Enter Code) that sends `Things Database.aar`. Save it to Files, tap it to unpack it into `Things Database.thingsdatabase`, and use the `main.sqlite` inside.

## Import into OpenTodo

1. Open **Settings → Data → Import data** (or press `g` then `Shift+I`).
2. Choose `main.sqlite` (or the ZIP). The preview shows **Things 3 database**.
3. Check the warnings and select **Import**.

The file is read on your server from a private copy, read-only, and deleted right after the preview or import.

## What carries over

- Areas become parent projects; projects stay inside them.
- Headings become sections; to-dos keep their heading.
- Checklist items become subtasks, completed ones included.
- Tags become labels (nested tags as `parent/child`).
- Notes, the start date ("When") as the due date, and reminder times.
- Repeating to-dos, when OpenTodo's [recurrence rules](../recurrence.md) can express them.
- Completed and canceled items (canceled ones get the label `canceled`).

The full mapping is in [Import formats](../import.md#things-database-things-db).

## What does not

- **Deadlines** are kept as a "Deadline: …" line in the description.
- **Someday** and **This Evening** are not imported as such; the to-dos arrive with a warning.
- Trashed items are skipped.
