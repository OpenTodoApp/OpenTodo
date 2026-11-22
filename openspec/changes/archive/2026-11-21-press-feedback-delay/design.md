 # Design: press-feedback-delay

 ## D1. A delay in CSS, not a timer in JS

 The fallback dim becomes `animation: press-dim 0s 60ms forwards` on `:active`, and the `press-*` backgrounds and the row's tint get `transition: background-color 0s 60ms`, so the browser shows them only when the press lasts 60 ms. The dim is an animation, not a transition, because the fallback has zero specificity: a control's own `transition-*` utility would replace its transition and cut the wait. An animation also beats a plain `opacity`, so the rules that turned the dim off with `opacity: 1` (`press-*`, the row's body, the fold arrow's `active:opacity-100`) say `animation: none` instead. A scroll cancels `:active`, so a scroll inside 60 ms never shows it. Reduced motion shortens animations and keeps their delay, so it is the same there.

 iOS WebKit matches `:active` on a touch only with a touch listener on the document. `edgeWatch` listens to pointer events, not touches, so `lib/touchActive` installs a passive no-op `touchstart` listener on `document` at start, on every page, whether edge swipes are on or not.

 ## D2. Innermost only

 `:active` matches every ancestor. The fallback selector and the row's tint gain `:not(:has(:is(button, [role=button], a[href]):active))`, so a row or a control whose inner button is pressed stays as it is. `:has()` is supported by every engine the app targets (Safari 15.4+, Chromium 105+).

 ## D3. Tests

 The layout check rests the pointer on the first row's completion circle, presses, and after 100 ms reads that the circle shows its pressed colour, that the engine holds that colour back 60 ms (the pressed circle's computed transition delay for its background), and that the row's body is not pressed with it. The wait is read from the engine, because on a busy machine the round trip to the browser takes longer than the wait itself, and a selected row has the same colour as the row's press tint. A press the emulation never reports as `:active` is retried on the next row and otherwise logged, not failed. It releases off the circle, so nothing is completed. A vitest test pins the CSS rule text so the delay is not lost.

## Data model, size and budget

- Data model: none. No op field, no synced preference, no route.
- Container image and server memory: unchanged (web and shell only).
- First load: none measurable (a few CSS declarations). The entry chunk is at 147.4 of 148 KB (web/bundle-budget.json), so anything that would land in it is loaded lazily or paid for by a cut in the same change; `make bundle-budget` decides.
- Interface budget (docs/interface-guide.md): no visible chrome changes; presses only.
