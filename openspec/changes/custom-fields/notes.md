# Implementation notes

## Status (2026-10-16)

Everything is done: 4.2, 5.1–5.7 and 6.1 followed once ux-overhaul's groups 1–4 merged. `make check` passes (6.2).

## Screens: decisions and deviations

- **Columns are labelled cells, not `role="table"`.** A list row is an `li` that carries drag, the cursor, selection and its own controls; turning the list into an ARIA table would take away list semantics that the keyboard model and the existing tests rely on. Each cell starts with its field name for screen readers ("Cost: 120"; an empty cell reads "Cost: empty"), and the visual header is `aria-hidden`. Keyboard handling is unchanged (`j`/`k`, Enter).
- **The columns header is not sticky.** When the fields don't fit, the columns sit in a `data-scroll-x` frame (like the board), with a title column of at least 14rem and 7rem per field. A sticky header can't stick to the page's scroll from inside a sideways scroller. The header scrolls with the list instead. With five fields at 768 px and the sidebar open, the list scrolls sideways.
- **Reordering in the dialog** uses up and down buttons plus <kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> (<kbd>Shift</kbd> moves to the top or bottom), not drag. With at most 30 rows, the buttons are the accessible equivalent, and the dialog has no drag layer to reuse.
- **Field names in the Filter view.** The Filter view has no autocomplete to extend, so its usage hint lists the field terms and the names you have, and a type error (for example `client > "A"`) shows under the input like a syntax error.
- **The choice editor** is the shared `Combobox`, with **Clear** pinned first. A stored value that is no longer an option stays listed so it can be seen. A value that doesn't match its field's type shows "(not a number)", "(not a date)" and so on beside the editor, linked by `aria-describedby`, and the editor stays usable to fix it.
- **The server's query check knows field terms too.** `internal/filter`, the Go port that validates saved-view queries on REST writes, accepts `name cmp value`, `"quoted name" cmp value` and `no name` with the TypeScript parser's rules and messages. Both test suites share the accept and reject cases. Without this, a REST-created view such as `cost > 100` would have been refused. Field terms also accept `before` / `after` like the date terms.
- **4.2** is tested in `lib/assistant.test.ts` (where `describe` lives), not `changeSetReview.test.tsx`: "Cost → 120", "Client cleared", "Paid checked", and the id when the definition isn't on the device.
- **Fixes the layout check found:** long badge values (a link) now truncate. History values wrap anywhere, because a long quote URL pushed the history tab sideways. The project header's action row now wraps instead of pushing the page sideways at 768 px once Columns joins the layout switch. `scripts/e2e-layout.mjs` seeds five fields on the renovation project, checks the **Columns** screen from 768 px (screens can now carry `minWidth`) and opens the Fields dialog as an overlay.

## Smoke test (6.1, 2026-10-16)

Ran on two throwaway servers with `scratchpad/pw/fields-smoke.mjs` (Chromium, two browser profiles):

- Bob, an editor in Ada's shared Kitchen project, defined Cost (number), Client (choice: Acme, Globex) and Quote (link) in the dialog. A duplicate "cost" was refused.
- Both profiles went offline. Ada set Cost 120 and Bob set Client Acme. After going online, the server and both devices held both values.
- Both went offline again and set Cost (200, then 300). After going online, both devices showed 300.
- `PATCH /api/v1/tasks/{id}` with Quote and Cost values was applied. A type mismatch ("lots" for Cost) got 400.
- At 1280 px (light) and 768 px (dark), the list showed badges and Columns was offered (six cells for two tasks). At 390 px there were badges and no Columns option. The board cards showed the badges.
- In the Filter view, `cost > 100` returned Oven and `no client` returned Sink.
- Exported, then imported into a fresh account on a second server. The definitions (Client/choice, Cost/number, Quote/link) and every task's values matched.

## Decisions taken while implementing (data layer)

First round (2026-10-15), done on `feat/custom-fields`: 1.1–1.6 (the `field` entity and the `fields.<id>` family, scopes, trash, occurrence records, encryption, activity fixture, sync docs), 2.1–2.4 (client types, fold and unfold in `ops.ts`, Dexie v18 `fields` table, `copyOf`, `lib/fields.ts`), 3.1–3.4 (REST folding and validation, `/api/v1/fields`, export, own-export import with undo, API and import docs) and 4.1 and 4.3 (assistant tools and their docs). `make check` passes.

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
