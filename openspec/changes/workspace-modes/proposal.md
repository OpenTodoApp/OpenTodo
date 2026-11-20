## Why

`workspace-features` lets a workspace's managers switch features one by one, and gives new workspaces three presets. Setting up a workspace still takes several decisions: which features, which sidebar, which starting projects and which defaults. Two people who want the same setup cannot share it. Some use cases:
- a self-hosted Todoist replacement without Notes or Open Loops;
- a family chores board;
- a student's term ("a self-hosted Todoist alternative, Notes is useless for me", kids' chores on a shared kitchen iPad, Discord, #1637).

A **mode** captures a workspace's setup as a small data file that can be saved, shared, imported and applied with a preview and one Undo.

## What Changes

- **A mode is a JSON document:**
  `{opentodo_mode: 1, name, features{}, sidebar[], templates[], defaults{}}`.
  - It is data only, never code, and checked against a published schema; unknown keys are ignored.
  - Nothing is fetched from the network.
  - Templates come only from the built-in library (by slug) or are embedded in the file, in the template format.
- **"Save this setup as a mode"** (managers only) exports the open workspace's features, sidebar and defaults as a mode, either saved to the user's modes or downloaded as a file.
- **Import by file or paste** shows a preview first: what it turns on, what it hides, the lists it creates and the defaults it sets. Applying is one step with one Undo.
- **"Apply to another workspace"** applies one of the user's saved modes to a workspace they manage.
- **The official modes, Essential, Family and Full,** are the same files, in `modes/`.
  - `make modes-check` validates them, as `make templates-check` does for templates.
  - They replace the three presets of `workspace-features`, with the same contents, pinned by a test.
  - Community modes come later, by pull request; a gallery is out of scope.

Out of scope:
- renaming words ("Projects" → "Lists", #779). This is a later change, `workspace-terms`, based on what the exploration found:
  - every string goes through one `lookup` (`web/src/lib/i18n/catalog.ts:80`);
  - "project" appears in 401 of 7,805 keys (49 of them capitalised);
  - aliases must be per term and per locale, not per key.
- a gallery or any download of modes;
- modes that change behaviour or data rules, or contain code or links;
- the kitchen-iPad display mode ("tap your name, see your chores"), a follow-up built on Family;
- personal (non-workspace) modes.

It advances the ROADMAP item `workspace-modes` (a new row) for #1637. It is built on `workspace-features`, which ships first. No **BREAKING** change; there is no new environment variable.

## Capabilities

### New Capabilities

- `workspace-modes`: the mode format and its validation, saving, importing with a preview, applying with Undo, the user's saved modes, and the official modes.

### Modified Capabilities

- `workspace-features`: the three presets come from the official mode files (task 1.4). The build adds the MODIFIED delta.

## Impact

- `modes/`:
  - `schema.json`, `essential.json`, `family.json`, `full.json` and a README with the format;
  - `scripts/modes-check.mjs` and `make modes-check` (in `ci-checks`), with a build step to `web/src/generated/modes.json`.
- Workspace data (server directory data, as in `workspace-features`): two nullable JSON columns, `sidebar` and `defaults`. The PATCH accepts them from managers.
- A new personal synced entity, `saved_mode` (name and body, content-encrypted). It is additive in `internal/sync/ops.go` `Schema`.
- Web:
  - `web/src/lib/modes.ts` (parse, validate, plan, apply, Undo), loaded lazily;
  - the Modes card on the Features page;
  - the import dialog with its preview;
  - Save as mode;
  - strings in every locale.
- Docs (a "Modes" guide, `modes/README.md`), a changelog fragment.

No dependency: the validator is a small hand-written checker over the published schema, the same as `templates-check`. Everything loads lazily, so the first load is unchanged.
