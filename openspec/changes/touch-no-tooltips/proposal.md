# Proposal

## Why

Tooltips name icon buttons on hover and on keyboard focus. A tap on a phone also focuses the button, and the tooltip followed it (GitHub issue [#1362](https://github.com/OpenTodoApp/OpenTodo/issues/1362)). Measured in Chromium at 360 px with touch and no key pressed: tapping the sync dot in the drawer left "Synced · Live updates connected" over the drawer until the next tap; tapping Search and commands, Assistant, Ask and the brand line flashed their tooltips before the surface they open took focus. Buttons whose menu or sheet takes focus in the same moment (Open menu, Project menu, More actions) showed none.

The tooltip already ignored focus that arrives while a press is held (issue 169). That is the order of a mouse click. A tap is different: the finger is down and up before the browser's mousedown moves focus, so the focus arrived after the press was over and counted as keyboard focus.

## What Changes

- **A tooltip opens on focus only when a key moved it.** The page remembers its last input, a key press or a press of a finger, mouse or pen. Focus after a press opens no tooltip, however late it arrives; that covers the tap's own focus and the focus a closing sheet gives back to its button.
- **On a touch-first device only a hardware key counts.** Enter on the on-screen keyboard does not turn the next focus into keyboard focus; Tab, Escape, a chord, or a key outside a text field does (the rule of `touch-keyboard-hints`).
- **Nothing changes with a mouse or a keyboard.** Hover opens the tooltip after 400 ms, Tab opens it at once, a click still closes it.
- **Names do not depend on the tooltip.** An icon button keeps its `aria-label`; the tooltip is only its description while open.

Out of scope: the tooltips in the interface tour's 360 px screenshots (the tour drives the app with keys, so they are keyboard focus and stay), showing a control's name on a long press, and any change to which controls have a tooltip.

Advances the ROADMAP item "Shells that feel native".

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: the "Tooltip primitive" requirement says which focus opens it.

## Impact

- `web/src/lib/focusSource.ts` (new, about 30 lines), `web/src/ui/Tooltip.tsx`, `web/src/ui/tooltip.test.tsx`.
- No data, op, route, setting or string changes. No dependency.
- No screenshot changes expected: the UI baselines show controls unfocused or reach them with keys.
