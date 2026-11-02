## Context

Tailwind maps the type steps with `@theme inline`, so `text-meta` compiles to a literal size and cannot be raised per element through `--text-meta`.

## Decisions

### D1. The small steps read `--ot-text-*` variables
`--text-hint`, `--text-meta`, `--text-prose` and `--text-h3` read `--ot-text-hint`, `--ot-text-meta`, `--ot-text-prose` and `--ot-text-h3` (declared on `:root` with the old values), like `--text-body` already reads `--ot-text-list`. A base-layer rule under `@media (pointer: coarse)` sets them to 16 px on text inputs, text areas, selects and editable areas, and gives those elements `font-size: max(16px, 1em)` for a field that only inherits its size. Utilities still win over the base layer, but the ones under 16 px now resolve to 16 px on those elements; larger steps are untouched. The list step's choices stop at 15 px, so 16 px is never a reduction. Rejected: an unlayered `font-size: 16px` (would shrink title fields set in larger steps) and disabling zoom in the viewport tag (accessibility).

### D2. Keyboard close
`watchVisualViewport` remembers whether the keyboard was open (the visual viewport more than 80 px shorter than the window). When it closes, the document is no taller than the window, the scale is 1 and the window is scrolled, it scrolls back to 0, 0. A pinch zoom is left alone.

### D3. The check
`smallFields` measures computed font sizes in the page, reported like a touch target, on every screen and overlay of the layout check (`isMobile`, `hasTouch`).

## Interface budget

No chrome, property, destination, scroller or shortcut changes. Text in fields on phones grows by 1 to 3.5 px; the 44 px touch heights already leave room.

## Risks

Real iOS behaviour is confirmed on a device (manual check); the emulation checks the computed sizes that Safari's rule reads.
