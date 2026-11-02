---
title: Time sectors
summary: Plan a task for this week, next week or this month without a fake date. What a sector stores, how it is named, carry-over, and how the API, CLI, CalDAV and the vault carry it.
audience: user
section: Guides
specs: []
screens: []
order: 14
---
# Time sectors

<picture><source srcset="images/today-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/today-light.webp" alt="The Today view with its title, the date and the list of the day's tasks."></picture>

Some work belongs to a week, not a day. A due date for it is a fake date that turns red on Tuesday. A **time sector** plans the task for a period instead; only real appointments and [deadlines](deadlines-and-start-dates.md) keep a date.

## What a sector is

A task's sector is one period:

- a week, stored as its ISO week: `2026-W45` (weeks 1 to 52, and 53 in years that have one);
- a month: `2026-11`;
- a quarter: `2026-Q4`.

A task with a sector and no do-on date is planned. It leaves the Inbox and [Anytime](built-in-views.md#anytime-for-when-you-have-time), it is never overdue, and it is not in Today unless its deadline is. A deadline stays as it is: a sector and a deadline go well together.

The stored value never changes by itself. "This week" is worked out on each device from today's date and your first day of the week, so the same task reads **This week** on Wednesday and **From week 45** after the week has ended. A sector whose period has ended is **carried over**: it is shown quietly, never in the overdue colour, and nothing is rewritten. Everyone who shares a project sees the same period, whatever day their week starts on.

## Turn them on

Time sectors are off until you turn on **Time sectors** in **Settings → Account → How you work**, whatever way of working you chose there. It syncs to your devices. Off hides the controls, never a sector: a task that has one keeps its chip and can be cleared.

## Plan a task for a period

- **When editor:** the **Sector** tab, after **Do on** and **Start**, offers **This week**, **Next week**, **This month**, **Next month**, **This quarter** and **Next quarter**, each with its dates, and **Later…** for a week, month or quarter further out. **Clear** removes the sector.
- **Command palette:** **Set time sector…** plans the selected tasks at once, with one **Undo**.
- **Quick add:** `Draft the budget this week` or `Call Bo sometime next week` (see [quick add](quick-add.md)).

A sector is the task's one "when": choosing it clears the do-on date and the start, and giving the task a date or parking it in Someday clears the sector, in one change you can undo. The deadline stays. A repeating task keeps its date, so the Sector tab says so instead.

A row shows the sector where the date would be: **This week**, **Next month**, **Week 47**. A task can hold a date and a sector at once when a script or another app writes both: the date wins, and the When line says the sector is ignored while dated, with **Clear**. Filter with `sector: this week`, `carried` or `no sector` ([filters](filters.md)).

## From other apps and scripts

- **API:** `sector` on every task, `null` for none; `POST` and `PATCH /api/v1/tasks` take a period or `null`. Relative words are refused. See [api.md](api.md#task-fields).
- **Command line:** `ot add "Book the venue" --sector next-week`, `ot edit <id> --sector none`, `ot list --sector this-month` or `--sector carried`. Weeks start on Monday. See [cli.md](cli.md).
- **Assistants:** `create_tasks` and `update_tasks` take `sector` as a period, and `list_tasks` filters by a period or `carried`. See [mcp.md](mcp.md).
- **Calendar apps:** CalDAV carries the sector as `X-OPENTODO-SECTOR:2026-W45`. A client that never sends it keeps the sector. See [caldav.md](caldav.md).
- **Markdown vault:** `[sector:: 2026-11]` on the task line. Removing it clears the sector. See [vault.md](vault.md).

The sector is a scheduling field like a date: with [end-to-end encryption](e2ee.md) it stays readable to the server, and the title and notes stay encrypted.
