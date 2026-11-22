# A row lifts on long press; inner scrollers do not glow on Android

Part of the umbrella change `mobile-native-feel` (read its design for the order and the measure of success).

## Why

A long press on a row arms a drag after 350 ms (`lib/dnd.ts:58`) and the row only gets `scale-[1.01] shadow-2 opacity-90` once the drag starts (`app/listDrop.ts:66-72`), with no pickup motion and no haptic. On Android, the WebView draws its own overscroll glow or stretch on top of the page's `overscroll-behavior: none`.

## What Changes

- The row rises during the hold: from 150 ms it eases to its lifted look (scale and shadow) over the remaining 200 ms, so the lift is visible before the drag starts; releasing early eases it back. Under reduced motion only the tint shows, as today.
- Android: the WebView gets `overScrollMode = OVER_SCROLL_NEVER`.

No new mandatory environment variable, no change to the op log, routes or data.

## Out of scope

- Changing what a long press does or its timing (350 ms stays).
- iOS bounce on the page (already none on inner scrollers).

ROADMAP.md: "Shells that feel native" (the mobile track after 1.6.0).

## Capabilities

### Modified Capabilities

- `task-list-presentation`: the lift shows during the hold.
- `native-shells`: no native overscroll effect on Android.
