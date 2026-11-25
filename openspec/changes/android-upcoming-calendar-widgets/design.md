# Design

## Context

The Today widget (`TodayWidget`, `TodayListService`, `WidgetModel`) draws the web app's last publication (`publishWidget`, native-shells D6) and completes a task through a hidden run at `/?complete=<id>` (android-widget-list D2). Its design D6 named this change: "An Upcoming widget is the same list with date headings." Both new widgets read the same stored publication, so they work offline, refresh with the hourly background run, and never make a request.

## Decisions

### D1 — One publication, two optional parts

`publishWidget` keeps its shape and gains two optional members, computed in `publishToday` from the same rows:

- `upcoming: {count, tasks}`: `groupUpcoming(upcomingList(…))` flattened, so rows come in day order and each carries `date`, the day the app's Upcoming lists it under; at most 50, `count` is the whole list. Rows carry `title`, `time`, `project` and `priority` as Today's do. Locked: `count` only and no rows.
- `calendar: {weekStart, dayView, days}`: `days` maps each date of the widget's six grids (the first date of this month's six-week grid to the last of the fifth month's after it) to its number of open tasks, as Month draws them (`calendarTasks`, the due as viewed here through `viewedTask`, a multi-day task counted on each of its days); days without tasks are left out. A repeating task marks only its next date: Month's projected occurrences are left out, to keep the publication small and the count the tasks a person can tick. `weekStart` is the app's first day of the week (Settings → Date & time, 0 = Sunday), `dayView` whether the current workspace has Calendar on (workspace-feature-switches). Locked: no `days`.

Separate bridge methods were rejected: one call, one stored string and one prune keep the three widgets consistent with each other.

### D2 — The widgets' task set

The three lists start from one set: not deleted or completed, not kept (`withoutKept`), not in an archived or trashed project, no graduated habit (`withoutArchived`). That is what the app's Today, Upcoming and Month show. The Today widget used only the first two, so a task of an archived project stayed on it; it now uses the set too. Tasks assigned to someone else stay out of Today and Upcoming as in the app (personal-views-assignee); the calendar counts them as Month shows them. Workspaces: the app's lists show the current workspace; the widgets, like the Today widget before this change, cover every workspace of the account (a home screen is not in a workspace). Only the calendar's tap target follows the current workspace (D4).

### D3 — Upcoming widget: the Today list with day headings

`UpcomingWidget` uses its own copy of the Today layout (title "Upcoming", the header opens `/upcoming`) and `UpcomingListService`, whose factory shares the row and heading drawing with Today's. The model's `upcomingItems(pending)` returns a `Day(date)` heading before each day's rows, then `More(n)` for tasks not published. A heading reads "Tomorrow" for the day after today, else the weekday and date in the phone's pattern (`EEEMMMd`). The row's details line is `time · project` (the date is the heading).

Completing is the Today widget's path unchanged: `WidgetActionActivity`, the queue, one hidden run at `/?complete=…`. The pending tick is keyed by occurrence: `id` for a Today row (as stored now) and `id@date` for an Upcoming row. A publication confirms an `id@date` tick when no Upcoming row has that id on that date, so a repeating task that moves to its next date shows again there at once instead of staying hidden for 30 minutes; `id` ticks are confirmed by Today's rows as before. A Today tick also hides the task's Upcoming rows until confirmed.

### D4 — Calendar widget: a grid of RemoteViews, no service

`CalendarWidget` draws six week rows of seven cells with `RemoteViews.addView`, from `CalendarModel.grid(month, weekStart)` (pure, `java.time`). Each cell is one of three layouts (this month, another month, today), so no colour is set from code (#966): numbers in `widget_text` or `widget_muted`, today in `widget_accent` with a ring, and a dot in `widget_accent` under a day with tasks. Each cell has its own pending intent (distinct by its address), opening `/day/<date>` when `dayView`, else `/upcoming`; the month name opens `/month/<YYYY-MM-01>` or `/upcoming`. The weekday letters follow `weekStart`, or the phone's locale when the publication has none.

The arrows are broadcasts to the provider (`ACTION_MONTH` with the widget id and a step); the month shown is stored per widget id (`Prefs.calendarOffset`, 0 to 5, removed in `onDeleted` and with the server's data). An arrow is hidden at either end. A collection (`GridView`) was rejected: the grid is never more than 42 cells and needs no scrolling.

### D5 — Sizes

Upcoming as Today (from 2×2). The calendar's week rows share the height by weight; it opens at 4×4 and resizes down to `minResizeWidth` 180 dp by `minResizeHeight` 260 dp. A cell is a frame: the number in the middle (at least 24 dp, growing with the font size) and the dot at its foot, taking no height of its own, so six rows fit the header and the weekday row at a large font size. The update line keeps to one line.

### D6 — A tick names its occurrence

A run that completes a repeating task advances it, so a tick sent twice (a second run of the chain, another device that completed it meanwhile) would advance it twice. Each row carries `due`, its task's due date, and the publication announces `complete-on` in `actions`. A tick on such a row is queued as `<id>@<due>`, and the web app completes the task only while it is still due that day (`applyWidgetComplete`); a task no longer due then is left alone. Without `complete-on` (an older web app, which would look the entry up as an id) the shell sends the plain id, as before. A row without a due date (Today by its deadline or start, Upcoming by its deadline) sends the plain id too. A tick in Upcoming (`id@date`) also hides the task's Today row until confirmed, as a Today tick hides its Upcoming rows.

### D7 — The app's today

Upcoming's "Tomorrow", the calendar's ring and the month the arrows count from follow the app's logical day (Settings → Date and time, a day that starts after midnight), not the phone's date. The publication carries `today` and `dayStart` (minutes after midnight); the shell works the logical day out live as the phone's local time `dayStart` minutes earlier, as the web app's `logicalDay` does, and uses `today` only without `dayStart`. One inexact alarm (`AlarmManager.set`, no permission) wakes the widgets a minute after the next day starts, re-armed on every redraw while an Upcoming or Calendar widget is placed. A publication that differs from the stored one only by an `updatedAt` less than a minute later redraws nothing.

## Data model

No op, table or field change. The publication gains optional `upcoming`, `calendar`, `today`, `dayStart` and per-row `due`, and `actions` may list `complete-on`; a completion address may carry `<id>@<date>`. The app's private storage gains `calendarOffset:<id>`; pending ticks may now hold `id@date` keys, which an older app never matches against a row.

## Size

Two providers, a service, five small layouts and two vector drawables: a few kilobytes of APK, no dependency. The web publisher adds a few lines to an already loaded module; the publication grows by at most 50 rows and about 190 date counts.

## Interface budget

The widgets are not web screens. Upcoming: one header row, one line for the update time, one scroll region; a row shows at most three properties (title, time, project). Calendar: one header row (arrows, month, update time), one weekday row, the grid; no scroll region.

## Risks

- A cell's tap opens the app through `PendingIntent.getActivity` from the launcher (a foreground start), as Today's header does.
- The grid's "today" is the phone's date at the last draw; the widget redraws with every publication (at least hourly) and on every arrow tap.
