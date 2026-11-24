## 1. Refuse the date

- [x] 1.1 `exceptionOn` in `web/src/lib/recurring.ts`; `dueUndoable` and `doOnUndoable` refuse a series' date that has a record, with the record's state as the reason, and write nothing. Verify: `npx vitest run src/lib/seriesExceptions.test.ts` ("moving a series onto one of its records": the repair reproduces #1971, the refusal writes no op, a free date still moves).
- [x] 1.2 `setDueWithUndo` and `doOnWithUndo` show the reason as the action toast, never "Date changed". Verify: `npx vitest run src/app/undo.test.tsx`.
- [x] 1.3 The several-task date actions drop such series and count them ("n not moved"); `dueUndoable` moves start and deadline with the due. Verify: `npx vitest run src/lib/seriesExceptions.test.ts` (day drop, drop on Today, bulk Due; the free date's start).
- [x] 1.4 The four messages in every catalogue; changelog fragment. Verify: `make i18n-check`, `npm test` and `npm run build` in web/.

## 2. Check

- [x] 2.1 `openspec validate --all --strict` passes.
