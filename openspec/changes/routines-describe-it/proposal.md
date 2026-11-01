# Routines: "Describe it"

## Why

Starter routines (`routines-starters`) give people examples to start from. Some routines are easier to say than to build: "every Friday at five, make tasks in Errands from my Groceries note". The owner decided (DECISIONS.md, "Routines", 2026-10-31) that a routine can also start from **Describe it**: the AI drafts the routine from one sentence and the user edits it; the entry is hidden when no assistant provider is available. This was planned inside `routines-starters`. It moved into its own change on 2026-11-01 so the starters could ship first, because it needs its own assistant route, limits and an on-device path for encrypted accounts.

## What Changes

- **Describe it:** one sentence goes to the assistant with the step catalogue (only available steps) and the names of the user's projects, labels, views and webhooks; the model answers with a routine draft through one tool, `draft_routine`; the server type-checks it and asks the model once more with the errors when it does not check; the draft opens in the editor with a banner "Drafted by AI: check each step, then Save". It **never saves, enables, tests or runs** anything by itself. It uses the assistant's provider, consent, monthly allowance and usage (one turn), and on encrypted accounts the on-device assistant.
- **Where it appears:** a "Describe it" entry on the Routines page next to "New routine" and "Start from a starter", shown only when the user can make an assistant turn; otherwise absent, with "Set up the assistant to describe a routine" when searched for in the palette.
- Strings in the six languages.

Not **BREAKING**: one assistant route; no op change; no new environment variable.

## Out of scope

- "Describe it" editing an existing routine ("add a step that…"); a later change.
- AI steps in the drafts beyond what the catalogue offers (`routines-ai-step`).

## Roadmap

Advances milestone **1.1 "Routines"**, item `routines-describe-it`. **Depends on** `routines-engine`, `routines-editor`, `routines-dynamic-data` and `routines-starters` (the Routines page entries). Split from `routines-starters` (GitHub issue #660). GitHub issue: [#735](https://github.com/OpenTodoApp/OpenTodo/issues/735).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `routines`: ADDED "Describe a routine", "Describe it route".

## Impact

- **Server:** `internal/assistant` (the `draft_routine` tool and the route `POST /api/v1/assistant/routine-draft`), `internal/httpapi`.
- **Web:** `web/src/app/routines/` (the Describe it entry and sheet, the draft banner), the on-device assistant path for encrypted accounts, six catalogs.
- **Size:** no new dependency; the sheet joins the routines lazy chunk (about 3 KB gzip).
