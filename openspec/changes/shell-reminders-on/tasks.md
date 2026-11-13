# Tasks

## 1. Contract

- [ ] 1.1 Add `openAlarmSettings` and `backgroundDone` to `OpenTodoShell` and `alarm-settings`, `background` to the capabilities in `web/src/lib/shell.ts`, with a `shellVisible()` helper; add both to the shared bridge fixtures with the capability lists of a visible app and a background run. Verify: `npm test` in `web/` (the fixture test).

## 2. Web app

- [ ] 2.1 `shellNotificationsEnabled` and `shellTitlesEnabled` default to on; `publishReminders` stores Off on `denied` only from the visible app. Verify: `npm test` (unset reads on; a stored off stays off; a background `denied` leaves the key unset; the browser's push settings still default to off).
- [ ] 2.2 The one-time exact-alarm notice with Allow, and the notice and button in `ShellNotifications`; texts by platform; translations. Verify: `npm test` (shown once, the button only with the capability, iOS wording), `make i18n-check`, the Settings story.
- [ ] 2.3 `shellBackground.ts`: done after sync idle or its fallbacks, after a notification action is stored, and after the hand-over; loaded only in a background run. Verify: `npm test` (each trigger, the 45 second limit with a stepped clock, not loaded without the capability), `npm run build`, `make bundle-budget`.

## 3. Android

- [ ] 3.1 `scheduleReminders` no longer opens the settings page; `openAlarmSettings` and capability `alarm-settings` on API 31+ in the visible app. Verify: unit test of the capability list by API level and host; instrumented test that a schedule starts no activity; `make android`.
- [ ] 3.2 The hidden run ends on `backgroundDone` or after 90 seconds; capability `background` only there. Verify: unit test of the wait (signal, timeout); `make android`.

## 4. iOS

- [ ] 4.1 A background run does not ask for the notification permission; it keeps the schedule and answers `denied`. Verify: unit test of the decision (interactive or not, by authorization status); the `ios` CI job.
- [ ] 4.2 `backgroundDone` ends the background task; capability `background` only there. Verify: unit test of the capability lists and the handler; the `ios` CI job.

## 5. Docs and release

- [ ] 5.1 Update `docs/android-app.md`, `docs/ios-app.md`, `docs/push-notifications.md` and `mobile/README.md` (on by default, titles, exact alarms, background runs); tick the items in `mobile/AUDIT.md`. Verify: `make docs`, `make docs-check`.
- [ ] 5.2 Add `changelog.d/Changed/shell-reminders-on.md`. Verify: `make repo-check`.
- [ ] 5.3 Run `make check`. Verify: it passes.

## 6. On a phone (owner)

- [ ] 6.1 Android, fresh install: add a task with a reminder, answer Allow, close the app, see the notification with the task's name; the exact-alarm notice and its Allow button; a reminder set on a computer fires with the app closed for more than an hour.
- [ ] 6.2 iPhone, fresh install: the same first reminder; no permission question before a reminder exists; Settings reads On.
