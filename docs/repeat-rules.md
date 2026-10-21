---
title: Repeat rules
summary: Every rule you can type into Repeat, the after-completion and end options, and what completing, skipping or splitting off one occurrence does.
audience: user
section: Guides
specs: [recurring-tasks]
screens: []
order: 51
---
# Repeat rules

<picture><source srcset="images/repeat-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/repeat-light.webp" alt="The When editor on its Repeat tab: one-click rules, the rule every monday with its next three dates, the Skip and This occurrence only buttons, and Track as a habit."></picture>

A repeat rule is typed into the **Repeat** field of a task, as described in [Recurring tasks and reminders](recurring-and-reminders.md#make-a-task-repeat). This page lists the rules and explains what happens to each occurrence.

## Rules you can write

| Rule | Repeats |
| --- | --- |
| `every day`, `every 3 days` | daily, or every few days |
| `every weekday` | Monday to Friday |
| `every week`, `every 2 weeks` | weekly or fortnightly |
| `every monday`, `every mon, wed, fri` | on those weekdays |
| `every month`, `every 15th` | monthly, on the same day or a fixed day |
| `every last day`, `every last friday` | at the end of the month |
| `every 2nd tuesday` | the second Tuesday of each month |
| `every year` | once a year on the same date |

Two extras work with any of these:

- **After completion:** `every 2 weeks after completion` counts from the day you actually finish, not from the due date. Good for things like "change the water filter".
- **An end:** add `until 2026-12-31` or `for 10 times` to stop the series.

Rules are stored in English, whichever language you typed them in. Every detail is in the [recurring task rules](recurrence.md) reference.

## Complete, skip or split off one occurrence

When you complete a repeating task, that occurrence is recorded in **Completed**, and the task moves to its next date. If it was overdue, it jumps to the next date from today, so missed occurrences don't pile up.

The buttons under the rule handle the exceptions:

- **Skip** (<kbd>Shift</kbd>+<kbd>S</kbd>) moves to the next date without recording a completion. Use it when this week's run is cancelled.
- **This occurrence only** (<kbd>Shift</kbd>+<kbd>O</kbd>) splits the current occurrence off as a normal task you can change freely, while the series moves on. Use it when this week's meeting is on Thursday instead.

Changing the title, notes, project, priority, labels or time of a repeating task changes the whole series.

Reminders on a repeating task carry over to each occurrence; see [Task reminders](task-reminders.md).
