# Implementation notes

## Status (2026-10-15)

Done on `feat/quick-add-recurrence`: groups 1–4 except the screen work: vocabularies, `nlp/recurrence.ts`, `nlp/reminders.ts`, the parse integration, `createTask` writing reminders in the task's batch, the shared vectors (37 cases, every spec scenario) run by `vectors.test.ts` and `internal/quickadd/vectors_test.go`, `internal/quickadd/vocab.json` with `npm run nlp:vocab` and a staleness test, the Go port `internal/quickadd`, `ot add --repeat/--remind/--natural/--lang` and `ot edit --repeat`, the schema golden file, `SKILL.md`, and the docs (`quick-add.md`, `recurring-and-reminders.md`, `reminders.md`, `cli.md`, `keyboard.md`).

`QuickAdd.tsx` had to learn the two new chip kinds for the web build to type-check (the chip colours, names and texts of 2.5). The rest of the screen work is held until the ux-overhaul group 1 and 2 PRs merge: the component tests of 2.5, the share-capture test of 2.6, the smoke test (5.1) and `make check` (5.2).

## Decisions taken while implementing

- A bare number after "every" is a count only when a unit follows (`every 3 days`); a day of the month needs its suffix (`every 15th`, `every 15.`), so `every 3 hours` cannot be misread as `every 3rd`.
- Portuguese ordinals leave out `segunda` and `quarta`, which are weekdays there.
- The recurrence chip shows the first occurrence with the long date form (`every monday · Mon 12 Oct`), which is what the spec's scenario reads (design D4 said compact).
- `vocab.json` is written by a vitest run (`UPDATE_QUICKADD_VOCAB=1`, wrapped as `npm run nlp:vocab`), following the existing `nlpvocab.json` precedent, instead of a separate script that would need a TypeScript loader.
- The Go port folds diacritics with a table of the Latin letters these six languages use (the standard library has no Unicode normalisation).
- A reminder the server refuses after the task was created exits 1 and names the task id in the message (also in `--json` error output).

## Screens and smoke test (2026-10-16)

- 2.5: the chip code was already written on this branch. What it lacked was its component test (`quickAddRecurrence.test.tsx`: two chips, Backspace twice keeps the reminder as text).
- 2.6: the section quick add and the plain share screen create reminders through `createTask` unchanged. The share screen's path with attached files used `planTask` and **dropped typed reminders**. `planReminders` now holds the reminder ops for both paths, and a test covers the share screen.

Smoke test (task 5.1): `./bin/opentodo` on 127.0.0.1:18080, headless Chromium with quick-add languages `en, de`.
- `Water plants every Monday remind me at 8 #home` showed the chips "every monday · Mon, Oct 19", "1 hour before" (the spec's text for a moment on a date-only due: 08:00 against 09:00) and "#Home".
- `Zahnarzt morgen um 15 Uhr erinnere mich 30 Minuten vorher` showed "Tomorrow 15:00" and "30 min before".
- Offline: `Call mum tomorrow at 18 remind me 1 hour before`, then reload, then reconnect. The server held all three tasks with their rules and three reminders, which is what a second profile pulls.
- CLI with an API token: `ot add "Take out bins" --due tomorrow --repeat "every tuesday" --remind "30 min before"` created the task with the rule and its reminder. `ot add --natural "Zahnarzt morgen um 15 Uhr erinnere mich 30 Minuten vorher" --lang de` created "Zahnarzt" due tomorrow at 15:00 with a −30 reminder.
