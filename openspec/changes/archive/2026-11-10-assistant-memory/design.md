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

## Implementation notes

- **Version 6, not 5.** `assistant-time-blocks` took disclosure version 5, so memory is `DisclosureVersion = 6` (`MemoryDisclosureVersion`). `MinDisclosureVersion` stays 1: as D4 and the spec say, earlier consents still count and are told once. `GET /api/v1/me/assistant` adds `memory_notice` beside `disclosure_notice` (whose meaning, the complete list, is unchanged for older apps); Got it records version 6 and closes both. The list gains "your memory items, with every message".
- **Text.** `memory.text` has its own kind (`memory_text`): one line of 1 to 200 characters after trimming, or ciphertext. Memory ids are unique on the server like objectives (`uniqueIDs`).
- **remember.** `PlanRemember` collapses whitespace, refuses an empty, longer or ciphertext-looking text (`invalid_arguments`), a duplicate of a live item or one already in the draft ignoring case (`already_remembered`) and a 21st item (`memory_full`). It is offered in turns without a skill; a skill's turn sends the items but has no `remember`. The device twin (`assistantDevice/memory.ts`) is pinned by `memory.vectors.json`; the manifest carries the note, limits, messages and tool under `memory`.
- **Open proposals.** New memory items of an open proposal are checked in `internal/assistant` (new, an unused id, only `text`, `position` and `created_at`, values the op schema accepts, no ciphertext), not by the registry, and follow the registry's items in the draft.
- **Sending.** The server reads the live rows in order (position, then id) and leaves out ciphertext; the device leaves out rows it could not decrypt. Each item is collapsed to one line and cut to 200 characters, at most 20 are sent. The section follows the view and selection and precedes a skill.
- **Review and limits.** The review reads "Remember: …". With Memory full, new items past the room are left out of the review with a note; Settings refuses the 21st with "Memory holds 20 items. Remove one first."
- **Export.** `memory` is in the export for a session and `full` or `admin` tokens only; read and agent tokens, which MCP clients and other agents hold, get an export without it. An import of an own export restores items with their ids and tombstones.
- **Settings.** The Memory group follows "For you" in the assistant card while the assistant is available, or while items are kept (so they can still be removed). It is part of the assistant settings chunk.
