---
title: Switch from Tududi
summary: Bring your Tududi areas, projects, tasks, subtasks, tags, notes and repeats to OpenTodo by uploading a copy of its database.
audience: user
section: Switch from another app
specs: [data-import]
screens: []
order: 140
---
# Switch from Tududi

Tududi keeps everything in one SQLite database file, and OpenTodo can read a copy of it. Your areas, projects, tasks, subtasks, tags, project notes and repeats come with you.

## Export from Tududi

Tududi has no export button; you copy its database file. Whoever runs your Tududi server does this:

1. **Stop Tududi** (for example `docker stop tududi`), so the file holds everything and is not changing while you copy it.
2. Copy the database file out of Tududi's data folder. With the Docker image it is `production.sqlite3` in the volume mounted at `/app/db` (`docker cp tududi:/app/db/production.sqlite3 .` works too). Without Docker it is the file `DB_FILE` points to, `backend/db/production.sqlite3` by default.
3. Start Tududi again. You can compress the file into a ZIP to upload it faster.

## Import into OpenTodo

1. Open **Settings → Data → Import data** (or press `g` then `Shift+I`).
2. Choose `production.sqlite3` (or the ZIP). The preview shows **Tududi (database)**.
3. Check the warnings and select **Import**.

The file is read on your server from a private copy, read-only, and deleted right after the preview or import.

## What carries over

- Areas become parent projects; projects stay inside them. A done or cancelled project arrives archived.
- Project descriptions and the notes of each project become the project's notes.
- Tasks, with subtasks under their parent task. Tasks placed directly in an area land in that area's project; tasks without a project go to your Inbox (or the project you choose as the target).
- Items of Tududi's own inbox that you have not processed yet become tasks in your Inbox.
- Priority: high becomes priority 1, medium 2, low 3, none 4.
- Due dates with their time, start dates, estimates, reminders and task notes. Comments are added under the note with their date.
- Done and archived tasks arrive completed; cancelled tasks too, with a warning. In-progress, waiting and planned tasks stay open.
- Tags become labels. The built-in `someday` tag parks a task in Someday.
- Tasks on your latest Today plan that have no due date are due on the day you import, with a warning.
- Repeats: daily and every N days, weekly on chosen weekdays, monthly on a day, on the 1st–4th or last weekday and on the last day, repeat after completion, and the end date.
- Each task remembers its Tududi id, so importing the same database again skips what is already there.

The full mapping is in [Import formats](../import.md#tududi-tududi-db).

## What does not

- Notes without a project are named in the preview but not imported; copy them into a project's notes.
- Tags on projects (OpenTodo projects have no labels; the tasks keep theirs).
- Repeats every 2 or more weeks on chosen weekdays become "every N weeks" with a warning; other combinations the [rule grammar](../recurrence.md) cannot say are dropped with a warning.
- Attachments (their files are not in the database), task relations, habits' streaks, goals and people.
