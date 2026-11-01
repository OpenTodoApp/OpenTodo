# Routines: starter routines and "Describe it"

## Why

An empty editor is a hard start, and the step catalogue of `routines-engine` is large. People learn routines from examples: "Groceries from a note", "Sunday overdue sweep", "Friday digest". The owner decided (DECISIONS.md, "Routines", 2026-10-31) that routines start from the existing `templates/` library or from "Describe it", where the AI drafts the routine and the user edits it, hidden when no provider is configured. The library already has the right shape: sources in the repository, contributed by pull request, validated in CI, shipped offline with each release and published to the website (`template-library`).

## What Changes

- **Routine templates in the library.** `templates/routines/<slug>/routine.yaml` (English) with optional `<language>.yaml` translations: title, summary, description, category, icon, the trigger, optional condition and the steps in the engine's format, with **placeholders** (`ask: project`, `ask: label`, `ask: webhook`, `ask: time`, with a suggested name) the user fills before saving. Validated in CI like project templates (format, the shared step type checker, placeholders declared, no personal data, size) and tested by planning each starter against a fixture account through the engine's dry run.
- **Eight starters** in the first release: Groceries from a note, Sunday overdue sweep, Waiting follow-up, Friday digest by email, Morning focus, Inbox over 20, Monthly review project, Meeting notes to tasks.
- **Start from a starter:** "New routine" opens a chooser: **Start empty**, **From a starter** (the library's routine templates, searchable, offline, in the user's language), and **Describe it**. A starter opens in the editor with its placeholders as accent-coloured words to fill ("choose a project"); unavailable steps of a starter are marked as in any routine and the starter's card says what to set up. Nothing is saved until the user saves.
- **Describe it:** one sentence ("every Friday make tasks from my groceries note") goes to the assistant with the step catalogue (only available steps) and the names of the user's projects, labels, views and webhooks; the model answers with a routine draft through one tool, `draft_routine`; the server type-checks it and asks the model once more with the errors when it does not check; the draft opens in the editor with a banner "Drafted by AI: check each step, then Save". It **never saves, enables, tests or runs** anything by itself. It uses the assistant's provider, consent, monthly allowance and usage (one turn), and on encrypted accounts the on-device assistant. It is **hidden** when no provider is available to the user (no server provider, or no consent yet: the entry reads "Set up the assistant to describe a routine" in search only).
- Website: routine starters are published in the site bundle like project templates.
- Strings in the six languages.

Not **BREAKING**: additive library files and one assistant route; no op change; no new environment variable.

## Out of scope

- Fetch-URL and RSS steps in starters (AGENTS.md rule 5; the engine offers none).
- Sharing a user's own routine as a template, an online template gallery, importing routines from other automation tools.
- "Describe it" editing an existing routine ("add a step that…"); a later change.
- AI steps in starters (`routines-ai-step` adds starters that use them).

## Roadmap

Advances milestone **1.1 "Routines"**, item `routines-starters`, third of five. **Depends on** `routines-engine`, `routines-editor` and `routines-dynamic-data`. GitHub issue: [#660](https://github.com/OpenTodoApp/OpenTodo/issues/660).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `template-library`: ADDED "Routine templates", "Routine template validation", "Routine starters in the app".
- `routines` (new with `routines-engine`): ADDED "New routine chooser", "Describe a routine", "Describe it route".

## Impact

- **Repository:** `templates/routines/` (eight starters, README section), `scripts/templates-check.mjs` and `scripts/templates-build.mjs` (routine templates, the type check through the shared vectors' checker), the site bundle.
- **Server:** `internal/assistant` (the `draft_routine` tool and the route `POST /api/v1/assistant/routine-draft`), `internal/httpapi`, the starter planning test in `internal/rules`.
- **Web:** `web/src/app/routines/` (chooser, starter list and detail, placeholders, the Describe it sheet), the on-device assistant path for encrypted accounts, six catalogs.
- **Size:** no new dependency. The starters (about 12 KB of JSON before gzip) load with the chooser, never on first load; the chooser and Describe it sheet join the editor's lazy chunk (about 4 KB gzip).
