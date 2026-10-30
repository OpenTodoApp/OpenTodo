---
title: Re-plan the rest of the day
summary: When the morning slips, move the time blocks you missed into the free time left today in one step, after a preview, with one Undo.
audience: user
section: Guides
specs: [time-blocking]
order: 61
---
# Re-plan the rest of the day

<picture><source srcset="images/day-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/day-light.webp" alt="The Day calendar with timed tasks as blocks, the Unscheduled lane and the planned hours against an 8-hour day."></picture>

A [time-blocked](time-blocking.md) day rarely survives the first interruption. Instead of dragging every missed block down one by one, **Re-plan** makes a fresh plan for the hours that are left and shows it to you before anything moves.

## When it is offered

A block is **missed** when its task is still open, it is due today with a time, and its end (the time plus its estimate, or plus 30 minutes without one) has passed. A block that started but has not ended yet is in progress, not missed.

While today has missed blocks, the line beside the Day or Week title reads **3 blocks behind · Re-plan**. **Re-plan the rest of the day** is also in the calendar's **⋯** menu, in Today's **⋯** menu (it opens the Day view with the preview) and in the [command palette](search.md#commands). With nothing behind, none of these appear.

Never moved:
- tasks you may only view in a shared project;
- tasks in a shared project assigned to someone else;
- the task your [timer](time-tracking.md) is running on;
- tasks of archived projects, and tasks with a date but no time.

## How the new plan is made

The missed blocks keep their order and their length. Starting at the next quarter hour, each takes the first free time that holds it whole, up to the end of your grid (22:00 by default, see [Adjust the grid](time-blocking.md#adjust-the-grid)). Your other timed tasks and busy events from your [other calendars](other-calendars.md) are kept free; free and all-day events are not. When **Calendars** is off in the toolbar, events are not avoided either, just as the grid shows. The same tasks and clock give the same plan on every device.

Offline, the plan uses the events your device has saved; for a day it has none for, the preview says **Calendars unavailable offline** and plans around your tasks only.

## Preview, then Apply

Nothing moves until you choose **Apply**. The bar beside the title says, for example, **4 tasks move · 1 doesn't fit**; each block's new place is drawn with a dashed outline and its old place fades. Tasks that don't fit before the end of the day stay where they are (**Leave them**), or choose **Move to tomorrow** to keep their time on the next day. A task that would land after its deadline says **After its deadline**.

Press <kbd>Enter</kbd> or **Apply** to move them all, <kbd>Esc</kbd> or **Cancel** to leave everything as it was. While the preview is open, dragging and placing wait. If a task is completed or moved meanwhile, here or on another device, the preview updates; when nothing is behind any more it closes with **Nothing to re-plan**.

On a phone, Re-plan opens a sheet listing each move as **09:00 → 14:30 Write report**, with the same choice, **Apply** and **Cancel**.

## Undo

All the moves are one change: the message after Apply offers **Undo**, which puts every task back at its earlier time in one step. Each move is an ordinary date change, so it reaches your other devices, [CalDAV](caldav.md) apps and connected calendars like a drag. A task changed on another device just before you applied is skipped, and the message says so, for example **3 moved · 1 changed meanwhile**.

## Assistants and the command line

Re-planning runs in the app only. The [command line](cli.md) and [MCP](mcp.md) have no re-plan command; an AI assistant can still read today's tasks and move them with the `schedule_tasks` tool, where the owner allows assistants to make changes.
