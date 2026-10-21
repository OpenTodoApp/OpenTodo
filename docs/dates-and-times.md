---
title: Dates and times
summary: How due dates and times work, every way to type or pick them, and fixing a time to a time zone for something that happens at one moment worldwide.
audience: user
section: Guides
specs: [task-management]
screens: []
order: 12
---
# Dates and times

<picture><source srcset="images/time-zone-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/time-zone-light.webp" alt="The time zone popover of a due time: the floating and fixed modes explained, Fix to my zone, and a search for another time zone."></picture>

A due date is just a calendar day, and a time is the time on the clock where you are. A task due Tuesday at 09:00 shows Tuesday at 09:00 on every device, even when you travel.

## Type or pick a date and time

Click the date on a task's **When** line. **Today**, **Tomorrow**, **This weekend**, **Next week** or **No date** sets it in one click. Or type in the field, which previews what it understood ("→ Fri 23 Oct"), or pick a day in the calendar. **Add time** suggests 09:00, 13:00 and 18:00. Formats follow **Settings → General → Date and time**:

- **Date:** a date in your format (`14/10` or `10/14`, with or without a year), an ISO date (`2026-10-14`), or a word: `today`, `tomorrow`, a weekday such as `fri`, `next week` or `3 Nov`. A date without a year that has already passed this year means next year. Press <kbd>Enter</kbd> or leave the field to save it. If the date doesn't exist (`31/02`), the field says so and the task keeps its date.
- **Calendar:** always shown under the field, with weeks starting on your first day of the week. Arrow keys move by day and week, <kbd>Page Up</kbd> and <kbd>Page Down</kbd> by month, <kbd>Home</kbd> and <kbd>End</kbd> to the start and end of the week, <kbd>Enter</kbd> picks the day and <kbd>Esc</kbd> closes it.
- **Time:** `15`, `1530`, `15:30`, `3pm`, `3:30 pm` or `noon`, whichever clock you use. <kbd>↓</kbd> in the field shows times in 15-minute steps to pick from.

**Clear** at the bottom removes the due date; **Remove time** keeps only the day.

## When a day ends

For the app, a new day begins at midnight. If you often work past midnight, set **Settings → General → Date and time → My day starts at** to a time up to 06:00. With 04:00, at 01:30 on Thursday it is still Wednesday:

- **Today** still lists Wednesday's tasks, nothing moves to **Overdue**, and Thursday's tasks are **Tomorrow** in **Upcoming**.
- A task you complete now counts for Wednesday in **Completed**, [Statistics](statistics.md) and the Loop pulse, and a habit keeps its streak.
- `today`, `tomorrow` and `overdue` in quick add and [filters](filters.md) mean the day you are living in.

At 04:00 the views move on by themselves. Nothing stored changes: due dates stay calendar days, and reminders and times fixed to a zone still happen at their real moment.

## Fix a time to a time zone

Once a due has a time, a line under it says how the time is meant: **Floating time** (the same clock time wherever you are) or **Fixed to New York** (one moment worldwide). Choose **Change** to:

- **Fix to my zone:** tie the time to your current time zone, for things that happen at a fixed moment. Press <kbd>z</kbd> with the panel open to do the same, and again to release it.
- **Fix to another time zone:** search any city or zone, for example a call at 15:00 in New York. The panel shows how that reads for you ("15:00 in New York = 21:00 your time (Berlin)") before you choose **Fix to New York**. Your own zone is listed first, then the zones you used recently.
- **Make floating:** release a fixed time to the clock time you currently see.

Devices elsewhere show a fixed time converted to their local time, with the original time and city as a hint. Without a time the button is off: a due date alone always stays floating.
