# Design

## D1. A month alone is a weak date

`monthDayAt` already knows when it matched a month name with no day (it consumed one token). `matchDateAt` marks such a match `bare`. The parser keeps the first date as before, except that while its date is bare it still reads date phrases: a complete one replaces the bare month (whose word then stays in the title, since only chip spans leave it), another bare month is ignored. "tonight" and "this morning" replace a bare month like any complete date. Two complete dates keep today's rule: the first wins. The issue's "prefer the last complete phrase" is met for the case it describes (bare month, then a complete date) without changing which of two complete dates wins.

## D2. A month after "from" is text

A month name alone right after a word of the new vocabulary list `monthTextBefore` (any active language) is no date at all, so `File the invoices from September` keeps its title and gets no due date. Words that already introduce a date (`by`, `bis`, `pour`, `per`, `para`, the `before` lists) are left out on purpose: `pour septembre` stays a date. `D of MONTH` forms (`3 de septiembre`) are read from the day number and are not affected.

## D3. "every other" is an interval of 2

The rule grammar has no interval-plus-weekday form, and this change does not add one. `every other <unit>` becomes `every 2 <unit>s`. `every other <weekday>` becomes `every 2 weeks` with the task's first date set to the first such weekday on or after today (the same day `every <weekday>` starts on); the interval rule then steps 14 days from that date, which is "every other Friday". This is exactly what `every 2 weeks on friday` gives today. The recurrence match carries that start date; the parser uses it when the line has no date phrase of its own.

New vocabulary: `everyOther` (phrases before the noun) and `everyOtherAround` (before and after the noun, for French `un vendredi sur deux`). The "every other" reading is tried first, so on a tie it wins over the ordinal reading: German `jeden zweiten Freitag` is every 2 weeks, while `jeden zweiten Freitag im Monat` is longer and stays `every 2nd friday`. Italian `a settimane alterne` (and days, months, years) are one-word forms in `everyOne`.

Languages: all six have a form. Left out: numeric counts before a weekday (`every 2 Mondays`, `ogni 2 lunedì`) keep the documented literal reading; only the words for "other" and "two" are read. `every second friday` stays the monthly `every 2nd friday` in English, Italian (`ogni secondo`), Spanish (`cada segundo`), French and Portuguese, because there an ordinal word reads as an ordinal.

## Data model

None. No op field, no migration, no rule grammar change. `internal/quickadd/vocab.json` is regenerated with `npm run nlp:vocab`. No dependency; binary and bundle sizes change by a few hundred bytes.

## Interface

No screen changes: the preview shows the existing due and Repeats chips.
