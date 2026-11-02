# Tasks

## 1. Audit

- [x] 1.1 Screenshot every overlay of the routine editor and the Routines page at 1280 × 800 and 390 × 844 before the change (Add step at the end, in a Repeat and below a card, the trigger word, the step menu, Delete step, Find tasks' condition, the When card's condition, a new routine, the row menu and Delete routine, starters). Verify: the screenshots exist and list each surface with its kind.

## 2. Editor

- [x] 2.1 `AddStepPanel` in `web/src/app/routines/AddStep.tsx`: the catalogue inline with the shared Combobox field and list, search by `searchKinds`, suggestions and groups as headings, unavailable search matches dimmed with their hint and link. Verify with `noModals.test.tsx` and `routines.test.tsx` ("Suggestions after lines", "Search for an unavailable step") in `npm test`.
- [x] 2.2 The catalogue opens at its place (end of a list, inside a block, below a card), toggles with its button (`aria-expanded`, `aria-controls`), inserts there and focuses the new card; Escape returns focus to the opener. Verify with `noModals.test.tsx` (no dialog role opens) and `usecases.test.tsx`.
- [x] 2.3 Trigger word: the kinds in `ChoicePopover` at the word's start edge; `TriggerDetails` inside the When card for a kind with members; the When card's condition through `Inspector`. Verify with `noModals.test.tsx` and the layout check overlay `routine-trigger-list` (list under the word, at its start edge, inside the content column).
- [x] 2.4 Delete step removes at once with Undo in the toast and focus on a neighbour. Verify with `noModals.test.tsx`.
- [x] 2.5 Test with AI asks in the Test panel. Verify with `routinesAI.test.tsx` ("Estimate first", no dialog).
- [x] 2.6 Describe it expands on the Routines page. Verify with `describe.test.tsx`.

## 3. Checks and docs

- [x] 3.1 Strings in the six languages. Verify with `make i18n-check`.
- [x] 3.2 Stories: "Add step, in place" in `routines.stories.tsx`. Verify with `npm run build-storybook` and the visual baseline.
- [x] 3.3 Layout check overlays `routine-trigger-list` and `routine-add-step` on the routine page (inventory in `scripts/ux-audit/screens.json`). Verify with `ONLY=routine-page,routine-new,routines node scripts/e2e-layout.mjs` and `node --test scripts/ux-audit/ux-audit.test.mjs`.
- [x] 3.4 `docs/routines.md` (Add step in place, trigger and condition in the When card, Delete with Undo, the AI test question, Describe it), `make docs`, CHANGELOG. Verify with `make docs-check`.
- [x] 3.5 `npm test`, `npm run build`, `make openspec-validate`, `make ui-lint`.
