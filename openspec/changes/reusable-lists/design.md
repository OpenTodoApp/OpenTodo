# Design

## Context

- A project's tasks are rows in the op log. Completing a task writes `completed_at` (and `completed_by`); reopening writes `completed_at: null`.
- `task-list-presentation` "Completed group in a project" already shows ticked items at the end of a list. Its switch is a per-device preference, by design, because most projects don't want it.
- Sections are op-log entities in their project's scope.
- The web quick add creates a task through `mutate()`. The server creates tasks through `ApplyStrict` from REST, the CLI (which calls REST), MCP write tools, email capture and imports.
- Titles are content fields: for an account with end-to-end encryption the server holds ciphertext only.

## Decisions

**D1. Two project fields and one section field, all additive and plaintext.**

| Entity | Field | Kind | Default | Meaning |
|---|---|---|---|---|
| project | `reusable` | bool | `false` | the reusable-list mode |
| project | `aisles` | bool | `false` | new items are sorted into aisle sections; read as `false` while `reusable` is `false` |
| section | `aisle` | nullable string | `null` | one of `produce`, `bakery`, `dairy`, `meat`, `frozen`, `pantry`, `drinks`, `household`, `personal`; any other value reads as `null` on clients, and the REST API refuses it with 400 `invalid_aisle` |

- They are declared once in `internal/sync/ops.go` `Schema`, which generates `web/src/generated/opSchema.ts`.
- They are flags and fixed keys, not user text, so they are not content fields. The section's name stays the encrypted, user-visible text.
- On a shared project, editors and above can write them, like other project fields (`CanWrite`). Viewers see the mode but can't change it.
- Alternative: a single `list_mode` string. Rejected: two booleans read more clearly in the API and the Edit dialog, and per-field LWW lets one member turn aisles on while another renames the project, with no conflict.
- Alternative: keep "Show completed tasks" per device and add a separate synced copy. Rejected: the reusable mode is what households mean; the device preference stays for ordinary projects.

**D2. Normalized-equal matching, in Go and TypeScript, pinned by shared vectors.**

`normalizeTitle(s)` does the following, in order:
1. Unicode NFKD.
2. Drop combining marks.
3. Lower-case with the root locale.
4. Trim.
5. Collapse runs of white space to one space.
6. Strip one trailing `.`.

A title matches an item when both normalize to the same non-empty string. The candidates are the project's live tasks with no `parent_id` (subtasks never match), recurring or not.

- A completed match wins over an open match only when no open match exists.
- Among several completed matches, the most recently completed wins; ties go to the smaller id.

Files:
- TypeScript: `web/src/lib/reusable.ts`.
- Go: `internal/reuse`, a leaf package used by REST and the agent tools.
- Shared vectors: `web/src/lib/reusable.vectors.json`, covering accents (`Café` = `cafe`), German `ß` (stays `ß`: no full case folding, documented), Turkish dotted I (root locale), emoji, spaces and subtasks.

Alternatives rejected:
- **Fuzzy or edit-distance matching.** It reopens the wrong item ("Milk" vs "Silk tie"), and the vectors would be fragile.
- **Deterministic task ids derived from the title.** Two devices adding "Eggs" offline would then converge without a merge, but the id would leak a hash of an encrypted title to the server, and it would collide with tombstoned items (`project-sharing` "An entity id names one entity on the server").

**D3. Quick add in a reusable list.**

When quick add's target project (the current project, or a `#project` token) is reusable, the client computes the match before creating anything:

| Match | Write | Toast (4 s, live region) |
|---|---|---|
| completed | one batch on that task: `completed_at: null`, `completed_by: null`; the parsed tokens (due, labels, priority) are applied to it as edits | "Milk is back on the list" · Add anyway |
| open | nothing; the row is scrolled into view and flashes once | "Milk is already on the list" · Add anyway |
| none | the normal create, with D5's section | none |

- Add anyway creates the task exactly as quick add would without this feature.
- Undo of a reopen re-completes the task with its previous `completed_at`.
- Paste of several lines (`paste-to-tasks`, if present) applies the same rule to each line, and the summary toast counts reopened, already open and new items.
- Viewers can't add, so nothing changes for them.

**D4. Duplicate collapse.** A device collapses two items when all of these hold:
- the project is reusable;
- the device's role allows editing;
- two or more live, open, top-level tasks of the project have the same normalized title;
- none of them has notes, subtasks, comments, attachments, reminders, time entries or a recurrence rule.

It writes `deleted_at` on every such task except the one with the smallest id. It runs after a sync pull and after a local write, debounced 2 s.

