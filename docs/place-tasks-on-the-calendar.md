---
title: Place tasks on the calendar
summary: Drag tasks onto time slots or move them with the keyboard, change how long a block lasts, and read each day's planned hours against its capacity.
audience: user
section: Guides
specs: [time-blocking]
screens: []
order: 62
---
# Place tasks on the calendar

<picture><source srcset="images/day-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/day-light.webp" alt="The Day calendar with the day's tasks as blocks between morning and evening."></picture>

Once tasks have [estimates](time-blocking.md#estimate-how-long-a-task-takes), the Day and Week calendar is where you decide when to do them. Opening the calendar and the Month view are covered in [Day, Week and Month](calendar-views.md).

## Place a task on the calendar

Drag a task from the Unscheduled lane onto a time slot. Its due date and time become that slot. The grid works in 15-minute steps.

To plan from your lists, open the side list with **Plan from a list** (in the header's **More actions** menu of Day, Week, Month and Plan) and drag tasks from there onto the calendar, or focus one and press <kbd>s</kbd>: in Day and Week the arrows then move it, <kbd>Enter</kbd> places it and <kbd>Esc</kbd> cancels, and focus goes back to the list; in Month and Plan it goes straight onto the focused day. The list stays open while you move to other days, weeks or months and switch between Day, Week, Month and Plan; close it with its close button or <kbd>Esc</kbd>.

To change how long something takes, drag the bottom edge of its block: the start stays and the end moves. Drag the top edge to start earlier or later while the end stays; the estimate grows or shrinks to match, never below 15 minutes, and **Undo** puts back both. Dragging the middle of a block moves it and keeps its length. Dropping a block back on the Unscheduled lane keeps the date and removes the time.

The time you place a task at is its **Do** time. In the task's details, **Do** shows the block the calendar draws, for example `Today 12:00–13:30` for a 90-minute estimate. **Start** is something else: the date from which the task is available (see [Deadlines and start dates](deadlines-and-start-dates.md)).

### With the keyboard

Every move works without a mouse.

1. In Today, a project or any list, select a task and press <kbd>s</kbd>. The Day view opens with the task ready to place.
2. Move it with the arrow keys: <kbd>↑</kbd> / <kbd>↓</kbd> by 15 minutes, <kbd>←</kbd> / <kbd>→</kbd> by a day.
3. Press <kbd>Enter</kbd> to place it, or <kbd>Esc</kbd> to cancel.

On the calendar itself, <kbd>j</kbd> / <kbd>k</kbd> select tasks, the arrows move the selected one, <kbd>Shift</kbd>+<kbd>↑</kbd> / <kbd>Shift</kbd>+<kbd>↓</kbd> shorten or lengthen it, <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>↑</kbd> / <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>↓</kbd> start it 15 minutes earlier or later while the end stays, and <kbd>u</kbd> takes it off the grid while keeping its date.

## See whether the day fits

Each day's header adds up the estimates of its open tasks and compares them with your day length, for example `4h 15m / 8h`. When you've planned more than the day holds, the header is marked as over capacity. That's your cue to move something.

Tasks that overlap in time are shown side by side, with a marker, so nothing hides behind something else.

Completing a task removes its block and lowers the day's total.

Your day length and the hours the grid shows are set per device in **Settings → Language and region → Calendar grid**; see [Adjust the grid](time-blocking.md#adjust-the-grid).
