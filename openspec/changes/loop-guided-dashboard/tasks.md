# Tasks

## 1. Next step and stepper

- [ ] 1.1 `nextMove` in `web/src/lib/method/pulse.ts` returns the move and the facts for its sentence, with its order unchanged. Verify with unit tests for each of the five cases. Run `npm test` in web/.
- [ ] 1.2 The Next step card and the stepper (method order, counts or done marks, the accent on the next move only, ← → and Enter), replacing the rail, the top capture field and the closed-loop line. Verify by updating `loopHome.test.tsx` (happy-dom, `waitFor`) for "Morning on the Loop home", "Next move moves on", "Loop closed" and "A capture from another device".
- [ ] 1.3 `/loop/<move>` in the router: opening and closing in place, Back, and a deep link. Verify with the "Keyboard path" and "Deep link" interaction tests.

## 2. The moves in place

- [ ] 2.1 Catch: the labelled capture field, the latest captures and the Inbox link. Verify with "Capture from the Loop home".
- [ ] 2.2 Clarify: `TriageView`'s card made embeddable, its key scope active only while open. Verify that the existing triage tests still pass, plus an embedded-card test for decisions and "n left".
- [ ] 2.3 Place: projects without a next action, each with an inline add field. Verify with "Add a next action in place".
- [ ] 2.4 Do: Today's focus moved here, plus next actions by context. Verify with a test that the focus indicator and the Daily check offer are unchanged.
- [ ] 2.5 Review: the rhythms and Close the day. Verify with "Close the day from the Review move" and "Day closed on another device".
- [ ] 2.6 Each part is a lazy chunk. Verify with `npm run build` and `make bundle-budget`.

## 3. Pulse and phone

- [ ] 3.1 The pulse line and its popover or sheet with the existing figures and strip. Verify that `loopPulse.test.tsx` passes, updated for "Details on demand".
- [ ] 3.2 The phone layout: the one-row stepper and the open move as a page. Verify with "Phone width" and story baselines at 360 and 1280 px in light and dark (`make ui-check`).

## 4. Docs and checks

- [ ] 4.1 Update `docs/method/overview.md` and `docs/method/set-up.md` and add `changelog.d/Changed/loop-guided-dashboard.md`. Verify with `make docs` and `make docs-check`.
- [ ] 4.2 `make i18n-check`, `make openspec-validate` and `make check` pass.
