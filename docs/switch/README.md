---
title: Switch from another app
summary: Every task app OpenTodo imports from, what comes with you and what stays behind, and when each import was last checked against a real export.
audience: user
section: Switch from another app
specs: [data-import]
screens: []
order: 1
---
# Switch from another app

Whichever app you use now, your tasks can come with you. Every import shows a preview first and can be undone.

## Switching from…

Open **Settings → Data → Import data** and choose your app under **Switching from…** at the top (type a few letters to find it). Choosing one does three things:

- it shows the app's export steps right there (on a phone, select **Show steps**),
- it sets the format to that app's, so the file you pick next is read that way,
- it links to the **Full guide** for the app, below.

If the file you then pick looks like another app's export, the preview says so and offers to read it as that format. On an end-to-end encrypted account, imported text is stored in plaintext until one of your unlocked devices encrypts it again, and duplicates cannot be found by encrypted project or label names; the picker says so. With no app chosen, the screen works as before.

## Migration matrix

Each app has a guide with its export steps. **Last verified** is the day the import was last checked against a file the app made, and the app version.

| App | Format id | What comes with you | What stays behind | Last verified |
| --- | --- | --- | --- | --- |
| [Todoist](todoist.md) | `todoist-backup` | projects, sections, subtasks, labels, priorities, descriptions, estimates, due dates and times, recurring dates, reminders, deadlines; comments in the description | assignees | 2026-10-14, Todoist web (backup format of that date) |
| [TickTick](ticktick.md) | `ticktick-csv` | folders and lists, board columns, tasks, subtasks, checklists, tags, priorities, dates, reminders, repeats, completed and abandoned tasks | attachments, habits, focus records, comments | 2026-10-14, TickTick 7.2 |
| [Things 3](things.md) | `things-db` | areas, projects, headings, to-dos, checklists, tags, notes, dates and reminder times, deadlines, Someday, This Evening, repeats, completed and canceled items | trashed items | 2026-10-14, Things 3 (database version 29) |
| [OmniFocus](omnifocus.md) | `omnifocus-csv` | projects, actions and action groups, tags, due, defer and planned dates, estimates, flags, notes | repeat rules, folders, attachments, review intervals (not in the CSV) | 2026-11-03, OmniFocus 2 export and the OmniFocus 4.7 layout |
| [Any.do](anydo.md) | `anydo-json` | lists, tasks, subtasks, notes, high priority, due dates, repeats, tags, reminders, completed tasks | deleted tasks, shared lists' members, attachments, My Day | 2026-10-21, Any.do data request (format of that date) |
| [Microsoft To Do](microsoft-todo.md) | `microsoft-todo-json` | lists, tasks, steps as subtasks, notes, importance, categories, due and start dates, reminders, most repeats, linked resources | some monthly repeats and repeat end dates, file attachments | 2026-10-21, Microsoft Graph To Do API v1.0 |
| [Google Tasks](google-tasks.md) | `google-tasks-json` | lists, tasks, subtasks, notes, due dates, completed tasks, links | repeat rules (Takeout has only the next date), deleted tasks | 2026-10-21, Google Takeout (format of that date) |
| [Apple Reminders](apple-reminders.md) | `apple-reminders-json` | lists, reminders, subtasks, notes, priorities, flags, tags, URLs, due dates, completed reminders | repeats, early reminders, locations, images, sections (not readable by Shortcuts) | 2026-10-21, iOS 26 Shortcuts |
| [Vikunja](vikunja.md) | `vikunja-export` | projects and sub-projects, Kanban buckets, tasks, labels, repeats, reminders, subtasks, dependencies, comments, attached files | end dates, assignees, colours, saved filters | 2026-11-03, Vikunja 2.7.1 and 0.22.1 |
| [Trello](trello.md) | `trello-json` | boards as projects shown as boards, lists, cards, labels, checklists, dates, comments, links, your assignments, custom fields | uploaded files, other members, Power-Up data, stickers, votes | 2026-10-21, Trello board JSON (format of that date) |
| [Asana](asana.md) | `asana-csv` | the project, sections, tasks, subtasks, notes, tags, priorities, dates, dependencies, your assignments, other columns as custom fields | other assignees, collaborators, comments, attachments | 2026-10-21, Asana project CSV (format of that date) |
| [Notion](notion.md) | `notion-csv` | databases as projects, rows with their pages, sub-items, and the status, date, tag, priority, project and notes columns you choose | other columns (people, formulas, rollups), files stored in Notion, pages outside databases | 2026-11-03, Notion Markdown & CSV export (layout of five published exports) |
| [Super Productivity](super-productivity.md) | `super-productivity-json` | projects, tags, tasks, subtasks, archived tasks, dates, deadlines, estimates, tracked time, repeats, GitHub issue links | boards, metrics, focus history, settings | 2026-11-03, Super Productivity 19.3.1 |
| [Tududi](tududi.md) | `tududi-db` | areas, projects with their notes, tasks, subtasks, tags, priorities, dates, repeats, the inbox | notes without a project, attachments, task relations | 2026-11-03, Tududi 1.14.0 |
| [Linear](linear.md) | `linear-csv` | projects or teams, statuses as sections, issues, sub-issues, priorities, labels, due dates, estimates, dependencies, your assignments | other assignees, comments, attachments | 2026-10-14, Linear workspace CSV (format of that date) |

## Other apps

Taskwarrior, Donetick, Sunsama, Akiflow, Morgen, Motion and other apps have no import of their own. Export a CSV or JSON from them and import it with the generic formats: the [CSV columns](../import.md#csv-csv) cover every field OpenTodo has, and the [JSON shapes](../import.md#json-generic) read most task lists.
