# Haptics for outcomes and for switches and segmented controls

Part of the umbrella change `mobile-native-feel` (read its design for the order and the measure of success).

## Why

The bridge knows two haptic kinds, `tick` and `success` (`Bridge.swift:36-56`, `Haptic.kt`), and the web app plays them for completing, adding, holding a row and a few drags (`motion.ts:299-351`). Native apps also answer a toast's outcome, a switch and a segment change, and a drag lift. Toasts today have only two kinds (Undo and a failure, `app/bulk/toastStore.ts`).

## What Changes

- Three new kinds in the bridge and the shared fixture: `warning`, `error` (notification generators on iOS; `REJECT` and `LONG_PRESS` constants on Android) and `selection` (`UISelectionFeedbackGenerator`; `CLOCK_TICK` on Android).
- The web app plays `selection` when a switch flips or a segment changes by touch, `error` when the failure toast appears, `success` with a confirmation toast where one exists, and `tick` on a list drag lift.
- A shell without a kind plays `tick` instead (the fallback stays `navigator.vibrate`).

No new mandatory environment variable, no change to the op log, routes or data.

## Out of scope

- New toast kinds or toast designs (`warning` is added to the bridge now and used when such a toast exists).
- Haptics on iPad (none, as today).

ROADMAP.md: "Shells that feel native" (the mobile track after 1.6.0).

## Capabilities

### Modified Capabilities

- `native-shells`: haptic kinds `warning`, `error`, `selection`.
- `design-system`: which interactions play which kind.
