---
title: Day parts
summary: Group Today into Morning, Afternoon and This Evening, give tasks and habits a part of the day, and type it in quick add.
audience: user
section: Guides
specs: [day-parts, natural-language-capture, filter-queries]
screens: [settings/day-parts]
order: 23
---
# Day parts

<picture><source srcset="images/today-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/today-light.webp" alt="The Today view with its title, the date and the list of the day's tasks."></picture>

Most days have a shape: a morning routine, errands in the afternoon, reading in the evening. Day parts let [Today](today-and-upcoming.md) follow it.

## Turn them on

Day parts are off until you turn on **Group by day part** under **Today** in **Settings → General → Start view and briefing**. In the **Lists with method hints** and **Full Open Loops method** modes, Today's menu has **Group by part of the day** too. The choice is yours alone and reaches your other devices.

With day parts on, Today lists the day's tasks under **Today** (no part and no time), then **Morning**, **Afternoon** and **This Evening**. Empty groups are left out, and Earlier and Blocked stay as they were.

A task with a time but no part goes to the part of its time: before 12:00 Morning, from 12:00 to 17:59 Afternoon, from 18:00 This Evening. A part you chose always wins over the time. Habits sit in their part like any task, so a morning stretch no longer needs a made-up time.

Turning day parts off puts Today back as it was. Nothing is changed on your tasks: a task with a part shows it as a small chip on its row.

## Give a task a part

- In the task's **When** editor, **Do on** shows **Any time**, **Morning**, **Afternoon** and **Evening** instead of the Evening switch.
- Drag a task onto the **Morning**, **Afternoon**, **This Evening** or **Today** heading in Today.
- The task's **Actions** menu has **Day part**, for one task or a selection.
- The command palette has **Move to Morning**, **Afternoon**, **Evening** and **Any time** for the selected task.

Each one can be undone. <kbd>Shift</kbd>+<kbd>E</kbd> still toggles This Evening. Outside Today the part is a chip on the row (**Tomorrow · morning**), in the place of the evening one. Someone who can only view a shared project sees the part but can't change it.

## Type it

With day parts on, [quick add](quick-add.md) reads **this morning** and **this afternoon** (today, with that part) and a part right after a date: **tomorrow morning**, **fri afternoon**, **sat evening**. A part word anywhere else stays in the title, so **Morning run tomorrow** keeps its name. **tonight** and **this evening** work whether day parts are on or not. Each phrase becomes a chip you can dismiss.

## Find them

In a [filter](filters.md), `morning` and `afternoon` find the tasks with that part, whatever their date; `evening` finds This Evening. A task that is only placed by its time does not match.
