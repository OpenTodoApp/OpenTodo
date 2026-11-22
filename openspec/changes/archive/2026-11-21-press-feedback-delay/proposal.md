# Press feedback after a short delay, on the control under the finger

Part of the umbrella change `mobile-native-feel` (read its design for the order and the measure of success).

## Why

The touch fallback dims every pressed control at once (`index.css:1685-1693`, opacity 0.6 on `:active`). A scroll that starts on a row therefore flashes it, and a press on a button inside a row dims the row too. Native lists wait a moment before they show a press and show it on one control only.

## What Changes

- The pressed look on touch (the fallback dim, the `press-*` utilities and the row press) appears 60 ms after the finger lands, and not at all when the touch becomes a scroll in that time.
- Only the innermost interactive element under the finger shows it; its ancestors do not.
- Releasing removes it at once. Under reduced motion it is the same, since nothing animates.

No new mandatory environment variable, no change to the op log, routes or data.

## Out of scope

- New pressed colours or shapes; the designed states of `touch-pressed-states` stay.
- Mouse and keyboard presses (unchanged).

ROADMAP.md: "Shells that feel native" (the mobile track after 1.6.0).

## Capabilities

### Modified Capabilities

- `design-system`: pressed feedback is delayed and shown on the innermost control.
