# Design

## Context

See proposal.md (Why). The current state that shapes the approach:

- **The parser is a token-by-token loop with longest-match phrase grammars.** `parse()` (`web/src/lib/nlp/parse.ts:60-150`) walks whitespace tokens; at each position it tries the single-token attribute matchers, then `matchDateAt` and `matchTimeAt` (`nlp/dates.ts:234-253`, `:397-416`), takes the longest match, and records a span. Chips are generic: `Chip {kind, key, spans, value}`; dismissal (`liveDismissals`, `rebaseDismissed`), Backspace highlighting (`quickadd.ts chipAtCaret`) and quoting (`tokenize.ts`) work on spans, not kinds. Adding two kinds is a matter of two matchers and two `chipText` cases (`app/QuickAdd.tsx:63-78`).
- **Vocabularies are typed data** (`nlp/vocab/types.ts`), one file per language, matched after `normalize()`. The `Vocabulary` type has units for hour, day, week and month, "next"/"this"/"in" words, "at" words and so on, but no minute unit and nothing for "every", "before/after" or "remind".
- **The recurrence grammar is English and canonical** (`web/src/lib/recurrence.ts:63-160`, `internal/recurrence/recurrence.go:134`), checked against `web/src/lib/recurrence.vectors.json` from both sides. `createTask` already accepts a `recurrence` input, canonicalises it and fills the due date with `firstOccurrence` when the task has none (`lib/ops.ts:499-517`).
- **Reminders** are an entity with `kind`, `offset_minutes` and `fire_at` (`lib/types.ts:173-184`). `addReminder` (`lib/reminders.ts:15-33`) writes one with `mutate()`; `relativeFireAt(due, offset)` (`lib/reminderTime.ts`) computes the instant, 09:00 for a date-only due. `mutateMany` (`lib/ops.ts:269-308`) batches changes for several entities into one transaction and appends `reminderFollowUps` for existing reminders when a due changes.
- **Every quick-add consumer spreads the parsed input into `createTask`**: `TaskListView.tsx:374-382` (after `taskDefaults(route, …)`), `Sections.tsx:89-93`, `ShareCapture.tsx:69-78`. New fields in `QuickAddInput` reach all three without changes there.
- **The CLI has no parser.** `ot add` takes the title verbatim and resolves `--due` with a small word list (`internal/cli/dates.go:26-52`); `--time` is validated by `validClock`. The command table (`internal/cli/commands.go:96-97`) feeds `ot schema`, whose output is pinned by `testdata/schema.golden.json` (`agent_test.go:272-290`, `go test -update`). Dry runs collect planned requests and hand later requests a placeholder id (`gate.go:149-153`).
- **Importers and agent tools already speak the canonical grammar.** `internal/importer/schedule.go:36-46` has its own English spelling table; `internal/agenttools/write.go:44` accepts a canonical `recurrence` on `create_tasks`. The in-flight `named-importers` design (D7) plans a Todoist date parser that extracts the six vocabularies into a shared JSON file.

## Goals / Non-Goals

**Goals:**
- Recurrence and reminder phrases in the six languages, producing exactly the canonical rule and the reminder ops the detail panel would produce.
- One source of truth for the words, and one vector file that both parsers must pass.
- A Go port good enough for `ot add --natural`, structured so the importers and the assistant can reuse it later.
- The task and its reminders in one transaction on the device.

**Non-Goals:**
- A translated rule in the chip or in the Repeat field. The chip shows the canonical rule; translating the field is `app-localization`'s business.
- Hourly rules, "every other Monday" (an interval combined with a weekday, which the grammar cannot express), or reminder phrases without an offset or moment.
- Reading the user's week-start and date-format preferences from the CLI (`user_prefs` has no REST collection; see D7).

## Decisions

### D1. Two more phrase grammars in the same loop, longest match wins

