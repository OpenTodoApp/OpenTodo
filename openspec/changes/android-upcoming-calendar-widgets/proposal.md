# Proposal

## Why

The Android app has a Today widget that lists and ticks off today's tasks (android-widget-list, #1240), but nothing on the home screen shows what comes after today. [#1718](https://github.com/OpenTodoApp/OpenTodo/issues/1718) asks for two widgets: an **Upcoming** list like the app's Upcoming, and a **month calendar** showing which days have tasks, both resizable, opening the task or the day when tapped. The Today widget's design (D6) left room for both: a list of items built from the publication, and a publication that can carry more than one list.

## What Changes

- **Upcoming widget.** The next tasks after today, as the app's Upcoming lists them, up to 50, under a heading per day ("Tomorrow", then the weekday and date). Each row shows the title and, when set, the time and the project. A tap opens the task; the circle completes it the way the Today widget does (hidden at once, completed by the web app in a background run, its own op); `+` opens quick add; the header opens Upcoming. Empty, locked and "open the app" states as Today.
- **Calendar widget.** A month grid (six weeks, the app's first day of the week) with a dot under each day that has open tasks due, today ringed, and arrows to the next five months and back. A tap on a day opens that day in the app (Day); when the current workspace has Calendar switched off, it opens Upcoming instead. The month name opens Month (or Upcoming). While an encrypted account is locked the grid shows no dots.
- **One set of tasks for every widget.** The publication's lists start from the tasks the app's own lists show: no kept subtasks (keep-open-subtasks), no tasks of archived or trashed projects, no graduated habits. The Today widget gains the archived and trashed filter it lacked, so it now agrees with the app's Today.
- **Bridge (additive):** `upcoming: {count, tasks: [{id, title?, date, time?, project?, priority}]}` and `calendar: {weekStart, dayView, days?: {"YYYY-MM-DD": n}}` on `publishWidget`. Older shells ignore them; a newer shell on an older server shows "Open OpenTodo once" in the two new widgets.

Out of scope: the same widgets on iOS (WidgetKit), task titles inside calendar cells, events from connected calendars in the calendar widget, Start with Today in the Upcoming widget, choosing a project or view per widget (#1240's comment), and a workspace chosen per widget (every widget, like the Today widget, covers all workspaces of the account). No **BREAKING** change: no new environment variable, no op-log change, no new permission or dependency.

Roadmap: none of the open rows; like `android-widget-list`, an issue-driven change to the native shells.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: a new requirement, Upcoming and calendar widgets.

## Impact

- Web: `shellPublish.ts` (`shellUpcoming`, `shellCalendar`, the shared widget task set), `shell.ts` (`ShellWidgetData`), bridge fixtures (`widget.json`, `widget-locked.json`, `actions.json` `dayPaths`).
- Android: `WidgetModel` (upcoming rows, pending ticks per occurrence), `CalendarModel` (the grid), `Widgets.kt` (Upcoming provider and list service), `CalendarWidget.kt`, layouts, two chevron drawables, strings in every language, the manifest.
- Docs: `docs/android-app.md` Widgets, `mobile/README.md`.
