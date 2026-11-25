# Tasks

Android tasks are verified by `make android` (unit tests, lint, debug build) in CI's Android job, which runs when ci.yml is dispatched. iOS tasks are verified by `make ios` on a Mac. Neither platform is built in `make check`; the declarations both must agree on are checked by `scripts/repo-checks.test.mjs` (`make repo-check`).

## 1. Android

- [x] 1.1 `res/xml/shortcuts.xml`: `add_task` (`opentodo-open:/?add=`), `today` (`opentodo-open:/today`), then `change_server`, with the widgets' strings as short and long labels (in every `values*/strings.xml` already); icons `ic_shortcut_add` and `ic_shortcut_today`. Verified by `repo-checks.test.mjs` ("both shells offer Add task, Today and Change server on the app icon") and `make i18n-check`; lint and build in CI's Android job.
- [x] 1.2 `ShortcutActivity` (D5) as every shortcut's target, forwarding only what `Shortcut.forwards` allows to `MainActivity`. Verified by `ShortcutTest` in CI's Android job and by `repo-checks.test.mjs` (target and manifest entry).
- [x] 1.3 `MainActivity` drops a Change server launch intent when it replays the launch intent after the first-run screen. Verified by the device run (3.2).

## 2. iOS

- [x] 2.1 `project.yml` and `Info.plist`: `add-task`, `today`, `change-server`, in that order; the three titles in `InfoPlist.xcstrings` in every shipped language. Verified by `repo-checks.test.mjs`.
- [x] 2.2 `AppModel.perform(shortcut:atLaunch:)`, `windowReady()` and the `today` host of `handle(url:)`; Change server does nothing without a server. Verified by `ShellDataTests` (`testTheIconQuickActionsOpenTheirScreens`, `testTheChangeServerShortcutAsksFirst`, `testChangeServerAtLaunchAsksOnceTheWindowIsReady`, `testChangeServerWithoutAServerDoesNothing`) in `make ios`.
- [x] 2.3 `QuickActionSceneDelegate` for window scenes, reading the cold start's item in `scene(_:willConnectTo:options:)`; `StatusBarInstaller` calls `windowReady()`; `ShellView` loads a waiting path as its first page. Verified by the build in `make ios` and the device run (3.2).

## 3. Docs and check

- [x] 3.1 `docs/android-app.md` and `docs/ios-app.md` name the three actions; `make docs`, `make docs-check`.
- [ ] 3.2 Device run on an Android phone and an iPhone: each action from a running app (an open sheet stays) and from a cold start, a cold start into a restored iOS scene session, before the first start, Change server's confirmation (once, also at a cold start), and the labels in German.
- [ ] 3.3 `make check`; CI's Android job green.
