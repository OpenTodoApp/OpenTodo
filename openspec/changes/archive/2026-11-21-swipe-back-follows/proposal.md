# A back swipe where the page follows the finger

Part of the umbrella change `mobile-native-feel` (read its design for the order and the measure of success).

## Why

The edge swipe (`app/edgeSwipe.ts`) only tracks the distance and fires Back or opens the menu on release (96 px, or 64 px with a flick); the page does not move while the finger does, so it feels like a gesture detector, not a page being pulled away.

## What Changes

- On a page with Back, the edge swipe drags the page with the finger and shows the previous page's edge under it (a shadow and the previous page's cached snapshot or a plain surface). Releasing past 33% of the width, or with a flick (velocity > 0.5 px/ms), finishes the back transition from where the finger left it; otherwise the page springs back.
- On a top-level page the edge swipe still opens the menu, now with the drawer following the finger.
- Reduced motion: the swipe still works, with no following; it acts on release as today.

No new mandatory environment variable, no change to the op log, routes or data.

## Out of scope

- A swipe back in the iOS web view itself (stays off: `allowsBackForwardNavigationGestures = false`).
- Swipe forward.

ROADMAP.md: "Shells that feel native" (the mobile track after 1.6.0).

## Capabilities

### Modified Capabilities

- `web-app`: the back swipe follows the finger.
