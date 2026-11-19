# Tasks

## 1. Reading

- [x] 1.1 `ruleFromText` in `web/src/lib/nlp/repeatPhrase.ts`: the stored grammar first, then quick add's phrase at the first token in the active vocabularies; only a match that covers the whole text, is not a literal and has no start date; the canonical rule or null. Verify: `web/src/lib/nlp/repeatPhrase.test.ts` (the stored grammar in every language; phrases in nl, de, fr, it, es, pt, pl, tr and en; an end date and a count; words around, a start date, an inactive language and a literal refused); `npm test -- repeatPhrase` in web/.

## 2. The field

- [x] 2.1 `RecurrenceField` reads the text with `ruleFromText` in the languages quick add reads (`resolveLanguages`, the date order and week start of the user's format), shows the preview for it and writes its rule through `setRecurrence`; a text that is no rule is refused as before; the placeholder's example is in the user's language when it reads back. Verify: the Dutch case in `web/src/app/task-detail/whenControl.test.tsx` (placeholder, preview, `every friday` stored and shown, the Dutch sentence above, `after completion`, a refusal that keeps the rule); `npm test`, `npm run typecheck` and `npm run build` in web/.

## 3. Docs and checks

- [x] 3.1 `docs/recurrence.md`, `changelog.d/Changed/repeat-field-language.md`, the 0.20 row in `ROADMAP.md`. Verify: `make docs`, `make docs-check`, `make repo-check`, `make openspec-validate`, `make i18n-check`, `make bundle-budget`.
