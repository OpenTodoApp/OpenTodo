## Why

Issue 536: a user who keeps a task open in the side panel next to a list loses track of the time and of what comes next, and switches to the calendar again and again (or splits browser windows) to check. They asked for a calendar at the bottom of the sidebar that stays in sight and can be clicked.

## What Changes

- A **Schedule** section at the bottom of the sidebar, between the scrolling groups and the footer. It folds like a sidebar group, starts closed and is remembered on the device.
- Open, it shows the time now and today's timed tasks and calendar events that have not ended, in start order, the current one highlighted. At most five rows; the rest is "N more today", linking to the Day calendar ("Open the calendar" when nothing is left over).
- A task opens in the side panel (or as a page where the page has no panel); an event opens the calendar's details popover. Read-only otherwise: no drag, no completion from the section.
- Not shown in the icon rail or the phone drawer.

## Out of scope

- An hour grid, dragging to reschedule, or completing tasks from the section: the Day calendar does that.
- Other days than today, untimed tasks (Today lists them), all-day events.
- A synced setting: the open state is device state like the other sidebar groups.

ROADMAP: none; a user request (issue 536) around the existing calendar.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `app-shell`: the sidebar gets the Schedule section above the footer.

## Impact

- Web only: `web/src/app/calendar/SidebarSchedule.tsx` (new), `Sidebar.tsx` mounts it, `TodayAgenda.tsx` exports its event button. Six new messages in every catalog. No data, op, API or server change; events come from the device cache Today's agenda already uses, asked for only when the device knows a subscription.
- Docs: `docs/sidebar-schedule.md` (new guide page).
