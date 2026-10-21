# Design

## Context

See proposal.md for motivation. The current state that shapes the approach:

- **Two parsers, one grammar.** `parse()` in `web/src/lib/nlp/parse.ts` walks the tokens; at each position it asks `matchDateAt`, `matchTimeAt`, `matchRecurrenceAt` and `matchReminderAt` for the longest phrase starting there (a date wins a tie) and records a span, which is what chips, Backspace and dismissal work on. `internal/quickadd` is the line-for-line Go port (`parse.go` `step`, `dates.go`, `recurrence.go`), used by `ot add --natural`. Both run every case of `web/src/lib/nlp/quickadd.vectors.json` (`nlp/vectors.test.ts`, `internal/quickadd/vectors_test.go`), and the Go port reads `internal/quickadd/vocab.json`, written from `web/src/lib/nlp/vocab/*.ts` by `npm run nlp:vocab` and guarded by the staleness test in `nlp/vocab.test.ts`.
- **Date sub-matchers** live in `matchDateAt` (`dates.ts:260-279`, `dates.go matchDateAt`): day words, then, with an optional leading `before` word (`on`, `am`, `le`, `el`, `il`, `na`), `weekdayPhraseAt`, `nextPeriodAt`, `inPeriodAt`, `monthDayAt`, `numericDateAt`. `dayNumber` reads `2nd`, `15.`, `3º`, `1er` through `DAY_RE` / `dayRE`; `monthAt` reads full names anywhere and abbreviations next to a day; `nextOccurrence(today, month, day)` rolls a month-day to the next year when it has passed.
- **The recurrence grammar already has ordinal weekdays.** `patternAt` (`nlp/recurrence.ts`, `recurrence.go`) turns an ordinal (`ordinalAt`: a `dayNumber` with a suffix, or a word from `vocab.ordinals`, which lists `first`…`fourth`/`last` and their five translations) followed by a weekday into `2nd monday`/`last friday`; `parseRule` accepts it as `nthWeekday`; `nextCalendar`, `firstOccurrence` and `internal/recurrence` (`nthWeekdayOf`, `rrule.go` → `FREQ=MONTHLY;BYDAY=2MO`) compute it, pinned by `web/src/lib/recurrence.vectors.json`. What is missing is the tail: `of the month` stays in the title, in every language.
- **A bare number after "every" is a count only when a unit follows** (quick-add-recurrence implementation note): `every 2 Mondays` matches nothing today and the whole phrase stays in the title in English, but in Spanish and Italian (`cada 2 lunes`, `ogni 2 lunedì`) the weekday is then read by the date grammar, and in German `alle 2 Montage` the Italian `alle 2` reads as 02:00.
- **Portuguese** leaves `segunda` and `quarta` out of `ordinals` because they are weekdays (`segunda-feira`, `quarta-feira`, also written alone).
- **No screen changes.** The due chip prints the resolved date with `dueInWords`; the recurrence chip prints the canonical rule and, without a typed date, ` · ` and the first occurrence (`QuickAdd.tsx chipText`). The spec's "Live preview chips" requirement already covers both.

## Goals / Non-Goals

**Goals:**
- One-off ordinal weekdays and the "of the month" tail in both ports, with identical results on every shared vector, and no change to the rule grammar, its vectors or the server.
- One stated disambiguation rule (word or suffixed number = ordinal; bare number = count, inexpressible, literal) that holds in all six languages, including the Portuguese weekday-ordinals.
- The nth-weekday arithmetic written once per port: the date grammar reuses the rule engine's helper.

**Non-Goals:**
- Translating the rule in the chip, or any change to `QuickAdd.tsx` beyond its test.
- `every other Monday` or `every 2 Mondays` as a rule: the grammar has no interval-plus-weekday form, and adding one is a rule-model change with its own vectors and RRULE mapping (`FREQ=WEEKLY;INTERVAL=2;BYDAY=MO`), out of scope here.
- Reading `user_prefs` from the CLI (quick-add-recurrence D7 stands; the new phrases do not depend on week start or numeric order).

## Decisions

### D1. One more date sub-matcher, reusing the rule engine's arithmetic

`ordinalWeekdayAt(tokens, j, v, ctx)` joins the list in `matchDateAt` (TS and Go), tried from the same start positions as `weekdayPhraseAt` (so the `before` words `on`/`am`/`le`/`el`/`il`/`na` are swallowed as for any date). Grammar, in order: an optional article from the new `ordinalArticles` list (English `the`, German `den`; the Romance articles are already `before` words), an ordinal (D3), a weekday from `weekdayAt`, then optionally either a link word from `ordinalOf` (`of`, `im`, `de`, `di`, `de`, `de`) followed by `monthAt` (full names and abbreviations; a following four-digit year is taken as `monthDayAt` does) or the `ofMonthWords` phrase (D2). Resolution:

