# Proposal

## Why

A reminder for something that must not be missed (leave for the airport, take a medicine, call before the office closes) is easy to overlook as a notification: it is silent in a Focus mode, quiet in a pocket and gone after one banner. #1954 asks for an optional urgent mode that rings like an alarm clock, as Apple Reminders and Todoist offer. iOS 26 lets an app schedule such alarms with AlarmKit: they sound over silent mode and Focus, fill the lock screen and keep ringing until they are stopped. The iPhone app already schedules every reminder on the phone (`native-shells` "Reminders scheduled on the device"), so it can ring the urgent ones instead.

## What Changes

- **An `urgent` flag on a reminder**, a new additive op field (`reminder.urgent`, boolean, default `false`). It is set and cleared from the reminder's menu in the task panel (**Urgent**), syncs like every reminder field, and an urgent reminder shows an alarm clock instead of a bell.
- **The iPhone app rings urgent reminders as alarms** with AlarmKit on iOS 26 and later: the alarm shows the task's title (or the generic text), **Stop** and **Snooze 10 min**. Snooze opens the app and moves the reminder through the web app's own operation, as the notification's Snooze does. The app asks for the alarm permission the first time it is handed an urgent reminder, only while it is visible, as it asks for the notification permission.
- **Fallback to a notification.** On iOS before 26, without the alarm permission, in a build made with an SDK without AlarmKit, or for a reminder handed over at its firing time, an urgent reminder is an ordinary notification. Everywhere else (the browser, push, Android) an urgent reminder is an ordinary reminder.
- **The bridge:** each entry of `scheduleReminders` gains `urgent: true` when the reminder is urgent. No new method or capability; an older shell ignores the field.

Not **BREAKING**. One additive op field, no route, no environment variable.

## Out of scope

- Ringing urgent reminders on Android (full-screen intents need their own permission review on Google Play) and in the browser. They stay ordinary notifications there.
- Setting `urgent` from quick add, the CLI, MCP tools and CalDAV. The REST reminder routes accept the field because they follow the op schema; the agent tools and the CLI can gain it later.
- A per-account default of urgent reminders, a custom alarm sound, and Live Activity countdowns before the alarm.
- Bumping the CI toolchain: `make ios` keeps building with Xcode 16.4, where the AlarmKit code is compiled out; the archive (Xcode 26) compiles it. #1733 tracks the SDK.

ROADMAP item advanced: "Shells that feel native" and the `ios-shell` row.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `reminders`: urgent reminders. ADDED requirement only.
- `native-shells`: the iPhone app rings urgent reminders as alarms, with its permission rule and fallback. ADDED requirement only.

## Impact

- **Data model, op schema:** `reminder.urgent` (kBool, default `false`, not content). Old clients ignore it; Undo and the history treat it like any reminder field.
- **Server:** the schema entry and the generated schema only; no new route or check.
- **Web:** one menu item and one icon in `RemindersField`, the flag in the shell hand-over. Under 0.3 KB gzip.
- **iOS:** `Alarms` and `AlarmKitScheduler` in `Reminders.swift` (AlarmKit behind `#if canImport(AlarmKit)` and `@available(iOS 26.0, *)`), one App Intent for Snooze, `NSAlarmKitUsageDescription` in the Info.plist in the shell's eight languages. AlarmKit is a system framework, weak-linked so the app still starts on iOS 16.4 to 18; the archive step checks that.
- **Android, E2EE, CalDAV, export:** none beyond the field travelling with the reminder (it carries no content).
