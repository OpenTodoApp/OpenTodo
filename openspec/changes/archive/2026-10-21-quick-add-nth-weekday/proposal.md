# Proposal

## Why

Quick add understands `every 2nd Tuesday` as a rule but not `second Monday` as a date: today `Dentist second Monday` silently becomes *Dentist second* due next Monday, `the 3rd Friday of November` becomes *the 3rd of November* due Friday, and `every 2nd monday of the month` leaves *of the month* in the title. Ordinal weekdays are how people say when a board meets, when the bins go out and when rent is due, in every one of the six quick-add languages, and the chips show a wrong date rather than nothing, so the misread reaches the task.

## What Changes

- Quick add recognises an **ordinal weekday as a one-off date**: `second Monday`, `2nd monday`, `the 3rd Friday of November`, `last Friday`, with the ordinal words and numeric ordinal forms of each language (`zweiten Montag`, `le 2e lundi de novembre`, `secondo lunedì`, `tercer viernes de noviembre`, `última sexta`). Without a month it resolves to that weekday of the current month when it is today or later, else of the next month; with a month name it resolves to that month's occurrence, this year or next, like `3 Feb` does. It gets the ordinary due chip and is dismissable like any date.
- Recurrence phrases accept the **"of the month" tail** after a monthly pattern: `every 2nd monday of the month`, `jeden zweiten Montag im Monat`, `tous les 2e lundis du mois`, `ogni secondo lunedì del mese`, `cada segundo lunes del mes`, `toda segunda segunda-feira do mês`. The stored rule is unchanged (`every 2nd monday`); the chip reads the rule with its first date as today. The rule grammar, its next-occurrence maths and the CalDAV `RRULE` mapping already have the nth-weekday form (`BYDAY=2MO`), so nothing changes in the rule model.
- The **disambiguation rule** is stated once and pinned in every language: an ordinal is a word (`second`, `zweiten`, `deuxième`, `secondo`, `segundo`) or a number with an ordinal suffix (`2nd`, `2.`, `2º`, `2e`); a bare number before a weekday (`every 2 Mondays`, `alle 2 Montage`, `cada 2 lunes`) is a count the rule grammar cannot express and stays in the title with no rule, exactly as today. Portuguese `segunda` and `quarta` count as ordinals only directly before a weekday (`segunda segunda-feira`); alone they stay Monday and Wednesday.
- `ot add --natural` gets the same grammar through the shared Go port; one CLI test covers it.
- No new dependency, setting, route, op field, shortcut or chip kind.

Out of scope: "the weekday after", business-day arithmetic and holidays; "of next month" / "of next year" tails on a one-off ordinal weekday (a named month covers the planning case); a fifth ordinal (the rule grammar stops at the fourth and "last", and a fifth Monday does not exist every month); a translated rule in the chip (the chip shows the canonical rule, as `quick-add-recurrence` decided); changes to the Repeat field, the importers, the assistant tools or the server.

Advances ROADMAP.md `nlp-quick-add` (natural-language quick add in six languages) and `quick-add-recurrence` (quick add for recurrence, the same grammar in `ot add`).

No new environment variable. No change to the op log format or the rule grammar. Not **BREAKING**.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `natural-language-capture`: three new requirements, "Ordinal weekday phrases" (the one-off form in six languages), "Ordinal weekday resolution" (this or next month, this or next year) and "Ordinal weekday chips and storage" (the due chip, dismissal, offline and convergence); the "Recurrence phrases" requirement gains the "of the month" tail and the count-versus-ordinal disambiguation with a scenario per language.
- `cli-client`: the "Natural-language line in `ot add`" requirement gains an ordinal-weekday scenario, since the CLI must equal the web parser for every shared vector.

## Impact

- Web parser: `web/src/lib/nlp/dates.ts` (one more date sub-matcher tried by `matchDateAt`), `web/src/lib/nlp/recurrence.ts` (the tail after a monthly pattern), `web/src/lib/nlp/vocab/types.ts` and the six `vocab/*.ts` files (three small word lists), `web/src/lib/nlp/quickadd.vectors.json` (about twenty new cases), `nlp.test.ts`, and the chip test `web/src/app/quickAddRecurrence.test.tsx`.
- Go port: `internal/quickadd/dates.go`, `recurrence.go`, `vocab.go`, the regenerated `vocab.json` (`npm run nlp:vocab`), `vectors_test.go` (reads the same vectors), one case in `internal/cli/cli_test.go`.
- Unchanged: `web/src/lib/recurrence.ts`, `internal/recurrence` (parser, next occurrence, `rrule.go`), `web/src/lib/recurrence.vectors.json`, the sync op schema, the server, CalDAV.
- Specs: `openspec/specs/natural-language-capture/spec.md`, `openspec/specs/cli-client/spec.md`. Docs: `docs/quick-add.md` (a row in the dates table, a line under "Repeat and remind", the day/month ordinal forms per language), `CHANGELOG.md`.
- Bundle: a few hundred bytes gzipped (three word lists and about sixty lines of grammar). The `ot` binary grows by a few kilobytes; the server binary, image and runtime memory are unchanged.
- No API, sync or data-model impact.
