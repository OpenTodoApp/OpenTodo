# Quick add: bare months and "every other"

## Why

Two quick-add phrases go wrong in ordinary text (issues #634, #635):

- A month name alone wins over the date phrase at the end of the line. `Collect the invoices from September and send them to the accountant next monday at 10am` is due 1 September next year, and "September" leaves the title. Pasted mail and chat text often names months in passing, so such a task lands ten months out without anyone noticing.
- `every other friday` is not a repeat. The line becomes a one-off task, "every other" stays in the title and the preview shows no Repeats line, although `every 2 weeks on friday` already works.

## What Changes

- A month name alone ("September") is a weak date: a later complete date phrase (a day word, a weekday, a relative period, a full or numeric date, "tonight") replaces it, and the month word stays in the title. A second month alone does not replace the first.
- A month name alone directly after `from`, `since`, `of`, `for` and their equivalents (`seit`, `von`, `vom`, `ab`, `für`; `depuis`, `de`, `du`, `des`; `da`, `dal`, `di`, `del`; `desde`, `de`, `del`; `desde`, `de`, `do`) is text, not a date.
- `every other <weekday | day | week | month | year>` is a repeat every 2 of that unit; for a weekday the rule is `every 2 weeks` and the task starts on the first such weekday on or after today. Equivalents: `jeden zweiten` / `jede zweite` / `jedes zweite` / `alle zwei`; `un … sur deux`, `une … sur deux`, `tous les deux` / `toutes les deux`; `ogni due`, plus `a giorni alterni`, `a settimane alterne`, `a mesi alterni`, `ad anni alterni`; `cada dos`; `a cada dois` / `a cada duas` / `cada dois` / `cada duas`.
- Both parsers (`web/src/lib/nlp`, `internal/quickadd`) change together; new shared vectors cover every case in all six languages.

Not **BREAKING**: no op field, no route, no rule-grammar change. One reading changes on purpose: German `jeden zweiten Freitag` without `im Monat` was the monthly `every 2nd friday` and is now every 2 weeks, which is what it means; `jeden zweiten Freitag im Monat` stays monthly.

## Capabilities

### Modified Capabilities
- `natural-language-capture`: bare month names and "every other" phrases.

## Impact

`web/src/lib/nlp` (vocabulary, dates, recurrence, parse), `internal/quickadd` (the same and `vocab.json`), `quickadd.vectors.json`, `docs/quick-add.md`. No dependency; a few hundred bytes of vocabulary in the lazily loaded parser.
