---
title: Repeating tasks on the calendar
summary: See the coming dates of repeating tasks and habits in Day, Week and Month, and complete, skip or move one of them alone.
audience: user
section: Guides
specs: [recurring-tasks, planner-view, habits]
screens: []
order: 64
---
# Repeating tasks on the calendar

<picture><source srcset="images/repeating-calendar-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/repeating-calendar-light.webp" alt="The Week calendar on a Monday: Study at 18:00 and Morning run at 07:00 are ordinary blocks on Monday, and their coming occurrences are faint blocks with a dashed edge and the repeat icon on Tuesday to Friday and on Wednesday and Friday."></picture>

## See repeating tasks ahead

A repeating task stands on its current date, and the dates after it are drawn as faint
blocks and rows with a dashed edge and the repeat icon, so next Tuesday's study session
or Friday's habit is already on the grid.

- **Day and Week:** a timed occurrence is a block at its time, as tall as the task's
  estimate; one without a time is in the day's **Unscheduled** lane. On a phone's Week
  they follow each day's tasks.
- **Month:** they are rows of their day, in order with its tasks, and count in
  **+N more**. On a phone the count on each day counts tasks only; the day's list
  shows them after its tasks.
- **Capacity:** each day's planned total adds their estimates, and its tooltip names
  them ("45m repeating").
- They are not selected with <kbd>j</kbd> and <kbd>k</kbd>. Tab reaches them, and a
  click or <kbd>Enter</kbd> opens the occurrence panel for that date. The calendar's
  [filter](calendar-filter.md), Colour by and a project's Calendar layout apply to them
  as to their task.
- Turn them off with **Show repeating occurrences** in the calendar's **More actions**
  menu. Each device keeps its own choice; the Plan always shows them, as its bar counts them.

## Change one occurrence

Finish Thursday's session early, skip next Monday's report for a holiday, or move
Wednesday's study session to 19:00 without touching the others:

- **Right-click** a coming occurrence, **long-press** it on a touch screen, or focus it
  and press <kbd>Shift</kbd>+<kbd>F10</kbd>: **Open**, **Complete this occurrence**,
  **Skip this occurrence** (**Skip this day** for a habit), **Move to…** a day and
  time, or **Delete this and following**.
- **Drag** it with the mouse to another day in Month and Plan, or to another time in
  Day and Week. Only that occurrence moves, and a toast offers Undo. Dragging the
  task's own block still moves the whole series.
- **Open** it: the panel shows **This occurrence** under the title, with the date, the
  task's values and **Complete**, **Skip**, **Move to…** and **Edit this occurrence**.
  Edit this occurrence opens the occurrence as its own task: change its title, notes,
  time or anything else, and the series stays as it is. **All occurrences** switches
  to the series.

A moved or edited occurrence is an ordinary task row on its new date, marked with the
repeat icon ("One occurrence of …"); deleting it skips it. A completed one is in
Completed, and the series never stands on a date that has one: completing the series
jumps over it. Renaming the series renames the moved ones that still had the old
title. Viewers of a shared project and tasks that repeat after completion get Open
only. More: [One occurrence alone](recurrence.md#one-occurrence-alone).

## Change from one date on

Open a coming occurrence and choose **This and following**: your first change there
(the time, the title, the rule…) applies from that date on, and earlier days stay as
they were. More: [This and following](recurrence.md#this-and-following).

## In Upcoming

**Upcoming** has the same item in its menu, off by default. Turned on, it lists the
coming occurrences of the next 14 days under their days, after each day's tasks, and
the last of them says up to which date they are shown. They are not counted in
Upcoming's numbers. How the dates are worked out: [Recurring task rules](recurrence.md#projected-occurrences).
