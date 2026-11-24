# Calendars per workspace

## Why

GitHub issue #1828: a person who keeps Work and Personal workspaces apart still sees the work calendar in Personal. The Calendars button hides every subscribed calendar at once, on one device, and Settings can only turn a calendar off everywhere. Which calendars to see belongs to the workspace, and the choice should follow the person to their other devices.

## What Changes

- The Calendars button of Day, Week, Plan, Month and Year opens a menu: "Show calendar events" at the top (the existing per-device switch for all calendars, unchanged), then one checkable row per enabled calendar (feeds and calendar sync calendars) with its colour dot and name. Unchecking a row hides that calendar's events in the current workspace only. Below 768 px the same rows follow the Calendars item of the page's menu.
- The choice is one new synced preference, `user_prefs.calendars_hidden`: a JSON object from workspace id to the ids of the calendars hidden there. It is a hide-list, so a new calendar and a new workspace start with every calendar shown. It is written with one op through `mutate()`: offline first, on every device of the account, last-writer-wins.
- Every place that draws events (the calendar views, Today's and Upcoming's agenda) reads them through one hook that leaves out hidden calendars. Free time and the assistant keep counting hidden calendars as busy.

## Out of scope

- Choosing workspaces from a calendar's settings, or assigning a calendar to one workspace.
- Changing the per-device switch, Settings' Enable and Disable, or what the server fetches and serves.
- Hiding calendars from free time or the assistant.

No new environment variable, route or dependency; the op schema gains one field (additive, not breaking).

ROADMAP.md: none (an improvement from an issue).

## Capabilities

### Modified Capabilities

- `calendar-feeds`: the Calendars button becomes a menu with the device switch and per-workspace calendar rows, and a new requirement covers the synced per-workspace choice.
