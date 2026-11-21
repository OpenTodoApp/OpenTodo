 # Design: press-feedback-delay

 ## D1. A delay in CSS, not a timer in JS

 The dim moves to `:active` with `transition: opacity 0s 60ms` (and the same delay on the `press-*` backgrounds), so the browser shows it only when the press lasts 60 ms. iOS WebKit fires `:active` on touch only with a touch listener on the document, which `edgeWatch` already installs; a `touchstart` passive no-op listener on `document` keeps that true when edge swipes are off. A scroll cancels `:active`, so a scroll inside 60 ms never shows it.

 ## D2. Innermost only

 `:active` matches every ancestor. The fallback selector gains `:not(:has(:is(button, [role=button], a[href]):active))`, so a row whose inner button is pressed stays as it is. `:has()` is supported by every engine the app targets (Safari 15.4+, Chromium 105+).

 ## D3. Tests

 A Playwright test in the layout check presses a row button with `hasTouch` and reads the computed opacity of the row and of the button at 0 ms and at 100 ms; a vitest test pins the CSS rule text so the delay is not lost.

## Data model, size and budget

- Data model: none. No op field, no synced preference, no route.
- Container image and server memory: unchanged (web and shell only).
- First load: none measurable (a few CSS declarations). The entry chunk is at 147.4 of 148 KB (web/bundle-budget.json), so anything that would land in it is loaded lazily or paid for by a cut in the same change; `make bundle-budget` decides.
- Interface budget (docs/interface-guide.md): no visible chrome changes; presses only.
