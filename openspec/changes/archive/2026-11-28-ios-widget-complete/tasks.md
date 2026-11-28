## 1. iPhone app

- [x] 1.1 `WidgetPublication`: the publication's `actions` and `tasks[].due`, `canComplete` and `canCompleteOn` (Android's `WidgetModel` rule), the completion `<id>@<due>`, the hidden rows (`widget-pending.json`) and the queue (`widget-queue.json`) with `complete`, `takeCompletePath`, `completePath`, `hidden`, the visible rows and counts; `publish` prunes the confirmed ticks (verified by `WidgetPublicationTests`)
- [x] 1.2 `TodayWidget`: `CompleteTaskIntent` and the circle on iOS 17 and later ("Complete <title>"), rows hidden and counts lowered, a timeline entry when a hidden row comes back; below iOS 17 the row as before (verified by the iOS build in CI, and on a device in 3.2)
- [x] 1.3 The queue is applied in a hidden run at its address when the app becomes active and in the hourly refresh, never replacing a run that is going; `forgetServer` deletes both files (verified by `WidgetPublicationTests`: the run's address, the old server's ticks deleted)
- [x] 1.4 Strings in `Shared/Localizable.xcstrings` (de, es, fr, it, nl, pl, pt, tr, zh) (verified by `make i18n-check`)

## 2. Tests

- [x] 2.1 `WidgetPublicationTests`: the shared fixtures `widget`, `widget-locked`, `widget-signed-out` (`canComplete`, `canCompleteOn`, `due`) and every `actions.json` `completePaths` address; a tick hides the row, lowers the counts and queues `<id>@<due>`; a locked or older publication and an unlisted task are refused; a publication prunes; the 30 minutes start when a run takes the queue (verified by `make ios` in the full CI run)

## 3. Check

- [x] 3.1 `make openspec-validate`, `make docs`, `make docs-check`
- [ ] 3.2 On an iPhone with iOS 17 or later: tick a task in the widget, open the app, and the laptop shows it completed after the next sync; on iOS 16 the widget is as before
