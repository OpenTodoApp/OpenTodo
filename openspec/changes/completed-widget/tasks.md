# Tasks

## 1. Published data

- [ ] 1.1 Build a 7-day completed-per-day series (`{ day, done }`) from `lib/stats.ts` for the viewer's logical days, and add it to the published widget blob (`shellPublish.ts` → `ShellWidgetData`), recomputed with the Today data; numbers and dates only. Verify: a unit test of the series and that it is republished on a change; locked/unlocked behaviour matches Today.

## 2. iOS widget

- [ ] 2.1 A second WidgetKit widget, "Completed" (medium), reading the published series: today's count large and a small bar chart of the recent days, the update time, a tap opening the app; theme colours. Verify: builds in the iOS target; a device check (freeze permitting).

## 3. Android widget

- [ ] 3.1 The same as a second Android app-widget reading the same stored blob (also closes #1240). Verify: builds in the Android target; a device check.

## 4. Docs, release

- [ ] 4.1 Docs: the apps' Widgets sections describe the Completed widget. Verify: `make docs-check`.
- [ ] 4.2 Changelog fragment `changelog.d/Added/completed-widget.md`. Verify: `make repo-check`.
