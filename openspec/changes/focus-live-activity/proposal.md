# Proposal

## Why

A Focus session runs while the phone is in a pocket or face down on the desk. Today the only way to see how much time is left is to unlock the phone and open the app, which defeats the point of focusing. Phone-native timers solve this with the lock screen: a Live Activity and the Dynamic Island on iPhone, and an ongoing notification with a running clock on Android. The research names Live Activities for Focus timers as one of the things a web app can never do on iOS (research §3.1, "OS-Edge Capture Surfaces", and Phase 3 item 2). A shell is what makes them possible.

There is a second, quieter gap. In the shells, a session that ends while the app is in the background says nothing. focus-mode's "Session end notification" goes through the browser's service worker, and a `WKWebView` (and Android's `WebView`) has no notification API.

## What Changes

- **A new bridge capability, `focus`**, with one method, `publishFocus(json)`. The web app hands the shell the running session's state whenever it changes: phase, timing, cycle, and the task title only where reminders may carry titles. "Nothing runs" is also published.
- **iOS: a Live Activity** on the lock screen and in the Dynamic Island. It shows the task, the phase ("Work · 2 of 4", "Short break", "Paused") and a clock that the system advances by itself (counting down for timed phases, up for Flowtime). Tapping it opens the Focus screen, and **Pause** / **Resume** links open the app on the action. The activity marks itself stale at the planned end and then reads "Session done". A local notification at the planned end replaces the service-worker notification.
- **Android: an ongoing notification** on a quiet "Focus" channel with the same content and a system chronometer, Pause / Resume actions that open the app on the action, and an exact alarm for the "Session done" notification.
- **The web app** publishes on every transition, re-publishes on start when a session is stored, publishes "nothing runs" on sign-out and when the server is changed, and handles `/focus?action=pause|resume` as it handles reminder actions. In a shell that lists `focus` it does not attempt the service-worker notification, because the shell owns it.
- No setting in OpenTodo. iOS (Settings ▸ OpenTodo ▸ Live Activities) and Android (the "Focus" notification channel) already let the user turn it off.

Not **BREAKING**. No op, field, route or environment variable. Bridge version 1 gains one capability.

## Out of scope

- Push-updated Live Activities (APNs). The timer runs on the system clock, so no updates are needed while the app sleeps (design D2).
- Buttons that change the session without opening the app. They would need the hidden web run to edit the device's timer state in the background (design D4).
- Starting a session from the lock screen, Siri or a widget. `apple-shortcuts` covers opening the app; starting a timer is a later change.
- Showing another device's session. The timer state stays on the device (focus-mode). `focus-session-readable` makes the running session readable through the API and MCP instead.
- Android 16 "Live Updates" promoted notifications. They can follow once the platform settles.
- A watch app.

ROADMAP item advanced: "Next: Native shells" and milestone 0.20 "Everywhere" of the 1.0 plan.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `native-shells`: the `focus` capability, the iOS Live Activity and the Android ongoing notification. ADDED requirements only.
- `focus-mode`: the running session is shown by the shell outside the app, and the shell owns the session-end notification. ADDED requirements only. "Timer state stays on the device" is not modified: the shell is part of the same device, and what it receives is deleted with the rest of the shell's data.

## Impact

- **Data model, sync, op schema:** none. The published state lives only in the shell's private storage and the system's activity or notification.
- **E2EE:** for an encrypted account no title is handed over. The activity reads "Focus session", the same rule as the reminder schedule (native-shells "Reminders scheduled on the device").
- **API, CLI, MCP, CalDAV, vault:** none.
- **Web bundle:** under 1 KB gzip (the publisher and one address action). **Server:** unchanged. **iOS:** an ActivityKit widget extension target, part of the existing widget extension, about 80 KB, system frameworks only. **Android:** one notification channel and a builder, AndroidX only, about 10 KB.
- **Simple-list users:** nothing new. Nothing appears unless a Focus session is started inside a shell.