- Every device with the same data picks the same survivor, and a tombstone written twice converges, so no coordination is needed.
- The activity log shows it as an ordinary deletion by that device, labelled "Merged a duplicate", and the item is restorable from the Trash.
- An item with anything attached is never removed. Both items stay, and the user decides.
- The server does not run the collapse: it would need plaintext titles, which an encrypted account doesn't give it.
- A collapse never runs on a device whose role is viewer, so a viewer's queue never holds a refused deletion.
- Alternative: merge into one item and move the loser's labels. Rejected: grocery duplicates carry nothing worth merging, and items that do carry something are never collapsed.

**D5. Aisle sections and vocabulary.**

- Turning on "Sort into aisles" in the Edit dialog asks once: "Add aisle sections?". Create adds the nine sections that are missing (by `aisle` key), named in the app's language, in store order after the existing sections, each with its catalogue icon. Not now leaves the sections alone.
- A new item is sorted as follows:
  1. Quick add tokenizes the normalized title into words.
  2. It looks up each word, then each two-word sequence, in `web/src/lib/aisles/<lang>.json` (word → aisle key) for the app language, and falls back to English.
  3. The longest match wins; ties go to the first word.
  4. The item is placed in the first live section of the project with that key (by position). With no section of that key, or no match, the item goes where quick add would put it (the current section, or "No section").
  5. A `/section` token or an explicit section always wins.
- A reopened item is never moved, so the user's own placement is remembered by the item itself.
- The vocabulary is one JSON file per app language (en, de, fr, it, es, pt), about 250 words each. It's loaded lazily, only when a project with `aisles` is open. It isn't shared with Go: the server leaves new API items unsectioned (an API client can send `section_id`). This is stated in the docs.
- Alternative: categorise with the assistant. Rejected: it needs a provider and a network, and it would be non-deterministic. A later change can offer it as a suggestion.

**D6. Server and API.**

- `POST /api/v1/tasks` takes an optional boolean `reuse` (default `false`, so existing clients see no change). With `reuse: true` and a reusable target project, the server runs D2 with `internal/reuse` inside the same transaction as the create:

  | Result | Server writes | Response |
  |---|---|---|
  | completed match | `completed_at: null` through `ApplyStrict` | `200` with the task and `"reused": "reopened"` |
  | open match | nothing | `200` with the task and `"reused": "open"` |
  | no match | the create, as today | `201` |
  | encrypted account, or the request's title is ciphertext | the create, as today | `201` with `"reused": "unavailable"` |

- The existing `Idempotency-Key` rules still apply.
- Authentication and errors are unchanged: 401 without credentials, 403 `forbidden` for a viewer, 404 for a project the caller can't see. An agent token creates through the MCP tool, never this route, as today.
- `ot add` sends `reuse: true` when the resolved project is reusable and `--new` is not given.
- The MCP `create_tasks` write tool sends `reuse: true` the same way. Its answer tells the agent which item was reopened, so an agent that "adds milk" doesn't duplicate.

**D7. Progressive disclosure and the interface budget.**

- **Where:** the project's Edit dialog gains a "List" group with two switches: Reusable list, with the hint "Adding an item that's already here brings it back instead of duplicating it", and Sort into aisles, shown only while Reusable list is on. Nothing is added to the sidebar, the page header or quick add.
- **What Simple-list users see:** nothing new until they open a project's Edit dialog. Projects default to off.
- **Inside a reusable list:** the header is unchanged. The list ends with the "Got it n" group (closed by default, state remembered per device), which replaces the "n completed tasks hidden" line. The Project menu's "Show completed tasks" item is hidden there, since the group always shows.
- **Budget:**
  - rows above the first item: unchanged (header, quick add);
  - task properties: unchanged;
  - sidebar destinations: none added;
  - scroll regions: unchanged;
  - shortcuts: none added.
- **Phone layout:** the toast's Add anyway action is a 44 px target. The Got it group behaves like the Completed group.

**D8. Offline and convergence.**

- **Matching and reopening** run on local data, so they work offline.
- **Two devices reopen the same item:** both write `completed_at: null`, which converges.
- **One device reopens while another completes the same item:** LWW on `completed_at` keeps the later write.
- **Turning the mode off:** the completed group falls back to the device preference, and nothing is written to tasks.
- **Older clients:** they ignore the fields. They still create duplicates and hide ticked items, and the collapse on a newer device cleans the duplicates up.

## Risks / Trade-offs

- **A collapse removes an item someone just typed.** Only items with nothing attached are collapsed, the Trash restores them, and the activity log names the device.
- **Root-locale lower-casing differs from Turkish rules.** This is documented, and the vectors pin it.
- **Vocabulary quality varies by language.** The contributor kit (`more-languages`) covers the aisle file, and a missing word just means "No section".

## Size

- About 6 KB gzip of vocabulary in a lazy chunk.
- About 2 KB gzip of logic in the project chunk.
- No entry-chunk change (`make bundle-budget`).
- Under 10 KB of binary for `internal/reuse`.
- No runtime memory change on the server.