`nlp/recurrence.ts` exports `matchRecurrenceAt(tokens, i, dctx)` and `nlp/reminders.ts` exports `matchReminderAt(tokens, i, dctx)`, with the same `{from, to, …}` shape as `DateMatch`. In `parse()` they are tried at every position before the date and time matchers, and the longest of all four wins (a date on a tie, as today). Because they start on a trigger word ("every"/"jeden"/"tous les"… or "remind me"/"erinnere mich"…) that no date or time phrase starts on, the only real overlap is inside the phrase: `every Monday` must consume `Monday`, and `remind me tomorrow at 9` must consume the date and time. Both grammars therefore call `matchDateAt`/`matchTimeAt` on their inner tokens instead of re-implementing them, so `remind me 20 Oct at 9` and `until 31 Dec` get every date form the line already understands.

First rule wins; a second recurrence phrase stays literal (like a second date). Reminders accumulate, like labels.

- **Alternative: run the recurrence grammar as a post-pass over the title.** Rejected: spans would be unavailable for dismissal and Backspace, which issue #6 explicitly asks to keep working.
- **Alternative: feed the whole line to `parseRule` and look for "every".** Rejected: the stored grammar is English and anchored at the start of the string; it cannot find a phrase inside a title or translate it.

### D2. Recurrence phrases translate to the canonical rule, never to a new grammar

`matchRecurrenceAt` recognises, per active vocabulary: `every` words + `[N] unit` (day/week/month/year, singular and plural), `every` + weekday list (separators: comma, "and"-words; Romance plurals such as `lundis` matched by stripping a trailing `s` inside this grammar only), `every` + weekday-collective word (`weekday(s)`, `werktags`, `jours ouvrés`…), `every` + ordinal (`2nd`, `15.`, `15th`, word ordinals `first`…`fourth`/`last`) with or without a following weekday, `last day`/`last weekday`, one-word forms (`daily`, `täglich`, `quotidiennement`…), then the optional tails `after completion` (language forms), `until <date phrase>` and `for N times` / `N mal` / `N fois`…. It builds the English rule string from these parts and hands it to `parseRule`; the chip value is `parsed.canonical`. Anything `parseRule` rejects is not a match, so the parser can never emit a rule the server would refuse (`internal/sync/ops.go:385-397`).

The vocabulary gains, per language: `every: string[]`, `everyOne: Record<string,string>` (one-word forms → English pattern), `weekdayAll: string[]`, `ordinals: Record<string, number>` (-1 = last), `lastWords`, `afterCompletion: string[]`, `untilWords: string[]`, `timesWords: string[]`, `andWords: string[]`, `dayOfMonthMarkers` (the `.`/`th`-style suffixes already in `DAY_RE`). English examples in `docs/quick-add.md`; every other language is pinned by vectors.

- **Alternative: store the phrase as typed and let the server translate.** Rejected: the server has no vocabulary, and "released facts" would then differ per device.

### D3. Reminder phrases produce an intermediate, zone-free value; resolution happens in `createTask`

`ParseResult.reminders: ReminderPhrase[]` where

```
ReminderPhrase =
  | { kind: 'offset'; minutes: number }                  // negative = before
  | { kind: 'moment'; date: string | null; time: string } // floating wall clock
```

The parser stays a pure function with no zone or clock dependency beyond `ctx.today`/`ctx.now` (D5 of `nlp-quick-add`). Offsets come from the amount grammar: a count plus the minute/hour/day/week unit, or a `+30m`-style duration through `matchDuration`, followed by a before/after word. A moment is a time phrase, optionally preceded or followed by a date phrase.

