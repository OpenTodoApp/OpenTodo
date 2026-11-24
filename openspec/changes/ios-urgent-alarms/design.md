# Design

## D1. One flag per reminder, synced

`reminder.urgent` is a boolean op field, default `false`. A flag on the reminder rather than on the task: a task can have a quiet reminder the day before and an urgent one at the time, which is how Todoist and Apple Reminders model it. It syncs, so marking a reminder urgent on the laptop makes the iPhone ring for it.

Rejected: a device setting "ring every reminder as an alarm" (too blunt, #1954 asks for one task), and a task field (cannot tell two reminders of a task apart).

Data model impact: additive. Old clients and the server's push ignore the field; the default makes every existing reminder non-urgent. It is not content (no title, no place), so it is not encrypted, like `kind`.

## D2. Where it rings

Only the iPhone app rings, with AlarmKit (iOS 26+). Everywhere else the reminder fires as today. The menu item is shown on every device, because the flag is a property of the reminder and the user's iPhone acts on it wherever it was set; the chip's alarm clock tells it apart.

## D3. The hand-over and the split on the phone

`shellReminders` adds `urgent: true` to an entry only when the reminder is urgent, so the existing fixtures and older shells are unchanged. The iOS shell parses it, selects the schedule exactly as before (`Reminders.select`, 64 at most, the shared cases), and then splits: an urgent reminder whose firing time is more than a second away goes to AlarmKit when alarms are allowed; every other entry is a notification, as today. A reminder handed over at its time (inside the one-minute grace) is a notification, because its duplicate check reads delivered notifications and an alarm that already rang leaves no trace.

The notification permission stays the master switch: when notifications are refused, nothing is scheduled and every alarm is cancelled, so turning reminders off on the device silences the alarms too.

## D4. The alarm permission

Same rule as the notification permission (`shell-reminders-on` D2), as a pure function `Alarms.route(available:state:interactive:)`: authorized → alarm; denied or unavailable → notification; not determined → ask only in the visible app, a background run uses a notification and leaves the question to the visible app. After a refusal iOS never asks again and the urgent reminder is a notification; the user can allow alarms later in iOS Settings → OpenTodo.

## D5. Identity, replace and cancel

AlarmKit identifies alarms by UUID. The shell derives one per reminder id (the first 16 bytes of SHA-256 of `opentodo.reminder.<id>`, marked as a version 5 UUID), so the same reminder always maps to the same alarm. On each hand-over the shell lists its alarms and computes the difference (`Alarms.changes`): an alarm whose reminder is gone, no longer urgent or moved is cancelled; a new or moved one is scheduled; an unchanged one is left alone, so a hand-over every minute does not touch the system's alarms. Sign-out, a locked encrypted account and Change server cancel every alarm (`Reminders.clear`).

## D6. Stop and Snooze

Stop is the system's: it silences the alarm and changes no data, like swiping a notification away; the reminder stays fired in the app, where it can be dismissed. Snooze is a `LiveActivityIntent` with `openAppWhenRun`, which opens the app at `/?reminder=<id>&action=snooze`, the address the notification's Snooze already uses. The web app snoozes through its reminder operation, hands the schedule over again and the alarm is set ten minutes later.

Rejected: AlarmKit's own countdown snooze, which would move the alarm on this phone only and leave the reminder's firing time unchanged on every other device.

## D7. Toolchain

CI's `make ios` builds and tests with Xcode 16.4 (iOS 18.5 SDK), which has no AlarmKit; the archive and TestFlight steps use the newest Xcode on the runner (26.3). All AlarmKit code is inside `#if canImport(AlarmKit)` and `@available(iOS 26.0, *)`, and the pure rules (parse, candidates, permission route, UUID, difference) are outside it, so the unit tests run on Xcode 16.4 and the AlarmKit calls are compiled by the archive step. Deployment target stays 16.4: the framework is weak-linked (all its symbols are newer than the target), and `ios-testflight.sh archive` refuses a binary that links AlarmKit strongly, which would stop the app from starting on iOS 18 and earlier.

## Interface budget

The task panel gains no row: one checkable item in the reminder chip's existing menu and a different icon on the chip. No new chrome, property, scroll region or shortcut.

## Size

Web under 0.3 KB gzip. iOS: about 200 lines in `Reminders.swift` (no new file, so the generated Xcode project is unchanged) and an intent, system frameworks only (AlarmKit, AppIntents); no container or memory change on the server.
