# Implementation notes

## Status (2026-10-15)

Done on `feat/custom-fields`: 1.1–1.6 (the `field` entity and the `fields.<id>` family, scopes, trash, occurrence records, encryption, activity fixture, sync docs), 2.1–2.4 (client types, fold and unfold in `ops.ts`, Dexie v18 `fields` table, `copyOf`, `lib/fields.ts`), 3.1–3.4 (REST folding and validation, `/api/v1/fields`, export, own-export import with undo, API and import docs) and 4.1 and 4.3 (assistant tools and their docs). `make check` passes.

Held until the ux-overhaul PRs (through its group 4) merge: 4.2 (change-set review labels), 5.1–5.7 (dialog, panel group, badges, columns layout, filter terms, history labels, user docs) and 6.1 (smoke test).

## Decisions taken while implementing

- **Value checks live in `internal/sync/fieldvalues.go`** (`CheckFieldValue`, `FieldOptions`), not in `Validate`: the REST layer and the tools share them, and the op path still accepts any scalar so a value and its definition may arrive in any order (design D2).
- **REST reads fold in `annotateProjects`**, the hook every task-returning REST path already passes (list, get, write responses, idempotent replays, agent writes, export), so no path can leak `fields.<id>` keys.
- **Tool argument shape.** Strict tool schemas (checked by `TestDefinitionsUseStrictSubset`) allow no free-form object keys and no multi-type values, so `create_tasks` and `update_tasks` take `fields` as a list of `{id, value}` with the value as text, converted by the field's type (`"120"` to a number, `"true"` to a boolean). The agent REST route keeps the REST object form. The spec delta and design D6 were updated to match.
- **Definition options are untrusted text** in tool results (`untrusted_text.options`), next to the name.
- **Encrypted accounts.** A tool call setting a text, date, choice or link value in the personal scope is refused with `encryption_enabled`, like titles; numbers and checkboxes are plaintext by design. REST and type checks accept a ciphertext string as is (the device checked it), and skip name uniqueness and option checks when those are ciphertext.
- **Tool results show only live fields of the task's current project**, matching the app's display rule; the export and REST keep every value.
- **The client text limit is 2,000 characters** (was 1,000 in `lib/fields.ts`), matching the spec; links are capped at 2,000 too.
- A REST PATCH validates `fields` against the project after the write, so moving a task and setting the new project's values works in one request. For agent tokens the REST route runs `update_tasks` before `move_tasks`, so such a combined request validates against the old project; send two requests there.

## Overlaps

- Migrations: none. Dexie: v18 (after calendar-feeds v17); stats-and-review, which planned v18, takes the next free number when it merges.
