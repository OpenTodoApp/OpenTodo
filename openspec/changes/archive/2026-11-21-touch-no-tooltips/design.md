# Design

## Context

`Tooltip` (`web/src/ui/Tooltip.tsx`) opens on `pointerenter` (not for `pointerType: 'touch'`, not on a coarse pointer) after 400 ms and on `focus` at once. Since issue 169 it kept a `pressed` flag between its own `pointerdown` and `pointerup` and ignored focus while the flag was set.

Measured in Chromium (Playwright, 360 × 740, `hasTouch`, `isMobile`, `(pointer: coarse)` true, no key pressed, `locator.tap()`), the events of one tap on a button are:

`pointerover pointerdown touchstart pointerup pointerout touchend mousedown focusin mouseup click`

Focus arrives with the compatibility `mousedown`, after `pointerup`, so the flag was already cleared. A long press (touchstart, 600 ms, touchend) gave the same order. The focused button reported `:focus-visible` false every time.

| Tapped | Tooltip at once | After 700 ms |
|---|---|---|
| Open menu, Add or fold projects, Project menu, Display options, Section menu, Add a task to Planning, More actions, Rename, a tab of the tab bar | none (the opened surface takes focus) | none |
| Ask (Today), Search and commands, Assistant, brand line (drawer) | shown | gone |
| Sync dot (drawer) | shown | still shown |
| Long press on Open menu, Project menu, More actions | none | none |
| Long press on Ask | shown on release | gone |

## Goals / Non-Goals

**Goals:** no tooltip from a tap or the focus it leaves; mouse and keyboard as before; one place.

**Non-Goals:** a name on long press; changing the tour's screenshots.

## Decisions

### D1. The page's last input decides, not the control's own events

`web/src/lib/focusSource.ts` listens on the document in the capture phase: `keydown` sets the last input to a key, `pointerdown` to a press. `focusFromKeyboard()` is true unless the last input was a press. `Tooltip` asks it in `onFocus` and drops the `pressed` flag with its `pointerup` and `pointercancel` handlers; `pointerdown` still closes an open tip.

This is what browsers do for `:focus-visible` on buttons, and it also covers focus that a closing sheet hands back to its button long after the tap.

Alternatives:
- `element.matches(':focus-visible')` in `onFocus`. Right in Chromium, but the test environment (happy-dom) does not model it, and tests dispatch focus events without moving focus. Rejected for testability.
- Hold `pressed` for a moment after `pointerup`. A timer guessing at the browser's event order. Rejected.
- Never open on focus on a coarse pointer. A tablet with a keyboard would lose the hints `touch-keyboard-hints` just gave it. Rejected.

### D2. Before any input, focus counts as keyboard focus

Focus the page sets before the first press or key opens the tip as before, so a keyboard user's first Tab is not needed to arm it and existing behaviour and tests stand. On a phone nothing with a tooltip takes focus before the first tap.

### D3. On a coarse pointer only a hardware key counts

`keyPress(e, touchFirst)` accepts every key press on a fine pointer. On a coarse one it asks `fromHardwareKeyboard` (`web/src/lib/keyboardSeen.ts`): Enter typed on the on-screen keyboard is not a reason to show a tooltip on the button that gets focus next.

### Data model, size

No data model impact: no field, op, route, setting or string. No dependency. Two document listeners; after the change the entry chunk is 145.3 KB gzip of its 146 KB budget and the entry with its static imports 704.9 KB of 706 KB.

### Interface budget

No chrome, destination, scroll region, task property or shortcut is added or removed.

## Risks / Trade-offs

- On a computer, a click followed by focus the page moves itself (no key in between) shows no tooltip on the control that receives it. That matches `:focus-visible`; before, such a control showed its tooltip.
- The last input is shared by every tooltip of the page; a test that presses and then expects a focus tooltip must press a key first, as a person would.
