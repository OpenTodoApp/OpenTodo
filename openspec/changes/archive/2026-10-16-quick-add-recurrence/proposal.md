# Proposal

## Why

Quick add understands dates, times, projects, labels, priorities and estimates in six languages, but not the two attributes people set most often right after capturing a task: a repeat rule and a reminder. `docs/quick-add.md` says so under "Not understood", and `docs/recurring-and-reminders.md` tells the user to add the task first, then open it and set **Repeat**. GitHub issue pixari/opentodo#6 asks for exactly this, and the roadmap calls it "the only quick-add gap people hit daily". Everything needed already exists: the recurrence grammar and its canonical form (`web/src/lib/recurrence.ts`, `internal/recurrence`), the reminder entity and `addReminder` (`web/src/lib/reminders.ts:15`), and a parser whose chips, dismissal and quoting are generic over attribute kinds (`web/src/lib/nlp/parse.ts`).

## What Changes

- **Recurrence phrases in the quick-add line.** `every Monday`, `every 3 days after completion`, `every 2nd Tuesday until 31 Dec`, `jeden Montag`, `tous les lundis`, `ogni 3 giorni`, `cada semana`, `todos os dias`, and one-word forms such as `daily` / `täglich` / `weekly`, in the six quick-add languages. The phrase is translated to the canonical English rule of `docs/recurrence.md` (`every monday`, `every 3 days after completion`), which is what gets stored; the stored grammar does not change. A line with a rule and no date gets the rule's first occurrence as its due date, as the Repeat field does today (`web/src/lib/ops.ts:499-517`). A date or time in the line is kept as the series' start and time.
- **Reminder phrases.** `remind me at 9`, `remind me 30 min before`, `remind me 1 day before`, `remind me tomorrow at 9`, `erinnere mich um 9`, `rappelle-moi 30 min avant`, and so on. A line may carry several. When the task has a due date the reminder is **relative** to it (`remind me at 9` on a task due at 15:00 is "6 hours before"), so it follows the date when the task is rescheduled and carries over on recurring tasks; a `before`/`after` offset is always relative. Without a due date, `remind me at 9` is an **absolute** reminder at that moment (today, or tomorrow if 09:00 has passed), as the detail panel allows on undated tasks.
- **Chips for both.** A recurrence chip that shows the rule in words and, when no date was typed, the first date; one reminder chip per reminder ("30 min before", "Tue 3 Nov, 09:00" in the user's formats). Dismissing a chip, Backspace twice at the end of the line, and double quotes work for the new chips exactly as for the existing ones.
- **One batch.** The task and its reminders are written in one local operation set (one transaction, one render), so an offline capture never produces a task without its reminders or the reverse. Every consumer of quick add gets this: the task views, the section inline add, the share-capture screen.
- **The same grammar in `ot add`.** `ot add --natural "<line>"` parses the line with a Go port of the quick-add grammar (`internal/quickadd`) that is tested against the same vector file as the web parser, and creates the task plus its reminders through the REST API. `ot add --repeat <rule>` and `--remind <phrase>` (repeatable) set the two attributes explicitly for scripts and agents; `ot edit --repeat <rule|none>` changes or clears a rule. Dry run shows the planned `POST /tasks` and `POST /reminders` requests.
- **Shared vocabulary file.** The six vocabularies gain the words for recurrence and reminders (and a `minute` unit). The Go port reads a generated copy of the vocabularies (`internal/quickadd/vocab.json`, written from `web/src/lib/nlp/vocab/*.ts` by a script and checked by a test), so there is one source of truth for the words. The `named-importers` change (design D7) planned to extract the same vocabularies for its Todoist date parser; it can read this file instead of making a second one.

Out of scope:
- Changing the stored rule grammar or its canonical form (`recurring-tasks` keeps "case-insensitive English"; quick add translates into it).
- Parsing recurrence or reminders anywhere the line is not parsed today: the Vim `:new` command (title only), the in-app assistant's `create_tasks` tool (it already accepts a canonical `recurrence`; natural phrases could go through `internal/quickadd` later), the REST API (no parse route is added), email to task and the browser extension.
- Rewiring the importers' spelling table (`internal/importer/schedule.go:36-46`) onto the new parser. It stays as it is; `named-importers` may use the shared vocabulary.
- Editing existing reminders from the quick-add line, `ot edit --remind`, and reminder phrases that name no offset or moment (`remind me` alone stays literal).
- Hourly rules, which the recurrence grammar does not have.

ROADMAP: this advances row 15 of "Next: Parity and depth", "Quick add for recurrence and reminders" (`quick-add-recurrence`), and closes issue #6. Refinement of the roadmap notes: the chip shows the canonical rule rather than a translated sentence, because the stored rule and the Repeat field are English today (`docs/recurring-and-reminders.md`: "Rules are in English, whichever language you use for dates in quick add"); and the CLI gets the grammar behind an explicit `--natural` flag, so existing scripts that pass titles verbatim keep working.

Nothing here is **BREAKING**. No op field is added, renamed or removed; the reminder and task ops written are the same ones the detail panel writes today. No environment variable is added. `ot add` without the new flags behaves as before.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities
- `natural-language-capture`: adds recurrence and reminder phrases (six languages), the rule they are stored in, how reminders are resolved against the due date, new chip kinds, and the task-plus-reminders batch to "Live preview chips", "Multi-language vocabulary" and "Deterministic and offline parsing".
- `reminders`: adds "Reminders created with their task": a reminder may be written in the same operation set as a new task, with its firing time computed from the due date in that set.
- `cli-client`: "Add and edit tasks" gains `--repeat` and `--remind`; a new requirement covers `ot add --natural`, which must give the same result as the web parser for the shared vectors and create the task and its reminders with the documented requests.

## Impact

- **Web:**
  - `web/src/lib/nlp/`: `vocab/types.ts` and the six vocabularies (recurrence words, reminder words, ordinals, `minute` unit), a new `recurrence.ts` and `reminders.ts` phrase grammar beside `dates.ts`, `parse.ts` (two chip kinds, `recurrence` and `reminders` in `ParseResult`), `quickadd.ts` (`QuickAddInput.recurrence`, `.reminders`), a shared vector file `quickadd.vectors.json`, tests.
  - `web/src/lib/ops.ts` `createTask`: accepts reminders and writes them with the task through `mutateMany`.
  - `web/src/app/QuickAdd.tsx`: chip text and hue for the two kinds; `web/src/lib/shortcuts.ts` `QUICK_ADD_SYNTAX` (one new row, regenerated into `docs/keyboard.md`).
  - No settings change: the per-device parsing toggle covers the new phrases.
- **CLI and Go:** new package `internal/quickadd` (tokenizer, vocabularies, date, time, attribute, recurrence and reminder grammars; no dependencies beyond the standard library and `internal/recurrence`), used only by `cmd/ot`. `internal/cli`: flags `--natural`, `--repeat`, `--remind`, `--lang`; the command table, `ot schema` golden file, `SKILL.md`, dry-run planning for the reminder requests.
- **Server:** unchanged. The task and reminder ops are validated as today (`internal/sync/ops.go:163`, `:222-231`); `POST /api/v1/reminders` exists (`docs/api.md:554-567`).
- **Docs:** `docs/quick-add.md` (new sections, the "Not understood" paragraph), `docs/recurring-and-reminders.md`, `docs/reminders.md`, `docs/cli.md`, the regenerated keyboard guide and help bundle, `CHANGELOG.md`.
- **Size:** no new dependency. Web bundle about 4–5 KB gzipped more (vocabulary and two grammars). The `ot` binary grows by roughly 150 KB for the Go port; the server binary and image do not change, since the server does not import `internal/quickadd`. Runtime memory is unchanged.
