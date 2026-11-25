# Design

## Context

The Today widget (`TodayWidget`, `WidgetModel`) draws the web app's last publication (`publishWidget`, native-shells D6): five fixed `TextView`s, a count and the update time. Data reaches it only through the bridge; the widget never makes a request. Notification buttons already change data without the visible app: `NotificationActionReceiver` enqueues a `HiddenRun` at `/?reminder=<id>&action=done`, the web app applies it through `completeTask`, and the background run waits for it before `backgroundDone()` (shell-reminders-on D4). This change reuses that path for the widget.

## Decisions

### D1 — A collection widget fed by a `RemoteViewsService`

The list is a `ListView` filled by `TodayListService` (a `RemoteViewsService`), whose factory reads the stored publication from `Prefs` on `onDataSetChanged`. It works from API 26 (the app's minimum) with no dependency. `RemoteViews.RemoteCollectionItems` (API 31) or `androidx.core:core-remoteviews` would save the service, but the first needs a fallback anyway and the second is a new dependency for one class. The factory runs in the app's process and only reads private storage, so the list works offline and the widget still makes no request.

Rows set no colours in code: the title uses `@color/widget_text`, the details `@color/widget_muted` and the overdue date `@color/overdue` in the row layout, so the launcher resolves light and dark itself (#966). A group heading is its own view type (`Earlier`, `Today`), shown only when both groups have rows; the web app's Today list is already sorted overdue first.

### D2 — Completing is an op the web app writes, never the shell

A row has two touch targets: the circle and the rest. The list's pending-intent template is an activity intent (mutable, explicit component) to `WidgetActionActivity`, which is not exported, draws nothing (`Theme.NoDisplay`, `excludeFromRecents`, `noHistory`) and finishes at once; each row's fill-in intent carries the task id and `open` or `complete`. A broadcast template whose receiver starts the app was rejected: that is a background activity start, which Android 10 and later block.

- `open` forwards to the app at `/?task=<id>`, as the old rows did.
- `complete` records the id as pending (`Prefs.widgetPending`, `{id: ms}`) and queued (`widgetQueue`), redraws (the row disappears and the count drops by one), and enqueues a `HiddenRun` on one unique, appended work chain, expedited where the system allows (`RUN_AS_NON_EXPEDITED_WORK_REQUEST` otherwise). The run takes every queued id when it starts and opens `/?complete=<a>&complete=<b>…`, so quick ticks share one web view and each id is sent exactly once; a later run of the chain that finds the queue empty ends at once. On Android 11 and earlier an expedited run shows a silent, minimum-importance "Syncing" notification while it lasts, as a foreground service must.

The web app reads `?complete=` (`shellUrlAction` → `{kind: "complete", ids}`) and completes the task with `completeTask` when it is open and not deleted, as the reminder's Done does; a repeating task moves to its next occurrence by the normal rule. The op goes into the outbox and syncs when there is a network; the background run waits for the action like a reminder action. Convergence is the op log's: a completion made offline on the widget and an edit on the laptop merge field by field.

The web app applies `?complete=` **only in a background run** (the page lists `background`). The visible app can be opened at any address by another app (`opentodo-open:` is exported), and a link that silently completes a task must not work there. The hidden run is started only by the app's own, non-exported activity.

A pending id is dropped when a publication no longer lists it (the completion was applied), and after 30 minutes regardless, so a completion that never ran (an older web app, a run that never started, an expired session or login wall, whose redirect the hidden run drops) shows the task again instead of hiding it for good.

Rejected: writing the op from Kotlin (a second op writer, against "all data writes go through ops"); opening the visible app for each tick (the point is to stay on the home screen).

### D3 — Only with a web app that knows `?complete=`

The publication gains `actions: ["complete"]`. A shell draws the circles only when it is there, so a new Android app on an older server keeps a read-only list rather than offering ticks that do nothing. `actions` is a list so later actions (Reschedule for Earlier) can be announced the same way.

### D4 — Row details

Two optional, additive fields per task: `project` (the project's name; absent for the Inbox) and `date` (the due date, `YYYY-MM-DD`, only for an overdue row, where the group heading alone does not say when). The row shows the title (two lines at most), then `time · date · project`, leaving out what is empty. Both are left out while locked, like titles. The shell formats the date with the phone's short month-and-day pattern.

### D5 — The header

`Today` and the count open `/today`; a `+` (48 dp target, "Add task") opens quick add (`/?add=`), as the Quick add widget does. The update time stays on the second line: the spec requires it, and it tells a person how fresh an offline list is.

### D6 — Extending later (#1718 and the rest of #1240)

The model is a list of items (headings and rows) built by a pure function from a publication and the pending set. A view selector would publish one list per view (`lists: {today, inbox, upcoming, …}`) and store the chosen view per `appWidgetId`; the factory already receives the widget id. An Upcoming widget is the same list with date headings. Nothing in this change has to be undone for either.

## Data model

No op, table or field changes. The bridge publication gains optional `actions`, `tasks[].project` and `tasks[].date`; older shells ignore them. The app's private storage gains `widgetPending`, deleted with the server's data.

## Size

A service, a receiver, two small layouts and a drawable: a few kilobytes of APK, no dependency, no container or web bundle change beyond a few lines in already-loaded modules.

## Interface budget

The widget is not a web screen. On it: one header row (title, count, add), one line for the update time, one scroll region; a row shows at most four properties (title, time, date, project).

## Risks

- A tick briefly starts `WidgetActionActivity`; it draws nothing and finishes in `onCreate`, so the home screen stays as it was.
- The hidden run needs the web app cached (service worker) to complete offline, as notification actions do; when it cannot load, the completion is not applied and the task reappears after 30 minutes.
