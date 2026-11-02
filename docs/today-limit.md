---
title: Today limit and Done today
summary: Cap how many tasks Today holds, let a waiting task in with Take a slot, see what you finished in Done today and log work that was never a task.
audience: user
section: Guides
specs: [today-closed-list, mcp-server, cli-client]
screens: [settings/today-limit]
order: 24
---
# Today limit and Done today

<picture><source srcset="images/today-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/today-light.webp" alt="The Today view with its title, the date and the list of the day's tasks."></picture>

A busy [Today](today-and-upcoming.md) can hold twenty tasks that will never all get done. A **Today limit** turns it into a closed list: a fixed number of slots, and the rest wait their turn. **Done today** shows what you actually finished, unplanned wins included.

## Set a limit

Choose a limit under **Today limit** in **Settings → General → Start view and briefing**: **Off**, 3, 5, 7 or 10 tasks, or **Custom** for any whole number from 1 to 20. In the **Lists with method hints** and **Full Open Loops method** modes, Today's menu has **Limit Today…** too. The limit is yours alone and reaches your other devices.

With a limit on, the line under Today's title reads **3 of 5**: the slots in use and the limit. Today lists that many tasks in its usual groups and order (Earlier, Today, the [day parts](day-parts.md), This Evening). The others wait in a folded **Waiting for a slot** group at the end, with their count. Nothing is rescheduled, and a full Today never refuses a new task.

## Who gets a slot

Slots are filled first come, first served:

1. today's focus from the [Daily check](method/rhythms.md#daily-check);
2. the tasks you let in with **Take a slot**, in the order you took them;
3. **Earlier** tasks, the oldest first;
4. the other tasks by when they were created, the oldest first.

A task captured on a full day waits instead of pushing out a planned one; a priority or a time never reshuffles the slots. The Waiting group keeps this order: its first task comes in when you finish one.

[Blocked](tasks-and-projects.md#wait-for-another-task) tasks and the later steps of a [sequential project](project-flows.md) never take a slot; they stay where they were. Nor do habits.

## Tasks with a time today

So a time is never hidden, the folded Waiting heading names the next waiting task due today with a time or a deadline (**Waiting for a slot · 4 — next: Send the form, 4:00 PM**) and lists up to three of them under it, soonest first, each with **Take a slot**. They keep their place in the order; a time that has passed leaves the list at the end of the day.

## Take a slot

To let a waiting task in, choose **Take a slot** on its row, in its **Actions** menu (on a phone, a long press) or in the command palette. The last task that came in by the usual order goes back to waiting. **Give back the slot** undoes it. When every slot already holds a focus task or one you took, Today is full: complete a task or give one back first. Your choice holds for the day.

## Done today

**Done today** is a folded group at the end of Today with the tasks you completed today, newest first, and their count; while a limit is on, the line under the title adds it (**3 of 5 · 4 done**). It is shown in the method modes and hidden in **Simple lists**; switch it under **Today limit** in Settings or with **Show done today** in Today's menu.

## Log a win

Some work was never a task. **Log a win** on the Done today heading, or in the command palette, opens quick add with **Log as done** on: the task is created already completed now and counts like any completion in your [statistics](statistics.md). A win does not repeat or remind, so those words stay in the title. In the terminal, `ot add --done "Fixed the printer"` does the same ([CLI](cli.md)).
