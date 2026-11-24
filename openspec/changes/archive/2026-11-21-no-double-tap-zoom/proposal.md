# Proposal

## Why

On a phone or tablet a quick double tap on the app zooms the page in (GitHub issue [#1386](https://github.com/OpenTodoApp/OpenTodo/issues/1386)). It happens by accident, when a row or a button is tapped twice in a row, and the page then has to be pinched back. The app has no use for double-tap zoom: no screen is meant to be read that way, and pinch zoom already enlarges anything for people who need it.

## What Changes

- **Double-tap zoom is off on touch screens.** Every element on a device whose primary pointer is coarse gets `touch-action: manipulation`: panning and pinch zoom stay, double-tap zoom goes, and with it the short delay some browsers put on a tap while they wait for a second one.
- **Pinch zoom stays,** as the design system requires, for everyone and on every screen. Elements that turn touch gestures off themselves (drag handles, sheet grips, the notes graph) keep their own `touch-action`.
- **Nothing changes with a mouse, a trackpad or a keyboard.**

Out of scope: a setting that turns pinch zoom off. The issue asks for it as an opt-in; it is a separate decision about the accessibility rule, kept on the table in #1386.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: the "Fields never zoom the screen on touch" requirement says double-tap zoom is off and pinch zoom stays.

## Impact

- `web/src/index.css`: one rule in `@layer base`, so Tailwind's `touch-none` and inline styles still override it.
- No bundle impact beyond a few bytes of CSS; no server, sync or data change.
