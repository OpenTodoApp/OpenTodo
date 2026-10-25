---
title: The task page
summary: A task's page: the breadcrumb, the next and previous task, the title and menu, the notes, the facts, what a viewer can do, going back, and the side panel beside the list.
audience: user
section: Guides
specs: [task-management, entity-pickers, web-app]
screens: [task-panel]
order: 11
---
# The task page

<picture><source srcset="images/task-detail-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/task-detail-light.webp" alt="A task open as its page: the breadcrumb and 2 / 5 at the top, the title, the notes and the subtasks on the left, and its facts on the right under Schedule, Details, Labels and Project."></picture>

Select a task with <kbd>j</kbd> / <kbd>k</kbd> and press <kbd>Enter</kbd> to open its page; a click edits the title in place, and its arrow (or <kbd>Shift</kbd>+<kbd>Enter</kbd>) opens the page. Every change is saved as you make it; there is no Save button.

## Moving around

The top of the page says where the task lives (its project, and its parent for a subtask) and where it sits in the list you opened it from, such as **2 / 5**. Press <kbd>j</kbd> or <kbd>k</kbd> (or the ↓ and ↑ buttons) for the next or previous task of that list, and <kbd>Esc</kbd> or **×** to go back to the list, with the task selected where it was. On a phone, **Back** in the bar does the same. Opened from a reminder, a notification or the search bar, the page goes back to the task's own list. From 1024 px wide, the Inbox and **Process the Inbox** keep the task beside the list or the card instead: in the Inbox, <kbd>Enter</kbd> then opens its page.

## The top of the page

The **⋯** menu holds **Copy link**, **Attach**, **Delete** and the less frequent actions. Under the breadcrumb are the task's **checkbox** and its **title** (edit it in place), then **Notes**: one quiet line until you click it, then an editor (see [Write notes](notes-and-subtasks.md#write-notes)).

## The facts

Beside the notes (under them on a narrow screen) are the task's facts, in the words the list uses:

- **Schedule**: **Do** (the date and time, and evening), **Start**, **Deadline**, **Reminder** and **Repeat**.
- **Details**: **Priority**, **Estimate**, **Assignee**, **Blocked by**, **Blocks** (when something waits for this task) and **Location**.
- **Labels**.
- **Project**: the project, the section, the parent task and where the task came from.

On a phone the facts are one card of rows: those with a value, **Do** and **Deadline**, then **More properties** for the rest.

A fact without a value reads as what sets it, such as **Set a deadline** or **Add a place**. Click a fact, or <kbd>Tab</kbd> to it and press <kbd>Enter</kbd>, to open its editor next to it; click it again or press <kbd>Esc</kbd> to close it. Every editor has **Clear** and **Done**. The **When** editor shows one part at a time (**Do on**, **Start**, **Deadline**, **Repeat**, **Reminders**), starting with the one you clicked; **This Evening** and the time zone are in **Do on**. Press <kbd>1</kbd> to <kbd>4</kbd> anywhere on the page for the priority. See [Dates and times](dates-and-times.md), [Deadlines and start dates](deadlines-and-start-dates.md) and [Assign tasks](sharing.md#assign-tasks).

## Viewers

If you are a viewer of a shared project, the lines read as text and can't be changed, and the checkbox and **Delete** are disabled. You can still comment.

## Open tasks beside the list

To keep tasks beside the list, choose **In a side panel** under **Settings → Appearance → Task details**. From 1024 px wide every list (Inbox, Today, projects, labels, views and the rest) has a panel with the task's notes, facts, subtasks, attachments and comments:

- A click on a task, or moving to it with <kbd>j</kbd> / <kbd>k</kbd>, shows it there; <kbd>Enter</kbd> on the task shown opens its page.
- The panel never closes by itself. Only its **×**, or <kbd>Esc</kbd> inside it, closes it, and it stays closed until you click a task or press <kbd>Enter</kbd> on one.
- Drag its left edge to resize it (or focus the edge and press ← or →; a double click resets it). Each device keeps its own width.

Phones and narrow windows keep the page.
