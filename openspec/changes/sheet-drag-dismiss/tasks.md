# Tasks

## 1. The shared drag

- [x] 1.1 Add `web/src/ui/overlay/sheetDrag.ts`: `useSheetDrag(sheet, onClose, enabled)` with the start rule (grip always; body only at the top, not in a field or on `data-drag-id`), the 8 px direction lock, the 80 px and flick thresholds, the spring back with the emphasis tokens, and no movement under reduced or no motion. Verify: `npx vitest run src/ui/overlay/sheetDrag.test.tsx` in `web/`.
- [x] 1.2 `Popover.tsx`: use the hook for the sheet presentation, mark the top row as the grip, delete `dragToClose`; a drag close plays the sheet exit on a copy. Verify: the existing test "a drag down on its top row closes it, a short one does not" still passes unchanged, and "follows the finger, and from its list too".
- [x] 1.3 `Dialog.tsx`: the hook for `placement="bottom"` and for `placement="sheet"` below 640 px, enabled by `dismissable`; the handle and the grip only then. Verify: tests "has a handle, follows a drag on its header and closes", "ignores the drag when it ignores a tap outside, and shows no handle", "is not dragged when it is full screen".
- [x] 1.4 `exit.ts`: the exit copy drops the root's offset and the card keeps its own, so a dragged dialog sheet leaves from where it was released. Verify: test "leaves from where the finger left it"; `npx vitest run src/ui/overlay/overlayMotion.test.tsx`.

## 2. Tests

- [x] 2.1 Interaction tests with synthetic touch events (happy-dom, `waitFor`, no fixed wait): past the threshold closes, a short drag springs back, a flick closes, a scrolled body and a field keep their gesture, a kept-open sheet returns, reduced motion and no motion. Verify: `npx vitest run src/ui/overlay` (all pass).
- [x] 2.2 Type check and lint. Verify: `npx tsc --noEmit` and `npx eslint src/ui/overlay` in `web/`.
- [x] 2.3 The whole web suite and the build. Verify: `npm test` and `npm run build` in `web/`; `node scripts/bundle-budget.mjs` reports the first load inside the budget (measured: entry chunk 145.8 KB gzip of 146, entry and static imports 703.8 KB of 704). `npm test` passed but for three tests outside the overlay module that timed out on a loaded machine and pass when run alone.

## 3. In a browser

- [x] 3.1 Headless Chromium as a phone (360 × 740, touch), against the built server and this branch's web app: drag the start guide (a dialog sheet) and the add menu (a popover sheet) by the handle, from the body, short, long and as a flick, with and without reduced motion. Verify: the sheet's offset follows the finger, a short drag returns to 0, a long drag and a flick close, the exit copy starts at the released offset, the history marker is gone and focus is on the trigger.
- [ ] 3.2 On a real Android phone and an iPhone: drag the bulk actions, the add menu and the notifications away; scroll a long notifications list down and back up without the sheet moving; drag with the keyboard open in the start guide; Back after a drag close navigates.

## 4. Docs and release

- [x] 4.1 `docs/interface-guide.md` (Sheets), `docs/install-phone.md` (one sentence), the Overlay story's description. Verify: `make docs` then `make docs-check`.
- [x] 4.2 Changelog fragment `changelog.d/Changed/sheet-drag-dismiss.md`. Verify: `node --test scripts/repo-checks.test.mjs`.
- [x] 4.3 `npx @fission-ai/openspec@1.13.2 validate sheet-drag-dismiss --strict`.
- [ ] 4.4 Re-baseline the UI screenshots that gain the handle: the start guide and the routine condition editor at phone width, and the Overlay stories "Sheet" and "Bottom" at 375 px (the owner's branch of baselines).
