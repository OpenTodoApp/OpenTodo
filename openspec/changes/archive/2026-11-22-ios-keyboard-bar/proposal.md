# iOS: no keyboard accessory bar, and the field stays in view

Part of the umbrella change `mobile-native-feel` (read its design for the order and the measure of success).

## Why

In the iPhone app every field shows WebKit's accessory bar (previous, next, Done) above the keyboard, which no native app has. The web side keeps the focused field in view with `watchVisualViewport()` (`ui/overlay/stack.ts:260-292`), but a field at the bottom of a sheet can still end up under the bar or the keyboard while the viewport settles.

## What Changes

- iOS shell: the web view's content view returns no `inputAccessoryView` (swizzled subclass, about 30 lines of Swift), so the bar is gone; Done stays reachable through the keyboard's own return key and a tap outside.
- Web: after the keyboard opens and on each `visualViewport` resize, the focused field scrolls so its bottom is at least 12 px above `--vv-bottom`, inside its own scroller (sheet, panel or page), not the document.

No new mandatory environment variable, no change to the op log, routes or data.

## Out of scope

- Custom keyboard toolbars (formatting bars stay where they are, inside the page).
- Android (no accessory bar there).

ROADMAP.md: "Shells that feel native" (the mobile track after 1.6.0).

## Capabilities

### Modified Capabilities

- `native-shells`: no keyboard accessory bar in the iOS app.
- `web-app`: the focused field stays above the keyboard.
