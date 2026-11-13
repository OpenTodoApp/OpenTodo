## Why

`edge-swipe-menu` (#1232) gave the left-edge swipe to the menu everywhere and turned off the iOS app's history back gesture. That left phones without a gesture back from a task, a note or a nested page. The installed web app on iOS keeps the system's back swipe, which the page cannot turn off, so the same swipe would also open the menu (GitHub issue 1323).

## What Changes

- On a page with Back (a task, a note, a nested page), the edge swipe goes back, as the Back button in the bar does. On a top-level page it opens the menu, as before. This is the iOS convention: back on detail screens, the menu at the root.
- The installed web app on an iPhone or iPad (Safari's standalone mode) adds no edge swipe and keeps the system's back swipe, so one swipe never does two things.
- The iOS app keeps the web view's history gesture off, since its edge swipe now goes back on its own.

Out of scope: a visible Forward control; Android (the system back gesture is unchanged).

## Capabilities

### Modified Capabilities

- `app-shell`: "Edge swipe opens the phone menu" becomes "Edge swipe goes back or opens the phone menu".

## Impact

- `web/src/app/edgeSwipe.ts` (what a swipe does, where it is watched), `web/src/app/edgeEnv.ts`, `web/src/app/Shell.tsx`. No server change, no dependency, no shortcut.
