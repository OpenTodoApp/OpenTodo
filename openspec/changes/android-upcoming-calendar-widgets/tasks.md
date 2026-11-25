# Tasks

## 1. Web app

- [x] 1.1 The widgets' base set leaves out kept subtasks and tasks of archived or trashed projects; `shellUpcoming` publishes the Upcoming rows by day (at most 50, `count` of all, only the count while locked); `shellCalendar` publishes `weekStart`, `dayView` and the open-task count per day for this month and the next five (no `days` while locked). Verified: `web/src/lib/shellPublish.test.ts`, the bridge fixtures `widget.json` and `widget-locked.json`.
- [x] 1.2 The addresses the calendar widget opens (`/day/<date>`, `/month/<date>`) are read by the router. Verified: the bridge fixture `actions.json` `calendarPaths` in `shellBridge.fixture.test.ts`.
- [x] 1.3 Rows carry `due` and `actions` lists `complete-on`; `?complete=<id>@<date>` completes the task only while it is due that day; the publication carries `today` and `dayStart`; the calendar's days cover its six grids, zoned dues as viewed. Verified: `shellActions.test.ts`, `shellPublish.test.ts`, the bridge fixtures (`completePaths` with an occurrence).

## 2. Android widgets

- [x] 2.1 `WidgetModel`: `upcoming` rows and items with day headings and "+ n more", pending ticks keyed by occurrence (`id@date`) and confirmed per list. Verified: `WidgetModelTest`, `BridgeFixtureTest`.
- [x] 2.2 `CalendarModel`: the publication's days, the six-week grid for a month and first day of the week, the day and month addresses. Verified: `CalendarModelTest`, `BridgeFixtureTest`.
- [x] 2.3 The Upcoming widget (`UpcomingWidget`, `UpcomingListService`) and the Calendar widget (`CalendarWidget`, its month per widget id), their layouts, drawables, strings in every language and manifest entries; colours only from layouts. Verified: `make android` (unit tests, lint, translations, build, the emulator test compiled), `WidgetColorTest`; `UpcomingCalendarWidgetTest` on the emulator (CI).
- [ ] 2.4 A check on a real Android phone: both widgets added, scrolled, ticked online and offline, a repeating task, day and month taps with Calendar on and off, arrows, light and dark, resizing, locked. Left open: it needs a real phone; the steps are in the pull request.
- [x] 2.5 Ticks queued as `<id>@<due>` where the web app reads them; an Upcoming tick hides the Today row; the logical today for headings, ring and month, one inexact alarm at the next day; no redraw for a republication within the minute; the months cleared with the widget data. Verified: `WidgetModelTest`, `BridgeFixtureTest`.

## 3. Docs, release

- [x] 3.1 Docs: `docs/android-app.md` Widgets and `mobile/README.md` (files, `publishWidget` shape). Verified: `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Added/android-upcoming-calendar-widgets.md`. Verified: `make repo-check`.