- no month: `nthWeekdayOf(y, m, ordinal, wd)` for today's month; if that date is before today, for the next month;
- a month: that month in today's year; if before today, next year (the same rule `nextOccurrence` applies to `3 Feb`); with an explicit year, that year only.

`nthWeekdayOf` is exported from `web/src/lib/recurrence.ts` behind a small `nthWeekdayDate(y, m, ordinal, weekday): string` wrapper (the module already works on civil day numbers and `nlp/parse.ts` already imports `firstOccurrence` from it); the Go port calls an exported `recurrence.NthWeekdayDate` over the existing `nthWeekdayOf`. Both ports therefore agree with the rule engine by construction: `second Monday` and the first occurrence of `every 2nd monday` are the same function.

The matcher consumes at least two tokens, so at the position of `second` it beats the single-token weekday that `weekdayPhraseAt` would find one token later; a plain weekday is untouched. An ordinal with no weekday after it matches nothing (`Pay the second invoice`), and an ordinal above four or below one matches nothing, so `5th Friday` stays literal, as the spec says.

- **Alternative: extend `weekdayPhraseAt` with an ordinal prefix.** Rejected: that function carries the `next`/`this` qualifiers and the week-start rule; an ordinal weekday has neither, and mixing them invites `next second Monday`.
- **Alternative: resolve "second Monday" as the second Monday from today.** Rejected: the phrase means a calendar position, the same one the rule grammar gives `every 2nd monday`, and the recurrence chip would otherwise show a different date for the same words.

### D2. The "of the month" tail is a vocabulary phrase, swallowed only after a monthly pattern

A new `ofMonthWords` list per language (`of the month`, `of every month`; `im Monat`, `des Monats`, `jeden Monats`; `du mois`, `de chaque mois`; `del mese`, `di ogni mese`; `del mes`, `de cada mes`; `do mês`, `de cada mês`). In `matchRecurrenceAt`, after `patternAt` returns a monthly pattern (an nth weekday, a day of the month, `last day` or `last weekday`), the tail is consumed before the `after completion`/`until`/`for N times` tails, in any active language like those tails. It contributes nothing to the rule string. After a weekly pattern (`every monday of the month`) it is not consumed, so that odd phrase stays visible in the title instead of being silently accepted. In the one-off grammar (D1) the same list is accepted after the weekday and means "this or next month", i.e. the default.

- **Alternative: add `of the month` to the rule grammar as an accepted spelling.** Rejected: the stored rule is canonical English and the server would then need to accept and strip a synonym in `internal/recurrence` with new vectors, for no change in meaning.

### D3. Ordinal forms, and the count-versus-ordinal rule

An ordinal, in both grammars, is: a word from `vocab.ordinals` (unchanged lists), a word from the new `ordinalsBeforeWeekday` map when a weekday follows directly (Portuguese `segunda: 2`, `quarta: 4`; empty elsewhere), or a number from 1 to 4 with an ordinal suffix. The suffixes are `DAY_RE`'s (`st nd rd th . º ° ª o a er`) plus the French `e`, `ème`/`eme` and `re`, checked by a dedicated `ORDINAL_RE` in the ordinal-weekday grammars only, so `2e` becomes a day number nowhere else. `last` and its translations are `-1`, as in the rule grammar.

A bare number between the "every" word and a weekday is a count. The grammar cannot express it, so `matchRecurrenceAt` returns a **literal match** `{literal: true, from, to}` covering the every-word, the number and the weekday (plural forms through `weekdayPluralAt`, which already strips the Romance `s`). `parse()` and the Go `step` treat a literal match like any match in the longest-wins comparison but record no attribute and add no chip, so the phrase is skipped as a unit: `cada 2 lunes` no longer leaves `lunes` to the date grammar, and `alle 2 Montage` no longer reads `alle 2` as a time. The existing `every 3 hours` case keeps its behaviour (nothing matches, the loop moves one token) because its result is already right; the literal match is used only where a partial parse would otherwise happen.

- **Alternative: read `every 2 Mondays` as `every 2 weeks` anchored on Monday.** Rejected: that is an interval-plus-weekday rule the model does not have (Non-Goals), and guessing a different rule than the words say is what this change is removing.
- **Alternative: leave Spanish and Italian as they are.** Rejected: a title `Reunión cada 2` with a Monday due is worse than the untouched line; the spec rule "neither rule nor date" is the only version that holds in all six languages.

### D4. Vocabulary fields and the generated file

