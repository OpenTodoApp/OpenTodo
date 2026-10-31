---
title: Group and order a list
summary: Group a project's or a label's tasks by section, date, priority or label and order them by priority, date, deadline or title, kept for each project and label.
audience: user
section: Guides
specs: [list-display-options, custom-views, manual-ordering, task-list-presentation]
screens: []
order: 18
---
# Group and order a list

<picture><source srcset="images/group-and-order-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/group-and-order-light.webp" alt="The Home renovation project grouped by priority, with the Display options panel open showing Group by Priority and Order by Manual order."></picture>

A project's list and a label's page have **Display options**, the sliders button at the right of the header, the same panel [saved views](saved-views.md) have. Every choice applies at once.

## Group by

- In a project: **Section** (the default), **None**, **Due date**, **Priority** or **Label**.
- On a label's page: **Project** (the default), **None**, **Due date** or **Priority**.

Due date groups read *Earlier*, *Today*, *Tomorrow*, then each later date and *No date*. A task with several labels is listed once, under the first of them in your label order. Grouped by section, a project keeps its section headings, folding and **+** buttons.

## Order by

**Manual order** (the default, the order you drag tasks into), **Priority**, **Due date**, **Created**, **Deadline** or **Title**. **More options** holds the direction; for priority, *descending* puts priority 1 first. Tasks without a date or deadline come last either way.

Subtasks stay under their parent in the order you gave them, and a project's **Later** and **Completed** groups stay at the end.

A new task goes at the end of the manual order, or at the top if you chose **Add new tasks: At the top of the list** in Settings → Capture → Quick add (see [Where new tasks go](quick-add.md#where-new-tasks-go)). In any other order the task appears where that order puts it; the setting only decides which of two equal tasks comes first.

## Kept for each project and label

The choice is kept for each project and each label, follows you to your other devices and stays after a restart. In a shared project it is yours only: other members keep their own.

## Drag while another order is shown

Dragging a task between others in a project or on a label's page, or moving it with <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd>, while another order is shown switches the page back to **Manual order**, then moves the task. The grouping stays. A project's board and timeline keep their own layout; the button shows in the list layout only.

## Your own order on a label page or saved view

A label's page and a [saved view](saved-views.md) keep their **own** manual order, separate from your projects: putting *Post office* above *Pharmacy* on the *errand* label never moves either task in its project. In a shared project you only view, you can still order its tasks on your own label pages and views.

- Drag a task above or below another one in the same group (on a phone, press and hold, then move), or select it and press <kbd>Alt</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd>, or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>↑</kbd> / <kbd>↓</kbd> for the top or bottom of its group. With Vim keys on, <kbd>Shift</kbd>+<kbd>J</kbd> / <kbd>K</kbd> work too.
- Each move shows **Order changed** with **Undo**.
- Tasks you never moved follow the ones you placed, in their project order, so a new task appears after them.
- The order is kept for up to 500 tasks per page, follows you to your other devices and works offline. If you reorder the same page on two devices while offline, the device that syncs last wins.

Today, Upcoming, Anytime, Someday, Assigned to me, Completed and places have their own fixed order and no **Manual order**. The **New view** page offers it only once you have saved the view.
