---
title: All projects
summary: Every project in a table with its health, progress, open tasks, next due date, people and last change; how health is worked out, sorting and the keyboard.
audience: user
section: Guides
specs: [project-organization, statistics]
screens: [projects#the-table]
order: 17
---
# All projects

<picture><source srcset="images/all-projects-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/all-projects-light.webp" alt="The Projects page: Active and Archived tabs, a find field, and a table listing Home renovation as On track with its progress and three open tasks, and a note on how health is worked out."></picture>

**All** next to **Projects** in the sidebar (or <kbd>g</kbd> then <kbd>Shift</kbd>+<kbd>P</kbd>) opens the **Projects** page. It has two tabs, **Active** and **Archived** (your [archived projects](archived-projects.md)). It also has a field to find a project (<kbd>Enter</kbd> opens the first match), **New project** and **From a template…**.

## The table

The active projects form a table, with sub-projects indented under their parent. For each project you see:

- its **Health** (see below);
- its **Progress**: completed tasks out of all its tasks, where a repeating task counts once;
- how many tasks are **Open**;
- the **Next due** date, in red when it has passed;
- the **People** a shared project is shared with;
- when it was last **Updated**.

A folded project includes its sub-projects in these figures; an unfolded one counts only its own tasks, as in the sidebar. **Collapse all** and **Expand all** are in the page's **⋯** menu. Select a row to open the project.

## Health

Health is one word, worked out on your device from rules you can check, the first that applies:

| Health | When |
|---|---|
| **Late** | An open task's deadline has passed. The task is named, or the number of tasks past their deadline is given. |
| **Overdue** | An open task is due before today. The number of late tasks is given. |
| **Quiet** | Nothing in the project changed for a week. The number of days is given. |
| **On track** | Anything else, while something is open. |

A project with nothing open says **Nothing open**. Completing a task counts as a change, so it wakes a quiet project.

In a shared project, health counts everyone's tasks, because it describes the project. Your [statistics](statistics.md) still count only your own.

Health uses no server, no AI and nothing outside your own tasks. It works offline, and every device shows the same word.

## Sort and move around

Select a column's header to sort by it:
- Health starts with what needs you, and Updated starts with the newest change.
- Select the header again to reverse the order, and a third time to return to your own order.
- Projects are sorted among their siblings, so sub-projects stay under their parent.

Using the keyboard:
- <kbd>↑</kbd> / <kbd>↓</kbd> (or <kbd>k</kbd> / <kbd>j</kbd>) move between projects. <kbd>↓</kbd> in the find field moves into the table.
- <kbd>←</kbd> folds a project, or moves to its parent; <kbd>→</kbd> unfolds it.
- <kbd>Enter</kbd> opens the project.

On a narrow window, the columns at the end give way. A phone shows each project's name and health. There the reason beside the health word ("1 late", the task past its deadline, "9 days") is left out, so the word tells you instead: point at it or focus it to see the reason in a tooltip, or tap it to show the reason under the word and tap again to hide it. Screen readers always read the reason.
