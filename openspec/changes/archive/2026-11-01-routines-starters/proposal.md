# Routines: starter routines

## Why

An empty editor is a hard start, and the step catalogue of `routines-engine` is large. People learn routines from examples: "Groceries from a note", "Sunday overdue sweep", "Friday digest". The owner decided (DECISIONS.md, "Routines", 2026-10-31) that routines start from the existing `templates/` library. The library already has the right shape: sources in the repository, contributed by pull request, validated in CI, shipped offline with each release and published to the website (`template-library`).

`routines-dynamic-data` then set the rule every starter follows (DECISIONS.md, "Routines are dynamic, not static"): data flows from the trigger, from earlier steps and from a loop's item; a starter never holds a task chosen by hand; fixed references are only containers (a project, a label). Its use-case matrix (33 rows, `web/src/lib/rules/usecases.json`) is where the starters come from. And "Routines UX: selectors not modals": choosing values happens in pages and next to the word, never in a centred modal.

## What Changes

- **Routine templates in the library.** `templates/routines/<slug>/routine.yaml` (English) with optional `<language>.yaml` translations: title, summary, description, category, icon, the trigger, optional condition and the steps in the engine's format, with **choices** (`{ask: <name>}` in place of a project or label id, declared with a suggested name) the user makes before the routine opens in the editor, and a **test** (seeded tasks, projects and labels, the choices filled, the writes expected). Validated in CI like project templates (format, choices declared and used, known step kinds, no task chosen by hand, translations keep the values a text inserts, no personal data, size).
- **Every starter is a tested routine.** `internal/rules` runs every starter through a real run against its seeded data and compares the writes exactly; the TypeScript checker type-checks every starter with its choices filled, so the device and the server agree each one is valid.
- **Eleven starters** drawn from the use-case matrix: Groceries from a note, Sunday overdue sweep, Evening roll-over, Morning focus, Done journal, Note to subtasks, Waiting follow-up, Friday digest by email, Meeting notes to tasks, Inbox over 20, Monthly review.
- **On the Routines page:** a "Start from a starter" entry beside "New routine", and the starters listed under the empty state. The starters page lists them by category with a search in the user's language and English; a starter's page shows its description, its steps as sentences, what it needs with the current availability, and its choices as inline pickers ("Create *Groceries*" first when no such project exists). **Use this starter** opens the editor on an unsaved routine. No centred modal anywhere.
- Website: routine starters are published in the site bundle like project templates.
- Strings in the six languages.

Not **BREAKING**: additive library files; no op change; no new route; no new environment variable.

## Out of scope

- **"Describe it"** (the AI drafts a routine from a sentence): moved to its own change, `routines-describe-it`, on 2026-11-01, because it needs an assistant route, limits and an on-device path of its own.
- Fetch-URL and RSS steps in starters (AGENTS.md rule 5; the engine offers none).
- Sharing a user's own routine as a template, an online template gallery, importing routines from other automation tools.
- AI steps in starters (`routines-ai-step` may add starters that use them).
- Choices other than a project or a label (times, numbers and texts are edited in the editor like in any routine).

## Roadmap

Advances milestone **1.1 "Routines"**, item `routines-starters`. **Depends on** `routines-engine`, `routines-editor` and `routines-dynamic-data` (all shipped). GitHub issue: [#660](https://github.com/OpenTodoApp/OpenTodo/issues/660) (its "Describe it" half moves to `routines-describe-it`).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `template-library`: ADDED "Routine templates", "Routine template validation", "Routine starters in the app".

## Impact

- **Repository:** `templates/routines/` (eleven starters, README section), `scripts/routine-templates.mjs` (check and compile), `scripts/templates-check.mjs`, `scripts/templates-build.mjs` and `scripts/site-bundle.mjs` (wiring), `web/src/generated/routineStarters.json`, `internal/rules/testdata/starters.json`.
- **Server:** none at run time; the starter test in `internal/rules`.
- **Web:** `web/src/lib/rules/starters.ts`, `web/src/app/routines/` (the starters page, a starter's page, the entries on the Routines page), the route `/routines/starters[/<slug>]`, six catalogs.
- **Size:** no new dependency. The starters (about 25 KB of JSON before gzip, all languages) load with the starters list, never on first load.
