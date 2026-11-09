# Tasks

## 1. The stage

- [ ] 1.1 Restructure `FocusView`/`FocusParts` into the stage (D1): project, title, next subtask, timer, state line, controls; remove the timer card, the header's secondary text and visible actions, and the printed hint line. Verify by updating `focusView.test.tsx` (happy-dom, `waitFor`) for "Open from a task", "One title" and "Tick the next subtask"; run `npm test` in web/.
- [ ] 1.2 Break as a state of the same stage (dimmed title, sunken surface, "End the break" primary), within the motion tokens and reduced motion. Verify with the "A break is the same stage" interaction test and the story baselines in light, dark, 375 and 1280 px (`make ui-check`).
- [ ] 1.3 The done state on the stage with one primary next step and Extend among the quiet buttons; the tone, Long and vibration paths unchanged. Verify that the existing Done state and Extend tests pass, with the "Done state content" scenario updated.
- [ ] 1.4 "Notes and subtasks" disclosure, remembered per device. Verify with an interaction test for "Disclosure remembered" and "Notes edited elsewhere".

## 2. The menu

- [ ] 2.1 Overflow menu order per "Focus screen layout", with "Today's sessions" added. Verify with the "Menu" scenario test.
- [ ] 2.2 `FocusSessions.tsx`, a lazy sheet or popover over today's time entries with `focus_mode`. Verify with unit tests for the three Today's sessions scenarios (including the Time tab entry left out), and confirm with `npm run build` that it is its own chunk.

## 3. Docs and checks

- [ ] 3.1 Update `docs/focus.md`; add `changelog.d/Changed/focus-redesign.md`. Verify with `make docs` and `make docs-check`.
- [ ] 3.2 `make bundle-budget`, `make openspec-validate` and `make check` pass.
