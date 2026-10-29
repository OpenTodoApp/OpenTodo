# Proposal

## Why

Households use a task app for the same short lists every week: groceries, the pharmacy, packing for the cabin. Any.do's most praised everyday feature is its Smart Grocery List, which keeps items in supermarket aisles and lets a family share one list (research §1 "Any.do"; §4 P4.3 "Household Grocery Mode"). OpenTodo already targets households ("share lists with the people you live and work with", the fridge display mode), and a project can already be reused by turning on "Show completed tasks" and unticking items. That workaround has three gaps:

- Typing "Milk" in quick add creates a second "Milk" next to the ticked one, so the list fills with duplicates.
- "Show completed tasks" is a preference of each device, never synced, so the partner's phone hides the ticked items.
- New items land in "No section", so the list is not in store order.

## What Changes

- **A synced project setting, "Reusable list".** It's in the project's Edit dialog under a "List" heading, off by default, and stored on the project as the additive op field `reusable`. Every member sees the same mode.
- **Adding an existing item reopens it.** In a reusable list, adding a task whose title matches an item already in the project (ignoring case, accents, surrounding spaces and repeated spaces) does not create a task:
  - a completed match is reopened in place, keeping its section, notes and labels;
  - an open match is left as is.
  
  Quick add shows "Milk is back on the list" or "Milk is already on the list" for 4 seconds, with an Add anyway action that creates the new task. Matching is the same in Go and TypeScript, pinned by shared vectors.
- **Ticked items always show.** A reusable list always ends with its completed group, called "Got it", whatever the device's "Show completed tasks" preference. Unticking an item there (or adding it again) brings it back.
- **Duplicates converge.** Two offline devices that both add "Eggs" create two tasks. When a device that can edit the project sees two open items with the same normalized title, both created without notes, subtasks, comments, attachments or reminders, it tombstones the one with the greater id. Every device picks the same item, so the result converges.
- **Optional aisle sections.** A second switch, "Sort into aisles" (op field `aisles`), offers to create a standard set of sections in the app's language: Produce, Bakery, Dairy and eggs, Meat and fish, Frozen, Pantry, Drinks, Household, Personal care. Each section remembers its aisle as a fixed key (the additive section field `aisle`, e.g. `dairy`). Their names can be edited, deleted and reordered like any section, and the key keeps working after a rename and for members using another language.
  - A new item (one with no match) whose words match a bundled vocabulary for the app's language lands in the live section carrying that aisle key, if there is one.
  - A reopened item keeps the section it was in, so moving "Oat milk" to Dairy once teaches the list for good.
- **API, CLI and MCP.**
  - `POST /api/v1/tasks` accepts an optional `reuse: true`. In a reusable project the server applies the same matching. It answers `200` with the reopened or open task and `"reused": "reopened" | "open"`, or `201` as today when nothing matched.
  - `ot add` and the MCP `create_tasks` tool send `reuse: true` when the target project is reusable.
  - The project's `reusable` and `aisles` fields are readable and writable wherever project fields are.

No new environment variable, no new dependency, no new route. The op schema gains two additive project fields and one additive section field. Not **BREAKING**.

## Out of scope

- Quantities and units ("2 × milk"): the title or the notes carry them.
- Learning aisles across projects or accounts, or any network or AI categorisation. The vocabulary is bundled and offline.
- Fuzzy matching ("Mlik" → "Milk"). Only normalized-equal titles match, so the wrong item is never reopened.
- Reusing items in the board and timeline layouts beyond what they already do. The board still shows open tasks only.
- A grocery template in the template library. A later change can add one with both switches on.
- Matching on the server for an account with end-to-end encryption, where titles are ciphertext. It degrades as described below.

## Roadmap

Advances ROADMAP-1.0 milestone 0.21 "Horizons and home", item `reusable-lists` (research P4.3 "Household Grocery Mode"). No linked issue.

## Capabilities

### New Capabilities

- `reusable-lists`: the reusable mode, matching and reopening, duplicate collapse, aisle sections and the vocabulary, the API `reuse` flag.

### Modified Capabilities

- `project-organization`: "Project fields" gains `reusable` and `aisles`.
- `sections-and-boards`: "Section entity" gains the optional `aisle` key.
- `task-list-presentation`: "Completed group in a project" is always shown, as "Got it", in a reusable list.

## Impact

- **Data model and sync:** two additive project fields, `reusable` (bool, default `false`) and `aisles` (bool, default `false`), in `internal/sync/ops.go` `Schema`, which generates the web types and defaults. They are not content fields, so they stay plaintext. Plus one additive section field, `aisle` (nullable string from a closed list of nine keys; an unknown key reads as none). No new entity and no migration.
- **E2EE:** titles stay encrypted. The device matches on decrypted titles. For an encrypted account the server can't match (`reuse: true` creates a new task, and the response says `"reused": "unavailable"`); the device's duplicate collapse then merges the item if it qualifies.
- **API/CLI/MCP:** the optional `reuse` body field on task creation, plus project fields in the REST, CLI (`ot project edit --reusable --aisles`) and MCP project views.
- **CalDAV and vault:** no mapping. Reopening is an ordinary `completed_at: null` write, served as `STATUS:NEEDS-ACTION`.
- **Bundle size:** the aisle vocabulary is about 250 words per language, under 6 KB gzip for all six. It's a lazy chunk, loaded only in a project with `aisles` on, so the entry chunk doesn't change. The binary grows by a few KB for the Go matcher.
