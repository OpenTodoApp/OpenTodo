---
title: Switch from Super Productivity
summary: Bring your Super Productivity projects, tags, tasks, subtasks, repeats and tracked time to OpenTodo with its backup file.
audience: user
section: Switch from another app
specs: [data-import]
screens: []
order: 130
---
# Switch from Super Productivity

Super Productivity can save all your data as one backup file. OpenTodo reads it: your projects, tags, tasks and subtasks, archived tasks, repeats and the time you tracked come with you.

## Export from Super Productivity

1. In Super Productivity (desktop, web or mobile), open **Settings → Sync & Backup**.
2. Under **Import/Export**, select **Export data**. The app saves a JSON file such as `sp-backup_2026-11-03.json`.

## Import into OpenTodo

1. Open **Settings → Data → Import data** (or press `g` then `Shift+I`).
2. Choose the JSON file. The preview shows **Super Productivity (backup JSON)**.
3. Check the warnings and select **Import**.

## What carries over

- Projects; archived projects arrive archived. Tasks in Super Productivity's Inbox go to your Inbox (or the project you choose as the target).
- Tasks with their notes, subtasks, done tasks with when they were done, and archived tasks (completed).
- Tags become labels.
- Planned days and planned times become due dates and times, in the time zone you choose in the preview. Deadlines and reminders come too.
- Time estimates, rounded up to the minute.
- Tracked time: each day of a task's time becomes one [time entry](../time-tracking.md) on that day, starting at 09:00 and as long as you tracked, so your totals per task and project stay the same.
- Repeats: daily, weekly on chosen weekdays, monthly, yearly, every N days, weeks, months or years, and "after I complete it".
- Tasks from a GitHub issue keep a link to the issue.
- Each task remembers its Super Productivity id, so importing the same backup again skips what is already there.

The full mapping is in [Import formats](../import.md#super-productivity-super-productivity-json).

## What does not

- Tracked time keeps its total per day, not the clock times: the backup does not store when you worked.
- Paused repeats, and repeats on chosen weekdays every 2 or more weeks (imported as "every N weeks"), come with a warning.
- Links to issues of other trackers when the backup does not say where they are.
- Boards, metrics, counters, focus mode history, plugins and the app's settings.