`Vocabulary` (`nlp/vocab/types.ts`) and `Vocab` (`internal/quickadd/vocab.go`) gain `ordinalArticles: string[]`, `ordinalOf: string[]`, `ofMonthWords: string[]` and `ordinalsBeforeWeekday: Record<string, number>`; the six `vocab/*.ts` files fill them (empty lists where a language needs none; English `ordinalsBeforeWeekday` is `{}`). `npm run nlp:vocab` rewrites `internal/quickadd/vocab.json`; `vocab.test.ts` fails until it is run, as today. `vocab.test.ts`'s shape checks (no empty phrase, phrases normalised) cover the new lists automatically.

### D5. Vectors, one per scenario and language

`quickadd.vectors.json` gains about twenty cases, all with `today: 2026-10-09`, one for every scenario of the two spec deltas in every language it names, plus the negative cases (`Pay the second invoice`, `5th Friday`, `every monday of the month` keeps the tail in the title). No test harness changes: both runners iterate `cases`. The dismissal scenario is a `parse()` test with `dismissed` spans in `nlp.test.ts` (the vectors carry no dismissals) and the chip wording a case in `web/src/app/quickAddRecurrence.test.tsx` (`every 2nd monday · Mon 12 Oct`, the long date form the existing test reads).

### D6. CLI

