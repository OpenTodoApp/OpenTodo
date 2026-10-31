# Proposal

## Why

"All occurrences" in the occurrence panel (`series-exceptions`, `series-split`) edits the series from its current occurrence on: past occurrences are kept as they were, and so are the earlier pieces of a series that was changed from a date on. That is right for a new time or a new rule, but not for a typo or a better name: renaming "Spansh class" leaves every completed session, and the series before last month's split, with the old title in the history, the habit grid and search. The owner decided (2026-10-31) that All occurrences offers a choice between **Only future ones**, today's behaviour, and **Also past ones**, which also changes the earlier pieces and the past occurrence records. This answers the open question of `series-split`'s design.

## What Changes

- **A second, small choice under All occurrences.** When the panel shows a series on All occurrences and there is a past to affect (an earlier piece of its lineage, or a done or skipped occurrence record), a second control appears: Only future ones (selected) · Also past ones. Without a past, nothing new appears.
- **Also past ones.** An edit made with it chosen writes, in the same batch as the series' own change and with one Undo:
  - to done and skipped records of the series and to every record of its earlier pieces: the new title, notes, labels, project and priority, where the record still holds the value of its series (an occurrence changed on its own keeps its value); never their completion, their skip or their date;
  - to the earlier pieces: the same fields, a new time on their own dates, and a new rule within each piece's own range, so no past record's date is rewritten;
  - to the earlier pieces' open records: the values an All-occurrences edit already carries to open records.
- **Only future ones** is unchanged: the series and its open records, as today.

## Out of scope

- Later pieces: All occurrences on an earlier piece never changes the pieces that continue it (they start where someone deliberately changed the series). The panel links to them.
- A choice for a record's date or completion: past dates and completions are never rewritten.
- The REST API and CLI: `PATCH /api/v1/tasks/{id}` on a series writes the series row only and never carried values to records (the carry is the app's, `series-exceptions` D6), so there is no All-occurrences API path to give the choice; a script edits a record by its id. Nothing changes there.
- MCP write tools.

This follows the roadmap's 0.19 "Series and time" (`series-exceptions`, `series-split`). Nothing is **BREAKING**: no new field, no migration, no environment variable.

## Capabilities

### New Capabilities
None.

### Modified Capabilities
- `recurring-tasks`: All occurrences may also apply to past occurrence records and earlier pieces (Also past ones); series edits are otherwise unchanged.

## Impact

- **Web:** `web/src/lib/seriesPast.ts` (`hasPast`, `planPast`), `web/src/lib/seriesPastActions.ts` (the undoable batch), `web/src/lib/ops.ts` (an edit of a series chosen for Also past ones goes there: a few lines), `web/src/app/NotesEditor.tsx` (notes saved under Also past ones), `web/src/app/task-detail/OccurrenceScope.tsx` (the second control, lazy), six catalogues.
- **Server:** none. The planning is the app's, like the carry it extends; `web/src/lib/series.fixture.json` gains client-only cases.
- **E2EE:** the device writes the records' content fields as it writes the series', encrypted per row.
- **Docs:** `docs/recurrence.md`, `docs/repeating-on-the-calendar.md`.
- **Size:** no dependency; the new code is in the lazy scope control and planning chunks, the first load grows by about 0.2 KB gzipped (727.8 of 728 KB), for the routing in `ops.ts`.
