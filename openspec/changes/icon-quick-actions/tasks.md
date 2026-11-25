# Tasks

Android tasks are verified by `make android` (unit tests, lint, debug build) in CI's Android job, which runs when ci.yml is dispatched. iOS tasks are verified by `make ios` on a Mac. Neither platform is built in `make check`; the declarations both must agree on are checked by `scripts/repo-checks.test.mjs` (`make repo-check`).

## 1. Android

- [x] 1.1 `res/xml/shortcuts.xml`: `add_task` (`opentodo-open:/?add=`), `today` (`opentodo-open:/today`), then `change_server`, each to `MainActivity`; the labels `shortcut_add_task` and `shortcut_today` in every `values*/strings.xml`; icons `ic_shortcut_add` and `ic_shortcut_today`. Verified by `repo-checks.test.mjs` ("both shells offer Add task, Today and Change server on the app icon") and `make i18n-check`; lint and build in CI's Android job.

## 2. iOS

- [x] 2.1 `project.yml` and `Info.plist`: `add-task`, `today`, `change-server`, in that order; the three titles in `InfoPlist.xcstrings` in every shipped language. Verified by `repo-checks.test.mjs`.
- [x] 2.2 `AppModel.perform(shortcut:)` and the `today` host of `handle(url:)`; verified by `ShellDataTests` (`testTheIconQuickActionsOpenTheirScreens`, `testTheChangeServerShortcutAsksFirst`) in `make ios`.
- [x] 2.3 `QuickActionSceneDelegate` and the cold start's item in `AppDelegate`; `ShellView` loads a waiting path as its first page. Verified by the build in `make ios` and the device run (3.2).

## 3. Docs and check

- [x] 3.1 `docs/android-app.md` and `docs/ios-app.md` name the three actions; `make docs`, `make docs-check`.
- [ ] 3.2 Device run on an Android phone and an iPhone: each action from a running app and from a cold start, before the first start, Change server's confirmation, and the labels in German.
- [ ] 3.3 `make check`; CI's Android job green.