No flag, help, schema or `SKILL.md` change: `--natural` already routes the line through `internal/quickadd`. `TestAddNatural` in `internal/cli/cli_test.go` gets one more line (the spec's "Ordinal weekday line", `fixedNow` is Saturday 2026-10-10 so the second Tuesday is the 13th). `docs/cli.md` needs no change; it points at `docs/quick-add.md`.

### D7. Docs

`docs/quick-add.md`: one row in the dates table (`second Monday`, `2nd monday`, `last Friday`, `the 3rd Friday of November`: the next such date, this month or next, or that month this year or next), one sentence under "Repeat and remind" (`of the month` is accepted after a monthly rule; a bare number before a weekday, `every 2 Mondays`, is not a rule and stays as typed), and the ordinal words per language in the languages table examples (`am zweiten Montag`, `le 2e lundi de novembre`, `secondo lunedì`, `tercer viernes de noviembre`, `segunda segunda-feira`, `última sexta`). `make docs-check` runs as usual. `QUICK_ADD_SYNTAX` in `web/src/lib/shortcuts.ts` is unchanged: its first row (`tomorrow · next Wed · 3 Feb · at 3pm`) already stands for the date grammar as a whole.

## Data model

No change. The task is written with the resolved `due` and, for a rule, the existing canonical `recurrence` string; no op field is added, renamed or retyped, and `e2ee.ContentFields` is untouched (a resolved date and a canonical rule are not user-written content). Offline and convergence behaviour is the existing one: the parse happens on the device, the resulting ops are the same `task` ops as a typed date or a rule from the Repeat field, and they converge per field by last-writer-wins.

## Size and resources

No dependency. Web bundle: about 300–500 bytes gzipped (four short word lists in six languages, one sub-matcher, one tail, one regular expression). The `ot` binary grows by a few kilobytes of code and vocabulary; the server binary does not import `internal/quickadd`, so the container image and runtime memory are unchanged. Parsing cost is one more sub-matcher per token position, negligible against the existing five.

## Interface budget

No screen changes: no new chip kind, row, property, destination, scroll region or shortcut. The only file under `web/src/app` touched is the test `quickAddRecurrence.test.tsx`. Rows of chrome, visible task properties, sidebar destinations and scroll regions are unchanged; no shortcut is added, so the registry in `web/src/lib/shortcuts.ts` is untouched and conflict-free.

## Risks / Trade-offs

- [English and German `last Friday` / `letzten Freitag` often mean the past Friday (`Review notes from last Friday`)] → The parser never resolves to the past, so the only wrong reading today is a future date with `last` left in the title; after this change the chip shows the exact date, the span is dismissable with Backspace twice or the chip's dismiss control and quotes keep it literal, as for `may`. Documented in `docs/quick-add.md` next to the row; a vector and the dismissal test pin both the match and the escape.
- [`second`, `segundo` and `secondo` are also the time unit] → An ordinal counts only directly before a weekday; `wait 30 seconds` and `every second` stay literal (negative vectors).
- [`den` as a German article could swallow a word of the title] → It is consumed only when an ordinal and a weekday follow it, like `the`.
- [`2e` as a day number] → Confined to the ordinal-weekday grammars by `ORDINAL_RE`; `DAY_RE` is unchanged, so `le 2e novembre` and product codes are untouched.
- [Portuguese `segunda segunda-feira` reads oddly; `segunda quarta` could mean "second Wednesday" or "Monday, Wednesday"] → `ordinalsBeforeWeekday` applies only when a weekday name follows directly, and the list form `segunda, quarta` with a separator is a weekday list in the rule grammar as before; both forms are vectors.
- [The two ports drift] → Every scenario is a shared vector run by both test suites in `make check`; the `vocab.json` staleness test catches a vocabulary edit without regeneration.
- [The literal match (D3) is a new parser concept] → It is one optional flag on the existing match shape, used in exactly one place, and the longest-wins loop already handles a match that writes nothing (a dismissed span).

## Migration Plan

Nothing to migrate: the change ships with the web bundle and the `ot` binary. Tasks captured before it keep their stored dates; a line typed on an older client is never re-parsed by a newer one. Rollback is reverting the commit and regenerating `vocab.json`.

## Implementation notes

- **`5th Friday` is a literal match, not "nothing".** Matching nothing at the ordinal would have let the date grammar read `Friday` alone one token later (*Audit 5th* due next Friday), which offers a date the spec says stays literal. A suffixed number above four directly before a weekday (`ordinalOutOfRangeAt` in `nlp/dates.ts` and `dates.go`) is therefore a literal match in `parse()`/`step`, like the bare count of D3: the two tokens stay whole in the title, no chip. The vector `negative: fifth Friday stays literal` pins it.
- **Plural weekdays after "every".** The count-before-weekday literal needs the plural forms of the scenario: `weekdayPluralAt` now also tries the German plural without its final `e` (`Montage`, only for tokens of six letters or more, so `mare` never becomes `mar`) and hyphenated plurals without the `s` of each part (`segundas-feiras`). These stems apply only after an "every" word; the date grammar still reads singular names only, so `Montage` (assembly) in a title is untouched.
- **A list separator ends an ordinal.** `weekdayOrdinalAt` never reads an ordinal whose token ends in `,` or `;` (`toda segunda, quarta` stays the weekday list `every monday, wednesday`; `3rd, Friday` is not the third Friday). Vector `Portuguese weekday list is not an ordinal`.
- **A literal still counts after the first rule.** `parse()` and `step` now ask the recurrence matcher at every position and, once a rule is set, keep only literal matches, so `Pay rent every month cada 2 lunes` does not hand `lunes` to the date grammar (vector `count before weekday after a rule`). Real second rules are still ignored as before.
- **Helper signature.** `nthWeekdayDate(y, m, ordinal, weekday)` (TS) and `recurrence.NthWeekdayDate` (Go) take the ISO weekday (1 = Monday … 7 = Sunday) of the rule engine; the quick-add matchers pass `weekdayAt(...) + 1`. The proposal's Impact list names `web/src/lib/recurrence.ts` and `internal/recurrence` as unchanged; per D1 each gains only this exported wrapper, with no change to the rule grammar, its vectors or `rrule.go`.
- **Shared helpers for later grammar work.** `weekdayOrdinalAt` (ordinal before a weekday, with the weekday test passed in: singular for dates, plural after "every") and `ofMonthAt` (the tail in any active language) live in `nlp/dates.ts` / `dates.go`; `RecurrenceMatch.literal` / `recMatch.literal` is the one literal-match flag; `patternAt` returns a `{n, pattern, monthly}` value (Go `*recPattern`). No other matcher changed shape, so a new attribute token can be added in `attributes.ts` / `attributes.go` without touching these.
- **Vocabulary.** Besides the phrases D2 lists, `ofMonthWords` has `of each month` (en), `jedes Monats` (de), `de tous les mois` (fr), `de todo mês` and `de todo o mês` (pt).
- **Today.** The web parser already receives the logical today (`logicalToday()` in `QuickAdd.tsx`, day-boundary); the ordinal resolution reads only `ctx.today`, and `nlp.test.ts` pins that a 04:00 day start at 02:00 on Tuesday 13 Oct resolves `second Monday` to Monday the 12th. `ot add --natural` keeps passing the calendar date, since the CLI does not read `user_prefs` (D6, quick-add-recurrence D7).
- **Chip wording.** The chip test compares against `formatDate('2026-10-12', 'long')`, because the long form follows the locale (`Mon, Oct 12` in the test's en-US, `Mon 12 Oct` elsewhere).
- **Smoke test (task 5.2), 2026-10-20.** Scripted in the bundled Chromium against a fresh `./bin/opentodo` with quick-add languages `en, de`: `Dentist second Monday` showed the due chip *9 Nov* (the second Monday of October had passed); `Board every 2nd monday of the month` showed only the recurrence chip *every 2nd monday · Mon, 9 Nov*; `Treffen alle 2 Montage` showed no chip. `ot add --natural "Report the 3rd Friday of November"` with a token minted from that session created *Report* due 2026-11-20. `make e2e` passed.
