---
title: Tasks and projects
summary: Add and edit tasks, write notes, break work into subtasks, set priorities and organise everything into projects and sub-projects.
audience: user
section: Guides
specs: [task-management, project-organization, subtasks, manual-ordering, rich-text-editing]
screens: [quick-add#add-a-task]
order: 10
card: project-list
---
# Tasks and projects

A task is one thing to do. A project is a list of tasks that belong together. This guide covers both, from adding a task to arranging projects inside each other.

## Add a task

Press <kbd>q</kbd> anywhere in a task list, type, and press <kbd>Enter</kbd>. The box stays focused so you can add several in a row.

You can fill in details as you type:

```
Order new taps friday #Home @errand p2 +20m
```

This creates "Order new taps", due Friday, in the project Home, with the label errand, priority 2 and an estimate of 20 minutes. Chips under the box show what was understood before you press Enter. The [quick add reference](quick-add.md) has every word and symbol it knows.

New tasks without a project land in the **Inbox**. Tasks added inside a project go into that project, and tasks added in **Today** are due today.

## Edit a task

Click a task, or select it with <kbd>j</kbd> / <kbd>k</kbd> and press <kbd>Enter</kbd>, to open its panel. Every change is saved as you make it; there is no Save button.

<picture><source srcset="images/task-detail-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/task-detail-light.webp" alt="A project list with the task panel open on the right, showing the title, notes, project, section, parent task, assignee, priority and due date."></picture>

In the panel you can change:

- **Title** and **Notes**. Notes can have headings, bold and italic text, links, and bullet, numbered and check lists.
- **Project**, **Section** and **Parent task**, to move it somewhere else.
- **Priority**, from P1 (most important) to P4 (the default).
- **Due**, a date with an optional time.
- **Reminders**, **Estimate** and **Repeat**. See [Recurring tasks and reminders](recurring-and-reminders.md) and [Time blocking](time-blocking.md).
- **Labels**, **Subtasks** and, further down, **Comments** and **History**.

Close the panel with <kbd>Esc</kbd> or the **×** at the top. On a phone the panel covers the list; close it to go back.

### Quick changes from the list

You don't have to open a task to change it. Select it and press:

| Key | Does |
| --- | --- |
| <kbd>1</kbd> to <kbd>4</kbd> | Set the priority |
| <kbd>c</kbd> | Complete or reopen |
| <kbd>L</kbd> | Add labels (type to search, <kbd>Enter</kbd> to add or create) |
| <kbd>e</kbd> | Set the estimate (`20`, `45m`, `1h30`) |
| <kbd>s</kbd> | Schedule it on the Day calendar |
| <kbd>Delete</kbd> | Move it to the Trash |

### Write notes

The notes field formats as you type. Start a line with `- ` for a bullet list, `1. ` for a numbered list, `[ ] ` for a checklist or `# ` for a heading. Select text and press <kbd>Ctrl</kbd>+<kbd>B</kbd> for bold or <kbd>Ctrl</kbd>+<kbd>K</kbd> for a link (<kbd>⌘</kbd> on a Mac). If two of your devices edit the same note at the same time, both sets of changes are kept.

### Dates and times

A due date is just a calendar day, and a time is the time on the clock where you are. A task due Tuesday at 09:00 shows Tuesday at 09:00 on every device, even when you travel.

For things that happen at a fixed moment, like a call with someone in another country, tick **Fixed to time zone** under Due (or press <kbd>z</kbd> with the panel open). The task is then tied to your current time zone, and devices elsewhere show it converted to their local time, with the original time as a hint.

## Complete, reopen and delete

Click the circle next to a task, or press <kbd>c</kbd>. Completed tasks move to **Completed** in the sidebar, where you can reopen them.

Deleting a task (the **Delete** button in the panel, or <kbd>Delete</kbd> in the list) moves it to the Trash, along with its subtasks. You can restore it from there. See [Trash and history](trash-and-history.md).

## Break a task into subtasks

Big tasks are easier as a few small steps. To add one:

- open the task and type in **Add subtask**, or
- select the task in the list and press <kbd>a</kbd>.

Subtasks appear indented under their parent, and the parent shows your progress, like **1/3**. You can nest subtasks inside subtasks.

To turn an existing task into a subtask, select it and press <kbd>Tab</kbd>: it moves under the task above it. <kbd>Shift</kbd>+<kbd>Tab</kbd> moves it back out. You can also pick a **Parent task** in the panel. Use <kbd>←</kbd> and <kbd>→</kbd> to fold and unfold a parent's subtasks.

Completing a parent completes all its open subtasks too. When you tick off the last open subtask, OpenTodo asks whether to complete the parent as well; press <kbd>Enter</kbd> for yes.

## Organise with projects

Projects keep related tasks together. To create one, click **+** next to **Projects** in the sidebar, type a name and choose **Create**. Pick a parent project in the same form to make it a sub-project.

<picture><source srcset="images/project-list-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/project-list-light.webp" alt="The Home renovation project with its tasks grouped under the sections Planning and In progress."></picture>

The **Project** menu at the top right of a project lets you:

- pick a **color**,
- **Move to** another project, or back to the top level (shortcut <kbd>m</kbd>),
- **Rename** it,
- **Archive** it, which hides it and its sub-projects from the sidebar while keeping every task,
- **Delete project**, which moves it to the Trash.

The number next to each project in the sidebar counts its open tasks. When a project with sub-projects is folded, the number includes them.

Inside a project you can also group tasks into sections and show them as a board. That has its own guide: [Sections and boards](sections-and-boards.md).

### Sub-projects

Sub-projects work like folders: "Work" can hold "Q4 launch", which can hold more. A project's page lists its sub-projects at the bottom with their task counts. Use the small arrow next to a project in the sidebar, or <kbd>←</kbd> / <kbd>→</kbd>, to fold and unfold it. Folding is remembered on each device separately.

### When a project is done

When you complete the last open task of a project, OpenTodo offers to archive it; press <kbd>Enter</kbd> to accept or any other key to keep it. Projects that have had no open tasks for 30 days are archived automatically, with a notice you can undo. You can turn that off in **Settings → General → Projects** (each device has its own setting). To bring an archived project back, open **Settings → General → Projects** and select **Restore** next to it under **Archived projects**; see [Trash and history](trash-and-history.md#bring-back-an-archived-project).

## Put things in order

In the Inbox and in projects, you decide the order. Drag a task to a new place (on a touch screen, press and hold first), or select it and press <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>Alt</kbd>+<kbd>↓</kbd>. <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>↑</kbd> sends it to the top. Dropping a task on the middle of another one makes it a subtask. Projects in the sidebar can be reordered the same way.

Today, Upcoming, labels and filters sort themselves by date and priority, so dragging is switched off there.

## Tips

- Keep the Inbox as a landing spot: capture fast, then sort into projects once a day.
- Use priorities sparingly. If everything is P1, nothing is.
- A task with an estimate shows it on the row, like `30m`, which makes it easy to spot quick wins. The **Quick wins** button above most lists shows only tasks of 15 minutes or less.
