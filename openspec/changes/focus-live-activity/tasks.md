# Tasks

Web tasks run `npm test` and `npm run build` in `web/`. iOS tasks run `make ios` on a Mac. Android tasks run `make android`. The server does not change, but `go test ./...` runs in `make check` before the last task. The iOS part needs the widget extension and App Group that `ios-shell` added, and it is easiest to land after `ios-distribution`.

## 1. Web app

- [ ] 1.1 `web/src/lib/shell.ts`: `ShellCapability` gains `focus`, and `OpenTodoShell` gains the optional `publishFocus(json)`. Verified by `shell.test.ts` (no call without the capability).
- [ ] 1.2 `web/src/lib/focus/shellPublish.ts`: build the payload from `FocusState` and the prefs (`plannedEndAt` for timed phases only, `cycleLength` from the long-break count, the title only when the device option is on and the account is not encrypted). Publish from the transitions in `useFocusTimer.ts`, on start when a row is stored, and `none` on sign-out, on lock, and when no row is stored. Verified by `shellPublish.test.ts` (each transition publishes once, a paused state has no `plannedEndAt`, Flowtime has none, the encrypted account carries no title, sign-out publishes `none` before `clearLocalData`).
- [ ] 1.3 `/focus?action=pause|resume` in `shellActions.ts`: apply through the Space transition, ignore when already in that state, then remove the parameter. Verified by `shellActions.test.ts` (pause, resume, stale action writes no op).
- [ ] 1.4 Skip the service-worker session-end notification while the shell lists `focus`. Verified by `useFocusTimer.test.tsx` (no `showNotification` call with the capability, unchanged without it).
- [ ] 1.5 Shared bridge fixtures: `focus-running.json`, `focus-paused.json`, `focus-flowtime.json`, `focus-none.json`, produced from the web code, plus the two addresses. Verified by `shellBridge.fixture.test.ts`.

## 2. iOS

- [ ] 2.1 `NSSupportsLiveActivities` in the app's Info.plist. `FocusActivity.swift` holds the `ActivityAttributes` and content state, and parses the publication with junk refused. Verified by `FocusActivityTests` parsing the shared fixtures (each state, unknown `v` refused, a missing `plannedEndAt` gives a count-up).
- [ ] 2.2 `publishFocus` in `Bridge.swift`: store the last publication in the App Group. Start, update or end the single activity, honour `areActivitiesEnabled`, end any extra activity, and set `staleDate = plannedEndAt` and the dismissal policy (design D2, D7). `focus` is listed in `capabilities`. Verified by `BridgeTests` (capability list) and `FocusActivityTests` (state-to-content mapping, stale date, at most one activity via a fake activity store).
- [ ] 2.3 Lock screen and Dynamic Island views (compact, minimal, expanded) in `OpenTodoWidget`, with `Text(timerInterval:countsDown:)`, `Text(_:style: .timer)` and the frozen paused time. "Session done" when stale. A Pause/Resume `Link` to `opentodo://focus?action=…`. Verified by the previews building in `make ios`, and by `AppModelTests` mapping `opentodo://focus?action=pause` to `/focus?action=pause`.
- [ ] 2.4 The local "Session done"/"Break over" notification at `plannedEndAt`, rescheduled on each publication and cancelled on paused, done and none. Verified by `FocusActivityTests` with a fake notification centre.
- [ ] 2.5 Cleanup in `AppModel.forgetServer` and on the sign-out reset. Verified by `AppModelTests`.
- [ ] 2.6 Strings ("Focus session", "Work · %d of %d", "Short break", "Long break", "Paused", "Session done", "Break over", "Pause", "Resume") in the String Catalog in en, de, fr, es, it and pt. Verified by `make i18n-check`.
- [ ] 2.7 Device run: a Pomodoro with the phone locked, Pause from the lock screen, the Dynamic Island on a phone that has one, the stale "Session done", the app killed and reopened. Recorded in the `mobile/README.md` table.

## 3. Android

- [ ] 3.1 `FocusState.kt` parsing the shared fixtures. Verified by `FocusStateTest`.
- [ ] 3.2 `publishFocus` in `Bridge.kt`. A "Focus" channel (low importance, no sound), and an ongoing notification with `setUsesChronometer`, `setChronometerCountDown` for timed phases and `setWhen`, plus Pause/Resume actions opening the activity at `/focus?action=…`. The content comes from a pure `FocusNotificationModel`, so it can be tested without a device. Verified by the JVM unit test `FocusNotificationModelTest` (content per state, count-down flag, the action's address, removal on `none`) and an instrumented test in `connectedDebugAndroidTest` posting and removing the notification.
- [ ] 3.3 Session-end alarm (exact, inexact when denied) that replaces the ongoing notification with "Session done"/"Break over", rescheduled and cancelled as on iOS. Cleanup on server change and sign-out. Verified by `FocusNotificationModelTest` (the alarm time per state, cancelled on paused and none) and the instrumented test.
- [ ] 3.4 Strings in `values-*/strings.xml` for the six languages. Verified by `make android` (`checkTranslations`).
- [ ] 3.5 Emulator or device run: a session with the app in the background, Pause from the notification, the session-end notification. Recorded in `mobile/README.md`.

## 4. Documentation and release

- [ ] 4.1 `docs/focus.md`: "On the lock screen" (what the iOS and Android apps show, Pause/Resume opening the app, where to turn it off, titles and encrypted accounts, auto-start waiting until the app runs). Verified by `npm run docs:check`.
- [ ] 4.2 `docs/ios-app.md`, `docs/android-app.md` and `mobile/README.md`: the `focus` capability, the payload and the cleanup. Verified by `npm run docs:check`.
- [ ] 4.3 CHANGELOG entry under Unreleased. Verified by `make check`.
- [ ] 4.4 `npm test`, `npm run build`, `make ios`, `make android`, `make openspec-validate`, `make repo-check` and `make check` pass. Verified by their exit codes.
