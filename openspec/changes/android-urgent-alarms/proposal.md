# Proposal

## Why

`ios-urgent-alarms` (#1954) added an `urgent` flag to reminders and rings urgent reminders as alarms in the iPhone app. On Android an urgent reminder is still an ordinary notification: one banner and one sound, silent in a pocket. #2023 asks for the Android twin: the full-screen alarm that the system clock app shows, ringing on the alarm stream until it is answered.

## What Changes

- **The Android app rings an urgent reminder as an alarm.** At its firing time it posts the reminder on its own **Urgent reminders** channel: the phone's alarm sound on the alarm stream, repeated until it is answered, and a full-screen alarm over the lock screen with the task's title (or the generic text), the time, **Done**, **Snooze 10 min** and **Dismiss**. These are the notification's own actions and go through the web app's operations in the background, as today, once per firing. Swiping the notification away or opening the notification shade only silences it.
- **Exact when allowed.** An urgent reminder is armed with `setAlarmClock` when the app may set exact alarms, so it rings on time in Doze and shows as the phone's next alarm; without that permission it is armed inexactly, as every reminder is, and still rings when it fires.
- **The permissions are asked when the user turns Urgent on.** A new capability `urgent-alarms` with one method, `allowUrgentAlarms()`: the web app calls it when the user marks a reminder urgent in the visible Android app, and the shell opens, once per device, Android's page for what is missing: **Alarms & reminders** (Android 12+), then **Full-screen notifications** (Android 14+). Never at launch, at a hand-over or in a background run.
- **Graceful fallback.** Without the full-screen permission the alarm is a heads-up notification that still rings on the alarm stream; without notifications nothing rings, as for any reminder.
- **Do Not Disturb** is Android's: the alarm is an alarm (`CATEGORY_ALARM`, alarm audio), so it sounds when the user's Do Not Disturb settings let alarms through (Android's default) and is silent under "Total silence". The app asks for no Do Not Disturb access.
- **`USE_FULL_SCREEN_INTENT`** is added to the manifest and to `store/permissions.txt`; `store/play-review.md` gains the Play Console answer.

Not **BREAKING**. No op field, no route, no environment variable. The bridge gains one capability and one method; an older web app never calls it and an older shell never lists it.

## Out of scope

- A custom alarm sound, an alarm volume of its own, and silencing the alarm by itself after some minutes (it rings until answered, like the iPhone alarm).
- Asking for Do Not Disturb access (`ACCESS_NOTIFICATION_POLICY`) to ring through "Total silence".
- `USE_EXACT_ALARM`, which Play reserves for alarm clock and calendar apps.
- A separate F-Droid and Play build: both declare the same permissions; on Play the full-screen permission is off by default on Android 14+ until the user allows it.
- Urgent reminders in the browser and by push to the browser.
- Ringing before the first unlock after a restart (direct boot): the schedule lives in credential-protected storage and the actions need the web app, so alarms are armed again at the first unlock. A follow-up can keep a device-protected copy of the urgent schedule.
- An `urgent` flag in the push payload: a push rings as an alarm only for a reminder the phone's schedule holds as urgent. A follow-up can add the flag to the server's push message.

ROADMAP item advanced: "Shells that feel native".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: the Android app rings urgent reminders as alarms (ADDED requirement).
- `reminders`: "Urgent reminders" no longer says the Android app fires an urgent reminder as an ordinary one (MODIFIED).

## Impact

- **Android:** `ShellReminder.urgent`, parsed and stored; `Scheduler.arm` uses `setAlarmClock` for an urgent reminder when exact alarms are allowed; `Notifier` posts the urgent channel's notification with a full-screen intent; a new `AlarmActivity` (shown over the lock screen); `UrgentAlarms.nextAsk` (the asking rule, pure); `allowUrgentAlarms` on the bridge and the host. One new string (the channel's name) in the app's ten languages, one layout.
- **Web:** `allowUrgentAlarms()` in `lib/shell.ts`, called by the reminder menu's **Urgent** when it turns the flag on. Under 0.1 KB gzip, no new string.
- **Bridge fixture:** `capabilities.json` lists `urgent-alarms` among the visible app's capabilities and `allowUrgentAlarms` among the methods.
- **Server, iOS, data model:** none. The agent tools' and op schema's description of `urgent` name the Android app too.
