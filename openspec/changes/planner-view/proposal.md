# Proposal

## Why

The calendar answers "when today" (Day), "when this week" (Week) and "how the month fills" (Month), but none of them is built for the question people ask on a Sunday evening: *what have I put on each of the next fourteen days, and does it fit?* Day and Week spend their height on hours, so a day's untimed tasks sit in a narrow lane; the Month cell hides everything past three rows and shows nothing of the meetings already in the calendar; Upcoming is a list with no sense of capacity. And every capacity figure the app shows today stops at the task's current occurrence: a "weekly report" that repeats every Monday counts on this Monday only, so next Monday looks empty when it is not. The pieces exist on the device (estimates and the day length from `time-blocking`, cached events from `calendar-feeds`, the recurrence rule and the shared next-occurrence calculator from `recurring-tasks`); this change draws them together on one screen.

## What Changes

- **A fourth Calendar mode, Plan**, next to Day, Week and Month in the range switch and the sidebar's Calendar destination, at `/plan` with an optional start date, reached with `g` then `Shift+C` (`g p` already opens Inbox triage and `g Shift+P` All projects in `web/src/lib/shortcuts.ts`, so the Plan mode takes the shifted C of the Calendar's plan, a shifted letter like Loop, Next, Waiting and the Daily check). It shows the next 14 days starting today as day columns, 7 per row so nothing scrolls sideways; the span is 7, 14 or 21 days, chosen per device from the page's overflow menu.
- **Date-level planning**: each column lists the day's open dated tasks (the Day, Week and Month selection: open, live, archived projects left out, zoned dues in the viewer's zone) as rows with their time, estimate and priority, without a time axis. Dragging a row onto another column sets its due date and keeps its time and zone; with a row selected, ← / → move it a day and ↑ / ↓ a week, as in the Month; `q` quick-adds a task due on the focused day. Every write is the existing `due` field edit: applied locally first, queued offline, converging by last-writer-wins. Tasks of a project where the user is a viewer are shown but not movable.
- **A capacity bar per column** against the device's day length (the `time-blocking` preference), with the planned total as text and a tooltip in the Week's words. Unlike the Day and Week headers, the Plan counts three sources, because a day already spent in meetings is not free: task estimates, the busy timed events of subscribed calendars that day (their duration, overlaps merged, all-day and free events left out), and the **projected future occurrences of recurring tasks**. Unestimated tasks count as zero and are reported as "n without estimate", as the Week's tooltip does.
- **Projected occurrences**: for every open recurring task, the occurrences that would follow its current one inside the shown span are computed on the device from its rule with the shared calculator (`web/src/lib/recurrence.ts`) and drawn dimmed and read-only in their columns: not draggable, not selectable, never written. The series itself stays one movable row on its current date, as `recurring-tasks` requires.
- **Below 640 px** the Plan is a vertical agenda grouped by day, like the Week on a phone: each day with its capacity bar, its rows and its projected rows; no columns.
- Everything renders from the local store and works offline (events from the device cache, with the Week's "Calendars as of" status). No new data is written or synced; the only new state is the per-device span.
- Docs: `docs/calendar-views.md` gains a "Plan the next two weeks" section, `docs/time-blocking.md`, `docs/other-calendars.md` and `docs/recurrence.md` each a short paragraph, `docs/keyboard.md` is regenerated from the registry.

Out of scope: time slots and resizing (that is Day and Week), work hours or a day length per weekday, automatic scheduling or fitting tasks into free days, an overdue lane (Today holds the overdue tasks; the planning list in the panel slot offers them for dragging), changes to Upcoming, counting events or projections in the Day, Week and Month headers, the display mode, the CLI and the server.

Advances ROADMAP.md `time-blocking` (duration estimates and the time-blocking calendar: capacity now looks ahead) and `month-and-timeline-views` (the calendar's range of views).

No new dependency, environment variable, route on the server, op field or setting on the server. No change to the op log format. Not **BREAKING**.

## Capabilities

### New Capabilities

- `planner-view`: the Plan mode of the calendar: which tasks appear in which column, the per-device span, the capacity bar and what it counts (estimates, calendar events, projected occurrences), projected occurrences of recurring tasks, rescheduling by drag and keyboard, the keyboard model, the phone agenda, offline and convergence behaviour.

### Modified Capabilities

- `recurring-tasks`: the "Recurring tasks in views" requirement keeps one row per series in Today, Upcoming, project views and the calendar, and now names the calendar's Plan mode as the one place that additionally draws projected future occurrences, dimmed and read-only, computed on the device and never written.

## Impact

- Web app only:
  - `web/src/app/router.ts` (`{ view: 'plan'; date? }` at `/plan/YYYY-MM-DD`), `web/src/lib/calendarMode.ts` (`'plan'` remembered per device), `web/src/app/CalendarRange.tsx` (fourth button), `web/src/app/Sidebar.tsx` (the Calendar destination's `calendar(v)` test), `web/src/app/Shell.tsx` (route and `go.plan`), `web/src/lib/shortcuts.ts` (`go.plan` and the `plan.*` view entries, `VIEW_SCOPES.plan`), `web/src/lib/help.ts` (`plan` → the calendar guide), `web/src/lib/calendar.ts` (`planDays` on the per-device grid preferences).
  - New `web/src/app/PlanView.tsx` with `web/src/app/calendar/PlanAgenda.tsx` for the phone, on a pure `web/src/lib/plan.ts` (span dates, column rows, projected occurrences, the load of a day from the three sources), reusing `calendarTasks`, `cellTasks`, `nudgeDue`, `dueFromView`, `beginDrag` (`web/src/lib/dnd.ts`), `useCalendarFeeds`-style event reads and `QuickAdd`.
  - Writes only through `updateTask`, `setDueWithUndo` and `createTask` (`web/src/lib/ops.ts`).
  - Tests: `web/src/lib/plan.test.ts` (pure functions, recurrence vectors), `web/src/app/planView.test.tsx` (route, drag, keys, viewer, phone, axe), an entry in `scripts/e2e-layout.mjs`, a story in `web/src/app/calendar.stories.tsx`.
- Server, API, op log, CLI, MCP: unchanged. Nothing for the demo deny list.
- Specs: new `openspec/specs/planner-view/spec.md`, a sentence in `openspec/specs/recurring-tasks/spec.md`.
- Docs: `docs/calendar-views.md`, `docs/time-blocking.md`, `docs/other-calendars.md`, `docs/recurrence.md`, `docs/keyboard.md` (generated), screenshots `docs/images/plan-light.webp` and `plan-dark.webp` from `make docs-screenshots`, the help bundle.
- Size: no dependency; about 6 KB gzipped of client code in the main chunk (the view, the agenda and the plan math), comparable to the Month view. Server binary, container image and runtime memory unchanged.
