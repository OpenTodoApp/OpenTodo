# Design

## Context

- **Settings-like data** syncs through the op log (`user_prefs`).
- **The op schema** is declared once in `internal/sync/ops.go`, with `Content: true` for user text. The generated files carry the content fields to e2ee.
- **The disclosure** is versioned (`DisclosureVersion = 4`), and the "notice of the completed disclosure" mechanism tells existing users once.

## Decisions

### D1. A new entity, not a `user_prefs` field

`memory` rows (`id`, `text`, `position`, `created_at`, `deleted_at`) with personal scope, like labels. Per-item rows converge per field, so two devices editing different items never conflict. One big `user_prefs` text field was rejected: it would be last-writer-wins for the whole list.

This is additive in `Schema`. Run `UPDATE_OP_SCHEMA=1 go test ./internal/sync -run TestGeneratedOpSchema`. The Dexie table bumps the version, and the export includes it.

### D2. `remember` is in-app only

`remember` is defined in `internal/assistant` beside the display tools, not in the shared registry, so MCP never sees it. It plans a `memory` create into the draft, and the review describes it as "Remember: …". Apply uses `mutateMany` with device `assistant:<id>`.

### D3. Sending

`SystemPrompt` appends "The user's stated preferences (from Memory; follow them unless the user says otherwise):" followed by the items. The server reads plaintext rows; encrypted accounts never reach the server loop. The device loop reads decrypted rows from Dexie. The prompt vectors cover it.

### D4. Consent

`DisclosureVersion = 5`, and the field list gains "your saved memory". The existing one-time notice path tells version-4 consents once, as `assistant-disclosure-notice` did.

## Data model, size, memory

- **Data:** one new entity, additive; no renamed fields.
- **Size:** the Settings section is lazy with the assistant settings.
- **Prompt:** at most 20 × 200 characters, under about 1k tokens.

## Interface budget

Settings gains one section inside the existing assistant card, with no new sidebar entry, shortcut or chrome above lists.

## Risks / Trade-offs

- **Prompt injection through a memory item.** Items are confirmed by the user before they exist. The model is told to propose only facts the user stated. Proposals from untrusted text follow the existing rules.
