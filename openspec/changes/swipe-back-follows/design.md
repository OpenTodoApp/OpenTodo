 # Design: swipe-back-follows

 ## D1. Depends on page-transitions

 The swipe drives the same `back` animation as `page-transitions`, scrubbed: during the drag the current page gets `transform: translateX(dx)`; on commit the route changes inside `startViewTransition` with the animation starting at the current offset (a CSS variable read by the keyframes), so the hand-off has no jump.

 ## D2. Under the page

 The previous page is not mounted. Under the moving page sits the surface colour with the page shadow; the previous page's header title fades in. A snapshot of the previous page is out of scope.

 ## D3. Thresholds

 Commit at 33% of the viewport width or a flick, replacing the fixed 96 px (which is 25% at 390 px but 9% on a tablet). Lock rules from `rowSwipe.ts` stay.

 ## D4. Tests

 vitest for the commit rule over widths; a Playwright touch drag in the layout check at 390 and 768 px reads the page transform mid-drag and the route after release.

## Data model, size and budget

- Data model: none. No op field, no synced preference, no route.
- Container image and server memory: unchanged (web and shell only).
- First load: about 0.5 KB gzip in the lazily loaded edge-swipe chunk; the entry chunk is unchanged. The entry chunk is at 147.4 of 148 KB (web/bundle-budget.json), so anything that would land in it is loaded lazily or paid for by a cut in the same change; `make bundle-budget` decides.
- Interface budget (docs/interface-guide.md): no new chrome.
