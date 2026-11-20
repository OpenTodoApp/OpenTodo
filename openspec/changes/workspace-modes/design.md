## Context

`workspace-features` adds:
- the feature registry (`internal/features/registry.json`);
- a workspace's `features` map, set by its managers through `PATCH /api/v1/workspaces/{id}` and delivered with the workspace;
- three presets as feature lists.

The sidebar's destinations and many display defaults are personal `user_prefs` fields, for example `sidebar_destinations`, `today_group_by` and `add_position`. Project templates are YAML folders in `templates/`, built to `web/src/generated/templates.json` and checked by `make templates-check`.

## Goals / Non-Goals

**Goals:** a setup that can be saved, shared as a file, previewed and applied with one Undo; official modes that are the same files; nothing in a mode can run, fetch or reach outside the workspace.

**Non-Goals:** renaming words; a gallery; personal modes; behaviour changes; a display mode.

## Decisions

### D1. The format

```json
{
  "opentodo_mode": 1,
  "name": "Family",
  "features": { "habits": true, "calendar": true, "board": true, "activity": true },
  "sidebar": ["today", "upcoming", "calendar", "habits"],
  "templates": ["household-chores", { "title": "Pocket money", "projects": [ … ] }],
  "defaults": { "today_group_by": "project", "add_position": "top" }
}
```

- **`opentodo_mode`:** the format version.
  - 1 is the only version.
  - A higher version is refused with "made by a newer OpenTodo".
- **`name`:** 1 to 60 characters.
- **`features`:** registry ids mapped to booleans.
  - An absent id is off: a mode states what it turns on.
  - The basics cannot appear.
  - An unknown id is ignored and listed in the preview as "not in this version".
- **`sidebar`:** up to 6 destination ids from the existing list (`PROMOTABLE`), in order.
  - Ids of features the mode leaves off are dropped.
- **`templates`:** up to 10 entries.
  - An entry is a built-in template slug, or an object in the template format of `templates/README.md`, as JSON.
  - Each entry is validated by the template rules.
- **`defaults`:** keys from a closed list of display preferences that have a workspace meaning: `today_group_by`, `today_sort_by`, `upcoming_sort_by`, `add_position`, `row_layout`, `day_parts`, `focus_style`.
  - Each value is checked against what that preference accepts.
  - Any other key is ignored.

Any other top-level key is ignored. A file over 256 KB is refused. Text fields are trimmed and length-capped as their entities' fields are.

**Why JSON, not YAML:** a mode is pasted and exchanged by people who are not contributors, and JSON has one reading. The official files are short.

### D2. Data only, nothing fetched

- Parsing never evaluates anything.
- No field is a URL. A template's description keeps the template rules: https links as text, opened only by a person's click.
- A template slug refers only to the library bundled in this build.
- Nothing in a mode is fetched, at import or at apply.
- The validator is the same code in `make modes-check`, the import dialog and the official files' test: `web/src/lib/modes.ts` against `modes/schema.json`, in Node and the browser. Go does not parse modes: applying writes through the existing routes and ops, which validate as they always do.

### D3. Where a mode's parts go

| Part | Where it goes | Who | How |
| --- | --- | --- | --- |
| `features` | the workspace's `features` | managers | `PATCH /api/v1/workspaces/{id}` |
| `sidebar` | a new workspace field, `sidebar` | managers | the same PATCH |
| `defaults` | a new workspace field, `defaults` | managers | the same PATCH |
| `templates` | projects in the workspace | the applying manager | the template instantiation that exists (ops, in the workspace) |

- **Sidebar and defaults are workspace fallbacks, never overrides.**
  - A member's own `sidebar_destinations` or preference wins.
  - When theirs is empty, the workspace's value applies, and then the app's default.
  - This keeps personal settings personal and still gives a family tablet its setup.
- **Applying needs a connection,** because the workspace fields are server data. The template projects are ordinary ops and work offline, but they are written only after the PATCH succeeded, so a failed apply leaves nothing behind.

### D4. The preview and one Undo

The import dialog parses, validates and then lists:
- the features it turns on and the ones it hides, as names;
- the lists it creates (template titles);
- the defaults and sidebar it sets;
- anything ignored.

Apply is disabled until the mode is valid. Applying records the previous `features`, `sidebar` and `defaults` and the created project ids in one Undo entry. Undo PATCHes the three fields back, with the previous values, and moves the created projects to the Trash. Undo is offered in the toast and stays in the device's undo history like other batches.

### D5. Saving, the user's modes and applying elsewhere

- **"Save this setup as a mode"** builds a mode from the open workspace: its `features` (registry ids only), `sidebar`, `defaults` and the name the user types.
  - It never includes projects, tasks or other content: `templates` is empty in an exported mode.
  - Content in a shared file is personal data the person did not mean to share.
- **The result is saved, downloaded, or both.**
  - Saved modes are a personal synced entity, `saved_mode` (`name`, `body`, `created_at`, `deleted_at`), with name and body as content.
  - They are listed under Modes on the Features page, with **Apply to…**, **Download** and **Delete**.
  - They work offline for reading, and creating one is an op.
- **"Apply to another workspace"** lists the workspaces the user manages, then shows the preview of D4.

### D6. The official modes

- `modes/essential.json`, `modes/family.json` and `modes/full.json` are built into `web/src/generated/modes.json`.
- `make modes-check`, in `ci-checks`, runs the validator, checks that every template slug exists and that each official mode's `features` equals what the first run's presets expected, and fails with the file and the field.
- The first run's "Who is it for?" and New workspace then read these files. `workspace-features`' constant presets are removed, with the same contents, pinned by a test.
- Community modes are added by a pull request with one file, reviewed like templates; there is no gallery in v1.

### D7. Later: words

Renaming terms (#779) is a separate change, `workspace-terms`, designed from the exploration:
- one alias table per term and locale ("project" → "list", with its plural and capitalised forms), applied in `lookup` (`web/src/lib/i18n/catalog.ts:80`);
- not a per-key table, since "project" appears in 401 of 7,805 keys;
- a mode would then gain a `terms` part.

## Data model

All additive:
- workspaces get nullable JSON columns `sidebar` and `defaults` (server directory data, no op);
- a new personal entity, `saved_mode`, in `Schema`: `name` (content), `body` (content, at most 256 KB), `created_at` and `deleted_at`, personal like `objective`.

There is no new environment variable.

## Risks / Trade-offs

- **A pasted mode is outside input.** The parser is strict, with size caps, no evaluation and no URLs to follow, and embedded templates are validated. The building PR needs a security read.
- **Undo across server and local writes** is two kinds of write. Undo restores the server fields first and then trashes the projects; if the PATCH fails, the toast says so and nothing is trashed.
- **Defaults as fallbacks** can surprise a member whose own preference is empty. Each Settings section's scope line ("This workspace") says where the value comes from.
- **Size:** the modes code and dialog load lazily, so the first load is unchanged; `generated/modes.json` is under 2 KB. No dependency.

## Interface budget

- No new destination, row or shortcut.
- One Modes card at the end of the Features page (Save as mode, Import, the saved modes), one import dialog, and one Apply to… menu item per saved mode.
- The palette gains "Import a mode…" for managers.
