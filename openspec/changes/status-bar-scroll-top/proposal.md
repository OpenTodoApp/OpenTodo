# A tap on the status bar scrolls to the top

Part of the umbrella change `mobile-native-feel` (read its design for the order and the measure of success).

## Why

On iOS a tap on the status bar scrolls the web view's own scroll view to the top, but the app's main scroller is an inner element, so nothing happens. Android has no status bar gesture, but its shells can offer the same with a tap on the page title.

## What Changes

- iOS: the shell keeps a zero-height scrollable `UIScrollView` with `scrollsToTop = true` (and the web view's own `scrollsToTop = false`); its `scrollViewShouldScrollToTop` sends a `scroll-top` event to the page over the bridge.
- Web: on `scroll-top`, the main scroller of the current page (the list, the note, the calendar day) scrolls to its top, smoothly unless reduced motion is on; an open sheet or panel scrolls itself instead.
- A new bridge capability `scroll-top` so the page knows to listen.

No new mandatory environment variable, no change to the op log, routes or data.

## Out of scope

- Android equivalents beyond what exists (a tap on the page title already scrolls to the top in lists).
- Scrolling to the top inside dialogs.

ROADMAP.md: "Shells that feel native" (the mobile track after 1.6.0).

## Capabilities

### Modified Capabilities

- `native-shells`: a status bar tap reaches the page.
- `web-app`: the page scrolls its main scroller to the top on that event.
