# Design

## D1. The alarm is a notification

The ring is one notification on a channel of its own, `urgent` (**Urgent reminders**, `IMPORTANCE_HIGH`): the phone's default alarm sound with alarm audio attributes (`USAGE_ALARM`, so it plays on the alarm stream and at the alarm volume, also with the ringer silent), vibration, `CATEGORY_ALARM`, `FLAG_INSISTENT` (the sound repeats until the notification goes) and a full-screen intent that opens `AlarmActivity`. Its id is the reminder's notification id, so the duplicate rule of `shell-push` D4 holds: whichever of the alarm and a push comes first rings, the other is not shown again.

Rejected: a foreground service playing a `MediaPlayer`. It needs a foreground-service type and its own Play declaration, and the notification already stops its sound when it is answered, swiped away or cancelled.

The channel is new because Android fixes a channel's sound when it is created; the reminders channel keeps its own.

## D2. The full-screen alarm

`AlarmActivity` (not exported, `showWhenLocked`, `turnScreenOn`, no Recents entry) shows the time, the task's title or **Reminder**, and **Done**, **Snooze 10 min** and **Dismiss**. Each button does what the notification's button does (`ReminderActions.run`: the notification goes, which silences it, and the hidden web view applies the action as an operation, `/?reminder=<id>&action=<action>`), then the screen closes. A tap on the heads-up notification opens the same screen. The reminder is passed in the intent's extras, not read from the stored schedule, because a push may have removed it from the schedule by then.

Android decides when the full-screen intent is used: with the screen off or locked it shows the activity; with the phone in use it shows a heads-up notification with the same buttons.

## D3. Arming

`ShellReminder` gains `urgent` (true only for `urgent: true` in the hand-over, stored with the schedule so a reboot keeps it). `Scheduler.arm` arms an urgent reminder with `setAlarmClock` when exact alarms are allowed: exempt from Doze, on time, and shown as the phone's next alarm (its show intent opens the task). Otherwise it uses `setAndAllowWhileIdle` like every reminder, and the alarm rings when the system fires it. `BootReceiver` already re-arms the stored schedule after a reboot and a change of the exact-alarm permission.

## D4. Asking

Two permissions matter and neither is a dialog: exact alarms (Android 12+, the **Alarms & reminders** page) and full-screen notifications (Android 14+, `ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT`; granted at install before Android 14, after Android 14 granted at install outside Google Play and off by default on Google Play for an app that is not a calling or alarm-clock app). The hand-over never opens a settings page (`shell-reminders-on` D3), so asking belongs to the user's own action: turning **Urgent** on. The web app calls `allowUrgentAlarms()` then, in a shell that lists `urgent-alarms` (the visible Android app, Android 12+).

The pure rule `UrgentAlarms.nextAsk(sdk, exact, fullScreen, askedExact, askedFullScreen)` names the page to open: exact alarms first, then full-screen, each only when missing on that Android version and not asked on this device before. The shell opens it and remembers; when the user comes back to the app it opens the next one by the same rule, so both are asked in one go and never again. Afterwards the exact-alarm notice of **Settings → Notifications** stays, and the full-screen setting is in Android's settings for the app.

## D5. Fallback

- Full-screen not allowed: Android shows the notification as a heads-up instead; it still rings on the alarm stream until answered.
- Exact alarms not allowed: the alarm may ring a few minutes late (the existing notice says so).
- Notifications refused, or the **Urgent reminders** channel turned off: nothing rings, as for any reminder (the notification permission is the master switch, as on iOS).
- Android 7 and earlier are not supported by the app (minimum SDK 26).

## D6. Do Not Disturb and silent mode

The app asks for no Do Not Disturb access. An alarm-category notification with alarm audio is what Android's Do Not Disturb calls an alarm: it sounds when the user's rules let alarms through, which is Android's default for Do Not Disturb and for schedules, and is silent under "Total silence" or when the user turned alarms off in the rule. The user can also let the **Urgent reminders** channel override Do Not Disturb in its settings. The ringer's silent and vibrate modes do not mute the alarm stream.

## D7. Hand-overs, sign-out and change server

The ringing alarm is a notification, and a hand-over replaces alarms only: it never silences a ringing alarm, also when the reminder has left the schedule (as on iOS after #2020). A reminder no longer urgent, moved, dismissed, completed or deleted is re-armed or cancelled at the next hand-over, as every reminder is. Sign-out and a locked encrypted account hand over an empty schedule, which cancels every alarm still ahead; **Change server** also cancels every notification, so it silences a ringing alarm.

## D8. Google Play

`USE_FULL_SCREEN_INTENT` needs the Play Console's full-screen intent declaration (App content). OpenTodo is a task manager, not an alarm-clock or calling app, so the answer is that full-screen intents are not its core functionality: Play then leaves the permission off by default on Android 14+ installs, the app asks for it as in D4 and degrades as in D5. `store/play-review.md` holds the answer. The F-Droid and GitHub builds declare the same permission and get it at install.

## Interface budget

The web app gains no row, item or string: the existing **Urgent** item calls one more bridge method. The Android alarm screen is a new system surface outside the web app's budget: one time, one title, three buttons.

## Size

Web under 0.1 KB gzip. Android: one activity, one layout, about 150 lines of Kotlin, one string in ten languages; no dependency, no container or memory change on the server.
