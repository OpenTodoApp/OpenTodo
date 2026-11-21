 # Design: touch-input-mode

 ## D1. Guard, then check

 The eight rules move inside `@media (hover: hover)`. A repo check (`scripts/repo-checks.test.mjs`) parses `web/src/**/*.css` and fails on a `:hover` selector outside a hover media query, so new ones are guarded too.

 ## D2. The last input on `<html>`

 `lib/inputMode.ts` listens (passive, capture) to `pointerdown` (`pointerType` touch, pen or mouse) and to `keydown` for keys a touch keyboard cannot send (Tab, arrows, Escape with no text field focused), and writes `data-input`. Focus rings become `:root:not([data-input="touch"]) :focus-visible` in the shared focus utility and `.ui-input`. A text field still shows its caret and its border colour on focus; only the ring goes. Assistive technology focus (VoiceOver, TalkBack) moves without `pointerdown`, so it keeps the ring.

 ## D3. Tests

 vitest for `inputMode.ts` (each event to its value); the layout check taps a switch and reads that no outline is drawn, then presses Tab and reads that one is.

## Data model, size and budget

- Data model: none. No op field, no synced preference, no route.
- Container image and server memory: unchanged (web and shell only).
- First load: about 0.3 KB gzip (the input listener, in the entry chunk; it replaces nothing, so it needs a 0.3 KB cut or a lazy start after first paint). The entry chunk is at 147.4 of 148 KB (web/bundle-budget.json), so anything that would land in it is loaded lazily or paid for by a cut in the same change; `make bundle-budget` decides.
- Interface budget (docs/interface-guide.md): removes stray rings and hover looks; nothing added.
