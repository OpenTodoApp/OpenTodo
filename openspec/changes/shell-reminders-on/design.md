# Design

## Context

- The per-device switch is the meta key `shell:notifications`, read with a default of `false` (`web/src/lib/shellPublish.ts`, `shellNotificationsEnabled`). While it is off, `publishReminders` hands the shell `[]`. The titles option is `META_INCLUDE`, also `false` by default and shared with web push in a browser.
- Android asks for `POST_NOTIFICATIONS` inside `scheduleReminders` when the schedule is not empty and the bridge has a host (a screen), and, once ever, opens the exact-alarm settings page from the same call (`Bridge.kt`, `exactAlarmAsked`; `MainActivity`).
- iOS asks inside `Reminders.apply` on the first non-empty schedule (`requestAuthorization`), from the visible app and from a background run alike.
- A background run is `HiddenRunWorker` on Android (a `delay(30_000)`, then the web view is destroyed) and `BackgroundRefresh` on iOS (30 seconds, ending 5 seconds after the page finished loading). Both offer the bridge without a screen: capabilities `reminders`, `widgets` (and `geofences` on Android).
- `setShellNotifications(true)` already stores the setting off when the shell answers `denied`.
- The web app marks `ot:sync-idle` when the first sync settles (`web/src/lib/perfMarks.ts`), and `shellActions.ts` performs a notification action from the address a run is opened at.

## Goals / Non-Goals

**Goals:** a fresh install shows the first reminder as a system notification with its task's name, without a visit to Settings; nobody is sent to a settings page unasked; a background run lasts as long as its work.

**Non-Goals:** push; changing what a browser or an installed web app does (web push stays opt-in there); new settings.

## Decisions

### D1. Unset means on, in a shell only

`shellNotificationsEnabled()` and `shellTitlesEnabled()` read their meta key with a default of `true`. Both are only called on the shell path (`publishReminders`, `ShellNotifications`); the browser's push settings read `META_INCLUDE` through their own code and keep `false`. A stored `false` stays `false`, so a user who turned either off keeps it off. No migration, no new key.

Alternative: a first-run sheet that asks "Turn on reminders?". Rejected: the system's own question already asks exactly that, and a sheet before it is one more thing to dismiss (CLAUDE.md: fix the flow, do not add helper screens).

### D2. The question comes with the first reminder, in the visible app

Nothing changes on Android: the permission is requested only when a non-empty schedule arrives and the bridge has a host. iOS gets the same rule: a background run (`interactive == false`) no longer calls `requestAuthorization` when the status is not determined; it stores the schedule for the next visible hand-over and answers `denied`.

The web app must not read a background run's `denied` as the user's answer. `publishReminders` stores the setting off on `denied` only when the shell has a screen, which it knows from a capability only the visible app lists (`links`). So D1's default survives until a person has actually been asked.

### D3. Exact alarms: a notice with a button

- Android: `scheduleReminders` stops calling the settings page; `exactAlarmAsked` is removed. It keeps answering `exact-denied`.
- New bridge method `openAlarmSettings()`, capability `alarm-settings`, visible app only, API 31+ (below that exact alarms need no permission and the capability is not listed): opens `ACTION_REQUEST_SCHEDULE_EXACT_ALARM` for the package.
- The existing `BootReceiver` already re-arms on `ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED`, which makes the stored reminders exact after Allow.
- Web: when a hand-over from the visible app answers `exact-denied` and the meta key `shell:exactNoticed` is unset, show one action toast, "Reminders may arrive a few minutes late", with **Allow**, and set the key. `ShellNotifications` reads the current answer when it opens (it re-publishes) and shows its existing notice with the same button.

Alternative: `USE_EXACT_ALARM`, granted at install. Rejected: Google Play restricts it to alarm clocks and calendars, and a refusal there would block every release.

### D4. A background run says when it is done

- Capability `background`, listed only by a background run, with method `backgroundDone()`.
- Web (`web/src/lib/shellBackground.ts`, started from `main.tsx` only when the capability is listed): waits for the first of sync idle, offline, signed out or locked, at most 45 seconds; if the run was opened at a notification action, waits for that action's operation to be stored; lets the publishers hand over (one debounce); then calls `backgroundDone()`.
- Android: the worker waits on a `CompletableDeferred` completed by the bridge, with `withTimeoutOrNull(90_000)`, then destroys the web view. iOS: `backgroundDone` ends the task at once; the system's own expiry stays the limit, and the "5 seconds after load" rule stays for a web app that does not know the capability.

### D5. Wording

`ShellNotifications` picks the denied and exact-alarm texts by `shell().platform`: "Allow notifications for OpenTodo in the iPhone's Settings" on iOS. New strings are translated in every shipped language.

### Data model, size

No op field, no table, no server route. Two meta keys change their default, one is added (`shell:exactNoticed`); all are per device and never synced. `shellBackground.ts` is imported lazily, only in a background run; the first load gains the toast call and the default change, under 0.3 KB gzip.

### Interface budget

Settings → Notifications keeps its rows; the exact-alarm notice gains a button. The one-time notice is the existing action toast. No new chrome, destination, scroll region or shortcut.

## Risks / Trade-offs

- **A question the user did not expect.** After the update, an existing install that never used the switch is asked for notifications when its next reminder is scheduled. That is the purpose of the change, and the changelog says it.
- **Titles on the lock screen by default.** A task's name can show on a locked phone. Encrypted accounts are unaffected, the switch is one tap, and the phone's own setting hides notification content. Named in the docs and the changelog.
- **Cannot be verified here.** The permission timing and the background run need phones; unit tests cover the decisions and the tasks end with a device checklist.
- **`links` as "has a screen"** is an indirect signal. Both shells list it only in the visible app, and the fixtures pin that.
