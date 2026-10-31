# Calendar clarity: deadlines, adding with the mouse, colour by, filter

## Why

The calendar is where people plan the week, and four small gaps make it harder than it should be:

- **Deadlines are invisible on the calendar.** A task due Thursday with a deadline on Friday shows on Thursday only; nothing on Friday says something must be finished. Todoist highlights deadlines in its calendar's all-day banner (research §1, "separating Deadlines from planned execution dates (highlighting deadlines in the all-day banner of its calendar layout)"); the gap analysis lists "Deadline shown in the calendar's all-day banner" as Missing.
- **Adding needs the keyboard or a detour.** In Month, `q` adds on the focused day; in Day and Week there is no way to click an empty slot and add a task there (#555).
- **Colour only says "project".** People who organise by label (`@deep`, `@errand`) or by priority cannot see that on the grid or the board (#554).
- **The calendar cannot be narrowed.** Lists have a Filter; Day, Week, Month, Plan and Upcoming show everything, and a project has no calendar of its own (#556).

They are bundled because they touch the same views and the same header, and each is small. Each part stands alone and can ship as its own PR; if one grows, it splits into the names the issues proposed (`calendar-mouse-add`, `colour-by`, `calendar-filter`) without changing the specs below.

## What Changes

1. **Deadlines on the calendar.** An open task's deadline shows on its day as a chip with the deadline diamond (the timeline's marker, warning tone) in the all-day strip of Day and Week, as a row with the diamond at the end of a Month cell, and in the Plan's column. When the task's block is on the same day, the diamond sits on the block instead. Deadlines never count toward capacity and cannot be dragged; activating one opens the task.
2. **Add with the mouse (#555).** Double-click an empty slot in Day or Week to open the add dialog with that date and time; double-click an empty part of a Month day for that date. A right-click (or a long press on touch) on the same places opens a small menu: **Add task here…**, plus **New frame here…** and **New slot here…** when `calendar-frames` and `calendar-slots` are present. Month cells get a hover state. In Day and Week, `q` opens the same dialog for the focused day, so no action needs a pointer.
3. **Colour by (#554).** A **Colour by** choice, Project (default), Label or Priority, for the Calendar (Day, Week, Month, Plan) and for boards, stored per device. With Label, a task takes the colour of its first label in the user's label order; with Priority, the priority colours of the rows' ring. Tasks without a label, and priority 4, take the neutral hue. Events keep their own look.
4. **Filter the calendar and Upcoming (#556).** **Filter…** opens the list's filter (a query in the filter language, with label checkboxes that write the query) for the Calendar and for Upcoming. One filter for the Calendar's four modes and one for Upcoming, each remembered per device; an active filter is one chip in the header's lead line with a clear control. Capacity still counts every task of the day, and its tooltip says how many are hidden.
5. **Calendar layout for a project (#556).** A project's layout switch gains **Calendar** after Timeline: the Calendar (in the mode last used) narrowed to that project and its sub-projects, inside the project page. `v` cycles List, Board, Timeline, Calendar.

Not **BREAKING**: no op field, no route, no environment variable; all choices are device preferences.

Out of scope:
- Colour by section or custom field; per-view colour on saved board views (a later additive view field).
- Dragging a deadline to change it (the detail panel and the countdown chip remain the way).
- Filtering Today or the Inbox by query (they keep the duration filter), and filtering calendar events.
- Multi-day tasks (`multi-day-tasks`, 0.19), year view, series occurrences.

ROADMAP: 0.18 "The mindful daily planner", `calendar-clarity`.

Fixes #554
Fixes #555
Fixes #556

## Capabilities

### New Capabilities

None.

### Modified Capabilities

All additions are ADDED requirements, so they do not collide with `meeting-aware-capacity`, which modifies "Overlap and capacity", "Grid preferences" and "Cell contents":

- `deadlines`: "Deadlines on the calendar".
- `time-blocking`: "Add with the pointer in Day and Week", "Colour by", "Calendar layout of a project".
- `month-view`: "Add with the pointer in the month".
- `sections-and-boards`: "Colour by on boards".
- `filter-queries`: "Query filter on the calendar and Upcoming".

## Impact

- Data model, sync, op schema: none. New device meta keys: `calendar.colorBy`, `board.colorBy`, `calendar.filter`, `upcoming.filter`; the project view mode gains `calendar` (unknown values already read as `list`).
- E2EE: none; the filter query is device-local and evaluated on decrypted local data like every filter.
- API, CLI, MCP: none; these are presentation choices of the web client. The CLI already lists tasks with a filter (`ot ls --filter`), and the agent tools can read deadlines.
- CalDAV, vault: none.
- Web: `web/src/app/calendar/*` (all-day strip, `DayColumn`, the drop layer for double-click and the context menu), `MonthView.tsx`, `PlanView.tsx`, `AddOnDayDialog.tsx`, `web/src/lib/calendar.ts` (`deadlineMarkers`), a `colorBy` helper beside the hue mapping, the board card edge, `web/src/lib/sections.ts` (`ProjectViewMode`), the filter popover reused from lists, `web/src/lib/shortcuts.ts` (`q` in the calendar scope).
- Bundle: about 3 KB gzip; no dependency. Binary: unchanged.
- Docs: `docs/calendar-views.md`, `docs/place-tasks-on-the-calendar.md`, `docs/deadlines-and-start-dates.md`, `docs/filters.md`, `docs/boards.md` (or the board section); strings in six catalogs; CHANGELOG.
