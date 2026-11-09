# Proposal

## Why

The Focus timer's end-of-session tone is two notes of 120 ms at a low volume. In deep focus, with music on or across the room it is easy to miss, and the session runs into the next one unnoticed (issue #1005).

## What Changes

- **One choice for the sound at the end of a session:** Settings → General → Focus → Sound becomes **Off**, **Short** or **Long**, replacing the on/off switch. Off stays the default; Short is today's tone.
- **Long:** the same generated two-note tone, louder, repeated about once a second until the person acknowledges it (any click, tap or key press in the app) or for 10 seconds, whichever comes first. On a phone that can vibrate, and while haptics are on (Settings → Appearance), each repeat also vibrates.
- Still generated on the device with the Web Audio API: no audio file, no network. The existing rules stay: the tone plays only while the app is shown (a hidden tab gets the existing system notification and the tone when shown again), once per session end.
- **Synced, additive:** a new `user_prefs` field `focus_alert` (`"short"` or `"long"`; empty or unknown reads as short) beside the existing `focus_sound` (`"on"`/`"off"`), which keeps its meaning. Choosing Off writes `focus_sound = "off"`; Short or Long writes `focus_sound = "on"` and `focus_alert`. A 1.0 client reads `focus_sound` as before and plays the short tone for Long.

Not **BREAKING**: one additive op field, no environment variable.

## Out of scope

- A system notification while the app is shown, or a local notification through the native shells: the existing hidden-tab notification (service worker) is the notification path; the shells' bridge only schedules task reminders and has no general "show now" call, so nothing is added there.
- Do not disturb: the web exposes no such state, so nothing is read; the system's own silent and focus modes apply to the sound and vibration as they do today.
- A volume setting for the alert, other sounds or an audio file.

## Roadmap

A comfort follow-up of `focus-mode` (shipped), from issue #1005.

## Capabilities

### Modified Capabilities

- `focus-mode`: the "Done state and tone" and "Focus preferences" requirements gain the Short/Long choice.

## Impact

- **Op schema:** `user_prefs.focus_alert` (string, default `""`), additive in `internal/sync/ops.go` `Schema` and the generated files; `docs/sync.md`.
- **Web:** `web/src/lib/focus/prefs.ts` (reading and the combined write), `web/src/app/focus/FocusSettings.tsx` (one Select), `web/src/app/focus/useFocusTimer.ts` (choosing the alert), a new lazily loaded `web/src/lib/focus/alert.ts` (the long alert). First-load size: a few bytes; the long alert is a separate chunk.
- No server behaviour, no dependency.
