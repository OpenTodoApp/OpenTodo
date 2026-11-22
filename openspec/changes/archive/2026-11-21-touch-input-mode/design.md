 # Design: touch-input-mode

 ## D1. Guard, then check

 The eight rules move inside `@media (hover: hover)`; a rule that also listed `:focus-visible` or `:focus-within` is split, so the focus half stays unguarded. A repo check (`scripts/css-hover.mjs`, run by `scripts/repo-checks.test.mjs`) parses `web/src/**/*.css` and fails on a `:hover` selector outside a `(hover: hover)` or `(pointer: fine)` media query, so new ones are guarded too. Tailwind's `hover:` variant is guarded already.

 ## D2. The last input on `<html>`

 `lib/inputMode.ts` listens (passive, capture) to `pointerdown` (`touch` is touch; mouse, trackpad and pen are `pointer`) and to `keydown` for the presses `keyboardSeen.fromHardwareKeyboard` counts (Tab, Escape, chords, and keys outside a text field), and writes `data-input`. It is loaded after first paint, like `keyboardSeen`, so it costs the entry chunk nothing; until it runs, rings draw as before. Tailwind's `focus-visible` variant is redefined as `&:where(:root:not([data-input="touch"]) *):focus-visible`, so every `focus-visible:` utility (the buttons' and controls' rings) skips the ring after a tap, and `.ui-input` draws its `:focus` ring through a `focus-ring:` variant of the same shape. A text field still shows its caret and its border colour on focus; only the ring goes. Assistive technology focus (VoiceOver, TalkBack) moves without `pointerdown`, so it keeps the ring. The high-contrast outline (`:focus-visible` in `data-contrast="high"`) is not a utility and stays.

 ## D3. Tests

 vitest for `inputMode.ts` (touch, pen, mouse and keyboard events to their values; touch-keyboard typing and untrusted events ignored). The layout check rests a pointer on a task row and reads that its background does not change, then on the focus timer's settings taps a number field and a switch, reads that no outline or ring is drawn, presses Tab and reads that one is. Against the code before this change it reports the row's hover and the field's ring.

## Data model, size and budget

- Data model: none. No op field, no synced preference, no route.
- Container image and server memory: unchanged (web and shell only).
- First load: about 0.3 KB gzip (the input listener, in the entry chunk; it replaces nothing, so it needs a 0.3 KB cut or a lazy start after first paint). The entry chunk is at 147.4 of 148 KB (web/bundle-budget.json), so anything that would land in it is loaded lazily or paid for by a cut in the same change; `make bundle-budget` decides.
- Interface budget (docs/interface-guide.md): removes stray rings and hover looks; nothing added.
