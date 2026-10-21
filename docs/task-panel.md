---
title: The task panel
summary: Everything in a task's panel: the title and its menu, the notes, the property chips and the Add menu, what a viewer can do, and how to close it.
audience: user
section: Guides
specs: [task-management, entity-pickers]
screens: [task-panel]
order: 11
---
# The task panel

<picture><source srcset="images/task-detail-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/task-detail-light.webp" alt="A project list with the task panel open on the right: the checkbox and title at the top, the notes, the project breadcrumb, then chips for the due date, priority and the other set properties, with Add beside them."></picture>

Click a task, or select it with <kbd>j</kbd> / <kbd>k</kbd> and press <kbd>Enter</kbd>, to open its panel. Every change is saved as you make it; there is no Save button.

## The top of the panel

The top of the panel stays in view while you scroll: the task's **checkbox**, its **title** (edit it in place), a **⋯** menu with **Copy link**, **Expand** (the task as a full page), **Open parent task**, **Open recurring task**, **Start tracking** (or **Stop tracking**), **Break this down** and **Delete**, and the **×** that closes it. Below is **Notes**: one quiet line until you click it, then an editor with headings, bold and italic text, links, and bullet, numbered and check lists (see [Write notes](notes-and-subtasks.md#write-notes)).

## Properties as chips

Then come the task's properties as chips. A chip reads its value ("Thu 15 Oct · 09:00", "P2", "in 9 days"); only the properties that have a value are shown, plus **Do on** and **Priority**, which are always there. Click a chip, or <kbd>Tab</kbd> to it and press <kbd>Enter</kbd>, to open its editor under the chips; <kbd>Esc</kbd> closes the editor and leaves you on the chip. To set something that isn't shown yet, open **Add** and pick it: the chip appears with its editor open, and leaves again if you close the editor without a value. Each entry in **Add** shows its keyboard shortcut.

- The breadcrumb above the chips shows the **Project** and, inside a project with sections, the **Section**, and the **Parent task** when the task is a subtask. Each opens a list you can search: the projects and tasks you pick most often come first, and nested projects show their path ("Work › Clients"), so two projects with the same name are told apart. Type a new name in **Project** and choose **Create** to make a project and move the task into it. A subtask always shows its parent's section.
- **Do on**, the date with an optional time and the time zone control next to it, opens the **When** editor, which also holds **Start** (Anytime, a date or Someday), **Deadline**, **This Evening**, **Repeat** and **Reminders**. The **Start**, **Deadline**, **Evening**, **Repeat** and **Reminders** chips open the same editor at their own part. See [Dates and times](dates-and-times.md), [Deadlines and start dates](deadlines-and-start-dates.md) and [Recurring tasks and reminders](recurring-and-reminders.md).
- **Priority**, from P1 (most important) to P4 (the default). Open the chip and pick one, or press <kbd>1</kbd> to <kbd>4</kbd> anywhere in the panel outside a text field.
- **Estimate**. See [Time blocking](time-blocking.md).
- **Labels**: open the chip to add, create or remove labels.
- **Assignee**, in a shared project. In your own projects the chip is hidden; **Add › Show in Assigned to me** puts the task in that view. See [Assign tasks](sharing.md#assign-tasks).
- **Blocked by** and **Blocks**. See [Wait for another task](notes-and-subtasks.md#wait-for-another-task).

A chip with a value has an **×** that clears it without opening the editor.

Below the chips: subtasks, attachments and the Comments, Activity and History tabs, described in [Notes, subtasks and dependencies](notes-and-subtasks.md), and **Time**, the task's time entries (see [Time tracking](time-tracking.md)). The tabs stay in view while you read a long thread.

## Viewers

If you are a viewer of a shared project, the values read as text and can't be changed, and the checkbox and **Delete** are disabled. You can still comment.

## Close the panel

Close the panel with <kbd>Esc</kbd> or the **×** at the top. On a phone the panel covers the list; close it to go back.
