# Proposal

## Why

Quick add today takes a plain title and inherits a date or project from the current view. Anyone who has used a commercial task app expects to type one line like `Meeting with Sarah next Wed at 3pm #work @call p1 +30m` and get a scheduled, filed, prioritised task. Without it, every capture needs the detail panel afterwards, which is the single biggest friction point for keyboard-first users and the most requested roadmap item. The parser must be deterministic, work fully offline and understand more than English, because the client is the source of truth and users are not all English speakers.

## What Changes

- Quick add gains a deterministic natural-language parser that runs entirely in the client and recognises, in one line: due date and time phrases ("tomorrow", "next Wed", "in 3 days", "12/11", "at 3pm", "15:30"), project tokens (`#work`), label tokens (`@call`), priority tokens (`p1`–`p4`) and duration tokens (`+30m`, `+1h30`).
- Date and time vocabulary ships for English, German, French, Italian, Spanish and Portuguese, bundled with the app so it works offline; the active languages follow the browser's language list with English always included.
- Live preview: as the user types, every recognised token is shown as a chip under the input and removed from the title preview; the user can dismiss any chip to keep that text literally in the title, or quote text to protect it from parsing.
- Explicit tokens take precedence over view defaults; parsing can be switched off per device in Settings, restoring today's plain quick add.
- A new additive task field `estimate_minutes` (positive integer or null) stores parsed durations, is validated and synced like every other field, and is shown as a chip on the task row. The time-blocking change will build its calendar grid on this field.

Out of scope: natural-language parsing on the server or in the REST API and CLI (the parser is a client module; a server port may follow), recurrence phrases ("every Monday" is `recurring-tasks`), reminders ("remind me" is `reminders`), a labels management UI (`labels`), a calendar grid for estimates (`time-blocking`), creating a project from an unknown `#token`, and locale-aware date *display* beyond what exists.

This change advances ROADMAP.md section 2, "Natural-language quick add, multi-language" (`nlp-quick-add`), and lays the field that section 4 "Duration estimates and time-blocking" (`time-blocking`) needs.

No new mandatory environment variables. The op log change is additive only (one new task field); not **BREAKING**.

## Capabilities

### New Capabilities
- `natural-language-capture`: the grammar quick add understands, how dates and times resolve, multi-language vocabulary, live preview chips, dismissing and escaping tokens, determinism and offline behaviour, and the per-device opt-out.

### Modified Capabilities
- `task-management`: the "Quick capture" requirement is extended so the quick-add line is parsed and explicit tokens override view defaults; a "Duration estimate" requirement adds the `estimate_minutes` field.

## Impact

- Client: new `web/src/lib/nlp/` module (tokenizer, date and time grammar, per-language vocabularies, resolver), `QuickAdd` renders chips and calls the parser, `TaskRow` shows the estimate, Settings gains the parsing toggle. Expected bundle growth about 6–8 KB gzipped; no new runtime dependency.
- Server: `estimate_minutes` added to the op schema (`internal/sync/ops.go`), accepted by the REST collection endpoints and present in the export. No new routes, no migration (fields are rows in the existing `fields` table).
- Docs: `docs/api.md` task field table, `docs/sync.md` schema table, a new `docs/quick-add.md` syntax reference, README feature list.
