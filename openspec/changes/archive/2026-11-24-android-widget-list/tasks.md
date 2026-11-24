# Tasks

## 1. Web app

- [x] 1.1 `shellWidget` publishes `project` (not for the Inbox) and `date` (overdue rows only) per task, never while locked, and `actions: ["complete"]`. Verified: `web/src/lib/shellPublish.test.ts`, the bridge fixtures `widget.json` and `widget-locked.json`.
- [x] 1.2 `shellUrlAction` reads `/?complete=<id>`; `handleShellUrl` completes the task through `completeTask` only in a background run, and `startBackgroundRun` waits for it. Verified: `web/src/lib/shellActions.test.ts`, `web/src/lib/shellBackground.test.ts`, the bridge fixture `actions.json`.

## 2. Android widget

- [x] 2.1 `WidgetModel`: every published row with `project` and `date`, `canComplete` from `actions`, the item list with Earlier and Today headings, pending completions hidden and pruned (absent from a publication, or 30 minutes old). Verified: `WidgetModelTest`, `BridgeFixtureTest`.
- [x] 2.2 The Today widget as a scrolling list (`TodayListService`), a completion circle per row, `+` for quick add, the empty state, a tap opening the task; `WidgetActionReceiver` stores the pending id, redraws and enqueues one hidden run at `/?complete=<id>` per tick, one after another. Verified: `make android` (unit tests, lint, translations, build), `WidgetTest` on the emulator.
- [ ] 2.3 A check on a real Android phone: scrolling, ticking online and offline, a repeating task, light and dark, resizing (after the merge; a cloud session has none). Left open: it needs a real phone; the steps are in the pull request.

## 3. Docs, release

- [x] 3.1 Docs: `docs/android-app.md` Widgets and `mobile/README.md` (files, `publishWidget` shape, the completion address). Verified: `make docs-check`.
- [x] 3.2 Changelog fragment `changelog.d/Added/android-widget-list.md`. Verified: `make repo-check`.
