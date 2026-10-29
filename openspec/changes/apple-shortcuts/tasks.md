# Tasks

Shell tasks are verified with `make ios` on a Mac (unit tests in `mobile/ios/OpenTodoTests`, the unsigned build, the dependency check). Web tasks run `npm test` and `npm run build` in `web/`. The server does not change, but `go test ./...` still runs in `make check` before the last task. This change starts after `ios-distribution` has archived `ios-shell`, because the "Widgets" delta is written against that text.

## 1. Bridge capability `capture` (web side first)

- [ ] 1.1 `web/src/lib/shell.ts`: `ShellCapability` gains `capture`, and `OpenTodoShell` gains the optional `readCaptures()` and `ackCaptures(json)`. Verified by `shell.test.ts` (no call without the capability, malformed JSON gives an empty list).
- [ ] 1.2 `web/src/lib/shellCaptures.ts`: read the queue on start, on `visibilitychange` to visible and after each sync. For each entry: skip when a task with the entry's id exists locally; otherwise parse with the quick-add parser in the account's languages and create through `mutate()` with the entry's id as the task id, then acknowledge. Do nothing while an encrypted account is locked. Verified by `shellCaptures.test.ts` with fake-indexeddb: filed offline into the outbox, interrupted then re-run creates one task, a locked account files nothing, more than 50 entries are read as 50.
- [ ] 1.3 Shared bridge fixtures: `capture-queue.json` (three entries, one with a parse) and the acknowledgement payload, produced from the web code. Verified by `shellBridge.fixture.test.ts` failing when the shape changes.
- [ ] 1.4 Sign-out confirmation: when `readCaptures()` returns entries, add the sentence "N captures from Siri have not been added yet and will be discarded." Six languages through `web/src/locales`. Verified by a happy-dom test of the dialog and `make i18n-check`.

## 2. Capture queue and App Intents (iOS)

- [ ] 2.1 `CaptureQueue.swift`: an App Group file with `complete` protection holding at most 50 entries of at most 500 characters. Append, read and acknowledge are serialised. It is deleted in `AppModel.forgetServer` and on the web app's sign-out reset. Verified by `CaptureQueueTests` (cap, trim, acknowledgement removes only named ids, unknown ids ignored, file protection set) and by parsing the shared fixture.
- [ ] 2.2 Bridge methods `readCaptures`/`ackCaptures` in `Bridge.swift`; `capture` listed in `capabilities`. Verified by `BridgeTests`.
- [ ] 2.3 `AddTaskIntent`: queue, then a `HiddenRun` that waits up to 8 seconds for the acknowledgement, then the matching dialog (filed / later / once unlocked from the publication's `locked`). The full queue gets its own answer. Verified by `AddTaskIntentTests` with a fake runner (filed in time, timeout, locked, full queue).
- [ ] 2.4 `OpenQuickAddIntent` (`/?add=`), `OpenTodayIntent` (`/today`) and `TodayIntent` (answers from `WidgetPublication.load()`: count, overdue, up to 5 titles with times, "as of", counts only when `locked`, a hint when nothing was published). Verified by `TodayIntentTests` (each case) and by `AppModelTests` mapping both addresses.
- [ ] 2.5 `AppShortcutsProvider` with the phrases in `AppShortcuts.xcstrings` for en, de, fr, es, it and pt, each containing the app name. Verified by `scripts/i18n/shell.test.mjs` extended to the second catalog, and by `make i18n-check`.
- [ ] 2.6 Device run: Siri with the phone locked (filed and offline cases), the Action Button, "What's on today". Recorded in the `mobile/README.md` table.

## 3. Widgets and control (iOS)

- [ ] 3.1 Quick-add widget (systemSmall) with the button `opentodo://add` → `/?add=`. Verified by `AppModelTests` (`opentodo://add` maps to `/?add=`) and the widget preview building in `make ios`.
- [ ] 3.2 Lock-screen widgets: `accessoryCircular` count with an overdue mark, `accessoryRectangular` next tasks with `privacySensitive()` titles, `accessoryInline` summary, and an `accessoryCircular` "Add" button. All read only `WidgetPublication.load()`. Verified by `WidgetPublicationTests` (the view models: titles dropped when `locked`, at most three rows, overdue mark) and by reading the widget sources for any network call (none).
- [ ] 3.3 `ControlWidgetButton` "Add task" behind `if #available(iOS 18, *)`. Verified by the build on the iOS 16.4 deployment target in `make ios`.
- [ ] 3.4 Device run: the lock-screen widgets on a locked and an unlocked phone, and the control in Control Center. Recorded in the `mobile/README.md` table.

## 4. Shortcuts pack

- [ ] 4.1 Sources in `mobile/shortcuts/add-to-opentodo.plist` and `opentodo-today.plist`, with import questions (server address, mode, token). Quick save reads `GET /api/v1/me` first and falls back to the capture screen when encryption is on, or on 401, 403 or a 10-second timeout. Verified by `scripts/shortcuts.test.mjs`: it parses the plists and checks that every URL action is built from the imported server address, that `/share?title=` is the fallback, and that there is no other host.
- [ ] 4.2 Signing on the macOS runner on final tags (`shortcuts sign --mode anyone`), with the signed files attached to the release as `OpenTodo-Add.shortcut` and `OpenTodo-Today.shortcut`. Verified by the release of the first final tag after this change listing both files.
- [ ] 4.3 If headless signing fails in CI, document the manual signing step in `RELEASING.md` instead, and record which way works in this file. Verified by `npm run docs:check`.

## 5. Documentation and release

- [ ] 5.1 `docs/apple-shortcuts.md`: the pack (both modes, a dedicated token, never an admin token, encrypted accounts use the capture screen), and the iOS app's Siri phrases, Action Button, widgets and control. Linked from `docs/ios-app.md`, `docs/capture.md` and `docs/install-phone.md`. Verified by `npm run docs:check`.
- [ ] 5.2 `docs/ios-app.md`: the capture queue (where captures wait, when they are filed, what sign-out and changing the server do) and the new widgets. Verified by `npm run docs:check`.
- [ ] 5.3 `mobile/README.md`: the `capture` capability, the queue file, the intents and the widget kinds. Verified by `npm run docs:check`.
- [ ] 5.4 CHANGELOG entry under Unreleased. Verified by `make check`.
- [ ] 5.5 `npm test` and `npm run build` in `web/`, `make ios`, `make openspec-validate`, `make repo-check` and `make check` pass. Verified by their exit codes.
