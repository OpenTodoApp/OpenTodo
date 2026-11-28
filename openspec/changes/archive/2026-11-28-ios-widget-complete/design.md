# Design

## Context

The iPhone Today widget (`OpenTodoWidget/TodayWidget.swift`) draws the last `publishWidget` payload, which the app stores in the App Group (`WidgetPublication`, `Store`). The Android Today widget already completes a task from its row (android-widget-list D2, D3; android-upcoming-calendar-widgets D6): the tap hides the row, queues the tick, and a hidden background run opens `/?complete=<id>&complete=…`, which the web app applies through `completeTask`, only in a run that lists `background`. The iPhone app has the same hidden run (`HiddenRun` in `BackgroundRefresh.swift`, capabilities `reminders`, `widgets`, `background`). The web app's side exists and does not change.

## Decisions

### D1 — An App Intent behind a button, iOS 17 and later

`CompleteTaskIntent` (an `AppIntent` in the widget extension, not offered in Shortcuts) takes the task's id. Each row is the circle, a `Button(intent:)`, beside the row's link, which still opens the task. The circle is drawn only when `#available(iOS 17.0, *)`, the publication lists `complete` and the account is not locked; otherwise the row is drawn as before. Its accessibility label is "Complete <title>". The intent runs in the extension's process and only writes two small files to the App Group; it makes no request and writes no task data.

### D2 — Android's queue and hidden rows, in the App Group

- `widget-pending.json`, `{id: ms}`: the rows hidden. The view filters them out and lowers the header's count (and the overdue count) by the hidden rows, as `WidgetModel.visibleCount` does.
- `widget-queue.json`, `[completion]`: what the web app is to apply. A completion is `<id>`, or `<id>@<due>` when the publication lists `complete-on` and the row has a due date (`WidgetModel.completion`), so a repeating task is advanced once.
- `completePath` builds `/?complete=a&complete=b` with Java's `URLEncoder` rules (a space as `+`), so every address of `actions.json` `completePaths` is built byte for byte.
- A publication prunes the pending ticks it no longer lists, as `WidgetPending.prune` does. Changing the server deletes both files.

The tick is refused (nothing hidden, nothing queued) when the stored publication does not list the task, does not list `complete`, or is locked.

### D3 — The web app applies the queue the next time the app runs

A widget cannot start the app or a web view, so the queue waits for the app:

- **Opened:** on `didBecomeActive` the app takes the queue and runs `HiddenRun` at the address beside the visible app, under a background task so that leaving the app at once does not cut it short. The visible app never applies it: the web app refuses `?complete=` without `background`.
- **Hourly refresh:** the background refresh's run opens the queue's address instead of the start page when there is one.

A run that is already going is never replaced, so the queue is taken only when a run can start; ticks queued meanwhile go with the next one.

Android hides a row for 30 minutes after the tick because its run starts at once. Here the run can be hours later, so a row stays hidden while its tick is in the queue, and the 30 minutes start when a run takes it: a completion that never applies (a locked account, a login wall, a page that cannot load) shows the task again 30 minutes after that run. The widget's timeline adds an entry for that moment so the row comes back without a publication.

Rejected: a `LiveActivityIntent` to run the intent in the app's process (a trick meant for Live Activities, and the app would still have to run the web view in the background within the intent's few seconds); writing the op from Swift (a second op writer, against "all data writes go through ops"); opening the app on each tick (the point is to stay on the home screen).

## Data model

No op, table or field change. The shell reads two fields the web app already publishes: `actions` and `tasks[].due`. The App Group gains two files, deleted with the server's data.

## Size

A few hundred lines of Swift, no dependency. No container, web bundle or runtime memory change.

## Interface budget

The widget is not a web screen. A row gains one control, the circle; nothing else is added.

## Risks

- Two web views of the app run at once when the app is opened with a queue, as on Android when the app is open during a widget run; they share storage, and the op log makes the order irrelevant.
- The two files are written by two processes; each write is atomic, and a lost race at worst shows a row again or sends a tick twice, which the web app ignores (a completed task is left alone).
