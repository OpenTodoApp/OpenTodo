# Tasks

Frontend tasks are verified with `npm test` and `npm run build` in `web/`.

## 1. Names are announced (UI-3)

- [x] 1.1 `ReadAs` and visually hidden text in `NeutralChip`, `ToneText` and `ListGroupHeader`; verify with `src/ui/Chips.test.tsx`.
- [x] 1.2 Replace every role-less `aria-label`/`aria-labelledby` in `web/src` (task row title warnings, sidebar badges, counts in labels, sub-projects and dashboard, feed dot, public list priority, Vim completions, read-only property chips) or give the element its role (audit table region, calendar lane group, toast region); verify with `npm run lint` and the updated chip assertions in `taskRow`, `habits`, `deadlineViews`, `dependencyViews`, `fieldsList`, `groups`, `subProjects` and `attachmentsRow` tests.
- [x] 1.3 Lint rule `a11y/no-generic-aria-label`; verify with `scripts/eslint-config.test.mjs` "refuses aria-label and aria-labelledby on a span or div without a role".

## 2. Lists (UI-4)

- [x] 2.1 Cursor moves focus to the row's open button unless focus is elsewhere; `aria-current` on the cursor row; verify with `assistiveSemantics.test.tsx` "the keyboard cursor moves focus to the row, and leaves focus alone when it is elsewhere" and `listPerformance.test.tsx` (two row renders per press).
- [x] 2.2 `aria-level`, `aria-posinset`, `aria-setsize` in the tree views; verify with `assistiveSemantics.test.tsx` "rows carry their level and their place among their siblings".
- [x] 2.3 "Complete {title}" / "Reopen {title}", never ciphertext; verify with `assistiveSemantics.test.tsx` "complete buttons name their task" and "the open button reads the title and every chip".

## 3. Page changes (UI-11)

- [x] 3.1 Tab title from the page heading, focus to the heading on navigation, skip link (`web/src/app/pageFocus.tsx`, `Shell.tsx`); verify with `pageFocus.test.tsx`.
- [x] 3.2 New strings in de, es, fr, it, pt; verify with `make i18n-check`.

## 4. Checks

- [x] 4.1 `npx tsc -b`, `npm run lint`, `npm test`, `make ui-lint`, `make i18n-check`, `npm run build`, the Chromium layout check (`ENGINES=chromium node scripts/e2e-layout.mjs`).
