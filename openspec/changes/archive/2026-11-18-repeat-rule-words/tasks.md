# Tasks

## 1. The words

- [x] 1.1 `ruleWords` in `web/src/lib/recurrenceWords.ts`: every kind of rule (interval, weekdays, every N weeks on weekdays, weekday, day of month, last day, ordinal weekday of the month, ordinal weekday, ordinal weekday of a month), then after completion, until and for N times; a rule that does not parse is returned as stored. Verify: `web/src/lib/recurrenceWords.test.ts` (English for every kind; every rule of `recurrence.vectors.json` has words without a leftover placeholder); `npm test -- recurrenceWords` in web/.
- [x] 1.2 The catalogues: 13 new messages in every language, the ordinal chosen by weekday in Italian, Portuguese, Polish and Russian; "Repeats {rule}" removed. Verify: the language cases of `recurrenceWords.test.ts` (nl, de, it, pt, pl, ru, tr, zh); `make i18n-check`.

## 2. Where a rule is shown

- [x] 2.1 The Repeat segment (`task-detail/WhenControl.tsx`), the facts line (`lib/facets.ts`), the quick-add chip (`ParseChips.tsx` `chipText`) and the assistant's change line (`lib/assistant.ts`) call `ruleWords`; the Repeat field keeps the stored rule. Verify: `task-detail/whenControl.test.tsx` (the segment reads "Every week on Thursday"), the facts and quick-add tests; `npm test`, `npm run typecheck` and `npm run build` in web/.

## 3. Docs and checks

- [x] 3.1 `docs/recurrence.md` says the rule is shown in the interface language and typed in English; `changelog.d/Changed/repeat-rule-words.md`; the 0.20 row in `ROADMAP.md`. Verify: `make docs`, `make docs-check`, `make repo-check`, `make openspec-validate`, `make bundle-budget`.
