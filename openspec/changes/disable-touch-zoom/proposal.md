# Proposal

## Why

An opt-in to stop the app zooming on a phone (GitHub issue [#1386](https://github.com/OpenTodoApp/OpenTodo/issues/1386)). Part one, a double tap no longer zooms the page, shipped for everyone in #1408. This is part two: a person who wants a more "native" feel can turn **pinch** zoom off on their device. The owner approved the shape and the label: a per-device **Allow pinch zoom** switch, **on by default**, system text size unaffected. It needs a spec change because the design system today says the app never turns off zoom (`design-system`, "Fields never zoom the screen on touch").

## What Changes

- A per-device Appearance setting, **Allow pinch zoom**, on by default. It is remembered on the device (like the other per-device appearance choices) and never syncs.
- While it is on (the default), the viewport stays `width=device-width, initial-scale=1, viewport-fit=cover` and pinch zoom works as now; while it is off, the app sets the page viewport to disallow user scaling (`maximum-scale=1, user-scalable=no`). The shells show the web app, so the web viewport governs them too.
- The ≥16 px touch-field rule is unchanged, so focusing a field never zooms whatever the setting. The device's own system text size and accessibility zoom are unaffected: this turns off only the page's own pinch zoom.
- Default behaviour, and every other device, is exactly as today.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: "Fields never zoom the screen on touch" allows the per-device switch to turn pinch zoom off.

## Design

- **D1. Where it lives.** In Settings → Appearance, shown only on a touch device. Stored under a device-storage key, default on (only a stored `off` turns it off), read at startup and on change.
- **D2. How it acts.** A small module (`web/src/lib/touchZoom.ts`) sets the `<meta name="viewport">` content from the setting through a hook in `App`: the default string when on, the default plus `maximum-scale=1, user-scalable=no` when off. No layout or token change.
- **D3. Accessibility.** Turning zoom off fails WCAG 1.4.4 (Resize text) for that device, which is why it is off only by the person's own choice and on by default. It does not touch the browser's own 200 % zoom or the OS accessibility zoom (both still enlarge the app), and the accessibility audit's "200 % zoom" row is browser zoom, not page pinch, so it is unaffected.
- **D4. Scope.** The PWA and both shells, since all three render the same web app under one viewport. No native change.

## Impact

- `web/index.html` viewport comes under the app's control when the setting is off; a new Appearance toggle; a device-storage key; a test that the viewport string follows the setting. No server, op-log, API or dependency change; negligible bundle impact.
