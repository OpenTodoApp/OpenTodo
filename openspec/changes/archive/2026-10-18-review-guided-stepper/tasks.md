## 1. Stepper

- [x] 1.1 `ReviewProgress`: three phase groups with one segment per step (done, current, open with the count left), "Step n of 7 · phase", every segment a button that opens its step with `aria-current="step"` on the current one; verified by `review.test.tsx`
- [x] 1.2 `ReviewView`: the step card (title as focus target, left/Done badge, explanation, content, the step's action) and the Back / Next: <step> / Finish review bar; the tabs removed; verified by `review.test.tsx`
- [x] 1.3 `review.prev-step` / `review.next-step` (`[` / `]`, view `review`, overriding `global.sidebar`) in `web/src/lib/shortcuts.ts`, paused while a dialog is open; verified by the shortcut registry test and `review.test.tsx`

## 2. Tests and stories

- [x] 2.1 `review.test.tsx`: opens on the first unfinished step; `]` and `[` move with focus on the title; a progress segment jumps to its step; the last step's Next finishes the review; existing list, walk and sweep cases still pass (`npx vitest run src/app/review`)
- [x] 2.2 Workbench stories for the review at 375 px and 1280 px, light and dark; baselines regenerated in the pinned Playwright image (`make ui-baselines`), `make ui-check` passes

## 3. Docs and checks

- [x] 3.1 `docs/review-and-statistics.md` describes the stepper and `[` / `]`; the review screenshots wait for the step card (`scripts/docs-screenshots.mjs`) and are regenerated; strings in de, es, fr, it, pt; CHANGELOG under Unreleased
- [x] 3.2 `npx tsc -b`, `npm run lint`, `npx vitest run`, `make ui-lint`, `make i18n-check`, `make docs-check`, `make openspec-validate`, `make check`
