# Tasks

## 1. Android shell

- [x] 1.1 `QuickAddNotification.kt` holds three parts, verified by `QuickAddNotificationTest` (requests, answers and the reply address from the shared fixture `bridge/quick-add-notification.json`) in CI's Android job:
  - the `quick-add` channel (minimum importance, no badge, no sound);
  - the ongoing notification: the body opens `/?add=`, and Add task takes the title inline or opens quick add;
  - the reply receiver, which enqueues an expedited hidden run at `/?add=<text>&id=<id>` while the switch is on, and the notification of a reply the run did not save (`QuickAddNotificationTest.readsWhatTheRunSaved`).
- [x] 1.2 `Bridge.kt` lists `quick-add-notification` with a screen only and handles `quickAddNotification`, asking for the permission on Android 13+; verified by `BridgeFixtureTest.capabilitiesOfTheVisibleAppAndOfABackgroundRun` and `QuickAddNotificationTest.onlyTheVisibleAppListsTheCapability`
- [x] 1.3 Restored at boot, after an app update and at app start; removed on Change server (`cancelAll`, `Prefs.clearServerData`); verified by the device checks in the pull request

## 2. Web app

- [x] 2.1 `lib/shellQuickAdd.ts` and `lib/shell.ts`: the bridge call, with `reply` false for an encrypted account, sent again when encryption changes, and `on: false` on sign-out; verified by `npx vitest run src/app/quickAddNotification` in web/
- [x] 2.2 A background run saves a non-empty `?add=` through `createTask` with quick-add parsing and waits for it, while the visible app still only prefills; verified by `npx vitest run src/app/quickAddNotification src/lib/shellActions src/lib/shellBackground src/lib/shellBridge.fixture`
- [x] 2.3 Settings → Capture → Quick add shows the Quick add notification card, only with the capability; verified by `npx vitest run src/app/quickAddNotification` and `make i18n-check`

## 3. Docs and check

- [x] 3.1 `docs/android-app.md`, the changelog fragment and the ROADMAP row; verified by `make docs` and `make docs-check`
- [ ] 3.2 `make check` passes, CI's Android job (unit, lint, build, emulator) is green, and the pull request's device checks pass on one phone with Android 13 or later and one with Android 8 to 12