`createTask` gains `reminders?: ReminderPhrase[]` and resolves them after the view defaults have been merged into `input.due` (the spec's "Reminder moments resolve against the due date"):
- offset → `{kind:'relative', offset_minutes}`; `fire_at = relativeFireAt(due, offset)` (null without a due).
- moment with a due → relative, `offset_minutes = minutesBetween(dueWall, momentWall)` where `dueWall` is `due.date` + (`due.time` ?? `09:00`) and `momentWall` is (`date` ?? `due.date`) + `time`, computed on wall-clock day numbers and minutes (no `Date`, no DST effect), so every device computes the same offset. `fire_at` then comes from `relativeFireAt` like any relative reminder. A zoned due (`due.tz`) is read at its own wall time, which is what the user typed.
- moment without a due → absolute, `fire_at = dueInstant({date: date ?? today, time})` in the device's zone, rolled to the next day when `date` is null and the instant is not after `now`.

The reminder rows are built as `Change`s and passed to `mutateMany` together with the task change, so one transaction writes task and reminders (reminders spec "Reminders created with their task"). `addReminder` is unchanged for the detail panel.

- **Alternative: resolve in the parser.** Rejected: the view's default due (`taskDefaults`) is applied after parsing, and absolute instants depend on the device zone, which the parser must not touch.
- **Alternative: always absolute reminders.** Rejected: a reminder that does not follow a rescheduled or recurring task is the opposite of what "every Monday remind me at 8" asks for, and recurring tasks only carry relative reminders forward.

### D4. Chips and wording

Two chip kinds with hues from the token palette: `recurrence` (text: the canonical rule, plus ` · ` and the first occurrence formatted with `formatDate(iso, 'compact')` when the line has no date phrase) and `reminder` (text: `30 min before` / `1 hour after` / `at due time` for offsets, `formatInstant(ms, 'long')`-style for absolute moments, and `needs a due date` appended when a relative reminder has no due). `KIND_NAME` and `CHIP_HUE` in `QuickAdd.tsx` get the two entries; the `sr-only` prefix ("Reminder: ") and the "Keep … as text" dismiss button come for free. `QUICK_ADD_SYNTAX` in `lib/shortcuts.ts` gains one row (`every Monday · remind me 30 min before`), which `make docs` writes into `docs/keyboard.md`.

### D5. A Go port in `internal/quickadd`, checked against shared vectors and a shared vocabulary file

The port covers the whole quick-add grammar, not only the two new phrases, because recurrence and reminder phrases embed date and time phrases, and because `ot add --natural` is only useful if `#project`, `tomorrow at 9` and `p1` work too. Package layout mirrors the TypeScript: `tokenize.go`, `vocab.go` (+ `vocab.json` embedded), `dates.go`, `attributes.go`, `recurrence.go`, `reminders.go`, `parse.go`. Pure functions over strings and day numbers; the standard library only; it imports `internal/recurrence` for `Canonicalize` and first-occurrence math. Estimated 1,200–1,500 lines, about 150 KB on the `ot` binary; the server does not import it.

Two shared files keep the ports honest, following the `recurrence.vectors.json` and `activity_fixture.json` precedents:

- `web/src/lib/nlp/quickadd.vectors.json`: `{cases: [{line, ctx: {today, now, languages, projects, dayMonthOrder?, weekStart?}, expect: {title, due, projectId, labels, priority, estimateMinutes, recurrence, reminders}}]}`. `nlp.test.ts` runs every case through `parse()`; `internal/quickadd/vectors_test.go` reads `../../web/src/lib/nlp/quickadd.vectors.json` and runs it through `Parse()`. Every scenario in the spec deltas is a case, in every language it names.
- `internal/quickadd/vocab.json`: the six vocabularies serialised. `web/scripts/nlp-vocab.mjs` (`npm run nlp:vocab`) writes it from `vocab/*.ts`; `nlp/vocab.test.ts` fails when the file is stale ("run npm run nlp:vocab"), the same way the docs check fails on a stale help bundle. `named-importers` D7 reads this file instead of extracting its own.

- **Alternative: a server route `POST /api/v1/parse` for the CLI.** Rejected: the server has no parser either, so the port is needed anyway; a route would add an authenticated endpoint and a demo-deny-list entry for no benefit, and the CLI's dry run could no longer show the requests without talking to the server.
- **Alternative: port only recurrence and reminders and keep `--due` words.** Rejected: "every Monday" without the date grammar cannot handle `until 31 Dec` or `remind me tomorrow at 9`, and two half grammars would drift.
- **Alternative: JSON as the single source imported by TypeScript.** Rejected for now: the TypeScript files carry types and comments, and a build-time import from outside `web/` needs Vite `server.fs` exceptions. The generated copy plus a staleness test costs one script.

### D6. CLI flags and requests

- `--natural` (bool): parse the positional line with `internal/quickadd`. Reference date and time are `a.Now()` in the local zone, as `--due tomorrow` already uses. `--lang de,en` picks vocabularies; the default is the primary subtag of `LC_ALL`/`LC_MESSAGES`/`LANG` when bundled, English otherwise and always appended. Numeric order follows the first language (the web's language rule, `nlp/settings.ts:88-93`); weeks start on Monday. Explicit flags (`--due`, `--project`, …) win over what the line says.
- `--repeat <rule>` (add and edit): canonicalised locally with `recurrence.Canonicalize`; `none` clears on edit. Sent as `recurrence` in the task body; the server validates again.
- `--remind <phrase>` (add, repeatable): the reminder grammar without its trigger word (`internal/quickadd.ParseReminder`), resolved against the task's final due with the D3 rules; absolute moments use the process's local zone.
- Requests: `POST /tasks` as today, then one `POST /reminders` per reminder in order, body `{task_id, kind, offset_minutes}` for relative (the server computes `fire_at`, `docs/api.md:562`) or `{task_id, kind:"absolute", fire_at}`. With `--idempotency-key K`, reminder `n` sends `K.r<n>`, so a retry converges to one task and one set of reminders. In a dry run the planned reminders refer to `(planned-1)`. A failed reminder request after a created task is reported with the task id (exit 1), never retried silently.
- `ot schema`, help and `SKILL.md` list the flags; the skill file tells agents to prefer `--repeat`/`--remind` over `--natural`.

### D7. Known differences between the CLI and the web parser, stated in the docs

The CLI cannot read `user_prefs` (no REST collection, date-time-preferences D1), so `next week` uses Monday and numeric dates follow the language rather than the date-format preference. Both are documented in `docs/cli.md`; adding a `GET /api/v1/me/prefs` read is a separate change if anyone needs it.

## Risks / Trade-offs

- **[False positives on ordinary words: "every client", "remind Bob"]** → A recurrence match requires a unit, weekday, ordinal or collective word after the "every" word, and a reminder match requires an offset or a moment after the reminder word; otherwise the tokens stay literal. The vector file carries negative cases per language, and quotes and chip dismissal remain the escape hatch.
- **[Romance plurals and articles ("tous les lundis", "todos os dias")]** → The "every" word lists include the article forms, and plural stripping is confined to the recurrence grammar's weekday and unit lookups. Vectors per language.
- **[Two parsers drift]** → One vector file executed by both, one vocabulary file generated from one source, both checked in `make check`. A grammar change without a vector is caught by review; a vector change without the port is caught by CI.
- **[Offset arithmetic across DST]** → Offsets are computed on wall-clock minutes, so the stored offset is the same on every device; `relativeFireAt` turns it into an instant on each device as for every relative reminder today.
- **[A reminder op arrives before its task op on another device]** → The reminder watcher already ignores reminders whose task is unknown (`reminderTime.ts isDue`: `!!task`), and the server scheduler reads the task row too, so nothing fires until both ops are applied.
- **[`ot add --natural` and existing scripts]** → Opt-in flag; verbatim titles remain the default.
- **[Bundle growth]** → About 4–5 KB gzipped for vocabulary and grammars; no dependency. `ot` grows by roughly 150 KB; the server binary and the image are unchanged.

**Data model impact:** none. No field is added, renamed or retyped; the ops written are the existing `task` and `reminder` ops. `e2ee.ContentFields` is untouched (the rule is not user-written content; the reminder has none).

## Migration Plan

Nothing to migrate. Older clients show tasks created this way like any other task with a rule and reminders. Rollback is shipping the previous binary; captured tasks and reminders stay valid.

## Open Questions

- Should the recurrence chip later show a translated sentence ("jeden Montag") once `app-localization` lands? It changes only `chipText`, not the specs or the stored rule.
