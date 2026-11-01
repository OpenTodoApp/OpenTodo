## Why

On an iPhone the installed app zoomed in whenever a text field got focus and stayed zoomed after the keyboard closed, so parts of the screen hung off the edge (#724). Safari on iOS zooms on focus when a field's text is under 16 px, and OpenTodo's fields use the 12.5 to 15 px type steps.

## What Changes

- On touch screens (`pointer: coarse`) every text field, select and editable area, and the text inside an editable area, is at least 16 px. The desktop design is unchanged.
- Zoom is never turned off (no `maximum-scale` or `user-scalable=no` in the viewport tag): pinch zoom stays available (WCAG 1.4.4).
- When the on-screen keyboard closes and Safari left the document scrolled, the document goes back to the top (the app scrolls inside its own regions).
- The layout check fails on any field under 16 px in its touch emulation, in WebKit and Chromium.

Out of scope: the native shells (`mobile/`), a larger list text on phones, and `interactive-widget` in the viewport tag (Chrome on Android only; sheets already follow the keyboard through `--vv-bottom`). Advances no ROADMAP.md item; a bug fix for #724.

## Capabilities

### New Capabilities

### Modified Capabilities
- `design-system`: form controls on touch screens are at least 16 px and never trigger a zoom on focus.

## Impact

`web/src/index.css` (type tokens read `--ot-text-*` variables; a base-layer rule for fields on touch screens), `web/src/ui/overlay/stack.ts` (keyboard close), `scripts/ux-audit/measure.mjs` and `scripts/e2e-layout.mjs` (the check). No data, API, dependency or size impact.
