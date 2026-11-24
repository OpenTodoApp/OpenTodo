## 1. Gesture

- [x] 1.1 `edgeSwipe.ts` moves the page during the drag; commit at 33% or a flick; vitest over 360, 768 and 1024 px
- [x] 1.2 Hand-off to the back transition from the current offset (needs `page-transitions`)
- [x] 1.3 Menu follows the finger on top-level pages

## 2. Check

- [x] 2.1 Layout check touch drag at 390 and 768 px
- [x] 2.2 `npm test`, `npm run build`, `make bundle-budget` in web/ (edgeWatch is already lazy)
- [ ] 2.3 Device check rows on an iPhone and an Android phone (with Android's own back gesture on)

---

The device check (2.3) moved to the owner's list (the board task "Owner: device checks from shipped changes"). 2.1 is `swipeBack` in scripts/e2e-layout.mjs (Chromium, 390 and 768 px). From 768 px the back swipe now works on a page with Back too (the scenario "A flick on a tablet"): there the phone bar is gone, so it follows the page header's Back, or a task page's Close; the menu stays a phone's.
