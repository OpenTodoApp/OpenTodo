# Implementation notes

## Smoke test (task 9.1), 2026-10-15

Built binary on port 18080 with a throwaway data directory, driven by Playwright:

- Quick add `Learn to sail someday` showed a Someday chip and put the task in the Inbox's **Later** group with the Someday chip; `Call Ana tonight at 8pm` showed an evening chip and was due today 20:00.
- `n` on *Buy milk* moved it to Later as parked; the sidebar Inbox count dropped to 2 (parked tasks not counted).
- Today listed *Water plants* under **Today** and *Call Ana* under **This Evening**.
- Someday listed both parked tasks by project; Anytime was empty (every remaining task had a date).
- No console or page errors.

Crossing a start day, CalDAV and CSV import are covered by automated tests: the predicates are pure functions of `todayISO()` (`someday.test.ts`), `TestCaldavStartEvening` exercises PUT and GET, and `TestStartEveningImportAndOwnRoundTrip` imports a CSV.

## Decisions taken while implementing

- `tonight` stays in each language's `dayWords` (the Go importer reads that vocabulary through `nlpvocab.json`); a new evening-phrase match runs first and sets the evening flag plus today's date, so behaviour matches design D6 without changing the shared vocabulary.
- The board view of a project keeps every card in its column; only the list view shows the Later group.
- A parked row with a due date is normalised for every import profile in `parseOne` (keeps the date, warns), not only for CSV.
- The new list keys and `d` are refused for viewers in the main list like the other edits.
