## Why

"take the bins out today and repeat every other Saturday" made a task due today with the rule `every 2 weeks`, anchored on today (a Wednesday), and kept "and repeat" in the title; "every other saturday starting today" kept "starting" (#1016). The rule grammar could not say "every 2 weeks on Saturday", so the weekday lived only in the due date and was lost as soon as the line had its own date.

## What Changes

- The recurrence grammar gains `every N weeks on <weekdays>` (`every 2 weeks on saturday`, `every 3 weeks on mon, thu`). The next occurrence is the first of those weekdays after the due date in a week that is a multiple of N weeks from the due date's Monday-to-Sunday week, the same as an iCalendar `FREQ=WEEKLY;INTERVAL=N;BYDAY=…` with the due date as DTSTART. A due date on another weekday is an occurrence of its own; the next ones follow the rule. `every week on tuesday` is stored as `every tuesday`.
- Quick add reads `every other <weekday>` and `every N weeks on <weekday>` (`alle 2 Wochen am Samstag`, `toutes les 2 semaines le samedi`, `cada 2 semanas los sábados`) as that rule. Without a date phrase the task is due on the next such weekday, as before; with one ("today") it is due on that date and moves to the weekday when completed.
- A connector directly before a recurrence phrase leaves the title with it: `and repeat`, `repeat`, `repeating`, `and then`, `and` and their equivalents in every bundled language. Without a rule after them they stay ("Repeat the test").
- A start phrase next to a recurrence phrase (`starting today`, `starting tomorrow`, `starting <date>`, `from <date>`, `ab`, `à partir de`, `a partir de`, `a partire da`, `desde`…) leaves the title and starts the series: the task is due on the rule's first date on or after it.
- The importer reads `every other <weekday>` as `every 2 weeks on <weekday>`; CalDAV serves the rule as `FREQ=WEEKLY;INTERVAL=N;BYDAY=…` and reads that RRULE back as the rule.

Out of scope: a count before a weekday (`every 2 Mondays`) keeps its literal reading; month and year intervals on a weekday; the user's week-start preference for the week phase (it is always Monday to Sunday, like RRULE's default). Not **BREAKING**: no op, field or environment variable changes; a device on an older version reads the new rule as one it does not know, like any rule it cannot parse. Advances ROADMAP.md row 15 (`quick-add-recurrence`), a fix for #1016.

## Capabilities

### New Capabilities

### Modified Capabilities
- `recurring-tasks`: the week interval on weekdays in the grammar and in the next-occurrence rule.
- `natural-language-capture`: every other weekday keeps the weekday, connectors and start phrases around a recurrence phrase.

## Impact

`internal/recurrence` (`Parse`, `Canonical`, `inPhaseAfter`, `Next`, `First`, RRULE in and out) and `web/src/lib/recurrence.ts`, pinned by `web/src/lib/recurrence.vectors.json`; `web/src/lib/habits.ts` (`scheduled`); `web/src/lib/nlp` (`recurrence.ts`, `parse.ts`, three vocabulary fields in each language) and `internal/quickadd`, pinned by `quickadd.vectors.json` and `internal/quickadd/vocab.json`; `internal/importer/schedule.go`. Docs: `docs/recurrence.md`, `docs/quick-add.md`.
