## Why

`workspace-features` lets a workspace start simple and switch features on. Setting up a workspace for a purpose still takes many separate steps: features, the sidebar order, saved views, starting projects, routines, a theme. Two people who want the same setup cannot share it. Use cases from Discord and #1637:
- a self-hosted Todoist replacement ("Notes is useless for me");
- a family's chores on a shared kitchen iPad;
- following the Open Loops method.

The project template library already solves the same problem one level down.

This change takes **the project-template idea one level up**: a whole workspace's setup in the same library, with the same preview and the same "Use this". People set a workspace up with the ordinary tools, then "Save as kit". **Kit** is a placeholder for the user-facing name (the owner has not chosen it yet). It is defined once in the spec, so changing it touches only that definition and the strings. The change id stays neutral: `workspace-templates`.

## What Changes

- **No new machinery and no new formats inside.** A kit is a thin envelope of formats that exist:
  - feature switches (`workspace-features`);
  - a starting sidebar order (`workspace-features`' `sidebar_layout`);
  - saved views (the view entity's fields);
  - project templates (`template-library`, as starting lists);
  - routines, rules included (`template-library` "Routine templates");
  - a theme (the theme document of `themes`).

  All six parts are in v1.
- **Apply by file, paste or from the library**, managers only. A preview in plain sentences comes first: "Turns on Habits. Hides Notes. Creates 2 lists. Adds 1 routine. Changes the theme." Applying gives one Undo. It is a one-time act: afterwards the workspace remembers nothing like "uses Family, modified".
- **Save as kit** builds a kit from the open workspace, with the ordinary tools' results. Projects are included only when ticked, and are saved as project templates.
- **Safety:**
  - data only, never code; schema-validated and versioned; unknown keys ignored;
  - nothing fetched from the network;
  - routines that talk to the outside (webhooks, email, delivery channels) arrive switched off.
- **The official kits, Essential, Family, Full and Open Loops,** live in `templates/kits/` beside the project, routine and note templates.
  - The library check validates them, and the first run's question offers them.
  - Open Loops carries the method's features and navigation order (`workspace-features` D6).
  - Community kits come by pull request. A website gallery is out of scope.

Out of scope:
- renamed words (#779). This is a later change, designed from the exploration:
  - every string goes through one `lookup` (`web/src/lib/i18n/catalog.ts:80`);
  - "project" appears in 401 of 7,805 keys (49 capitalised);
  - aliases must be per term and per locale, not per key, and a kit would then gain a `terms` part.
- "tap your name, see your chores" on a shared screen (a display-mode follow-up on Family);
- a kit editor, a separate gallery, and "linked" kits that update later.

It advances the ROADMAP item `workspace-templates` (a new row) for #1637. It is built on `workspace-features`, which ships first. No **BREAKING** change:
- no new op field: views, projects, routines and themes are created with the fields they have, and features through the workspace route;
- no new environment variable.

## Capabilities

### New Capabilities

- `workspace-templates`: the kit envelope and its validation, the library entry, apply with a preview and one Undo, Save as kit, the official kits, and the safety rules.

### Modified Capabilities

The build adds MODIFIED deltas (task 1.4):
- `template-library`: kits in the repository and in the library dialog;
- `first-run`: the question offers the official kits.

## Impact

- `templates/kits/<slug>/kit.yaml`, with translations as for the other templates. The README section documents the envelope, and `scripts/templates-check.mjs` validates kits.
- Web:
  - `web/src/lib/kits.ts` (parse, validate, plan, apply, Undo), loaded with the library dialog;
  - kits in the template dialog;
  - the paste and file entry;
  - Save as kit;
  - strings in every locale.
- No server change beyond `workspace-features`' route: features are set through it, and everything else is ordinary ops.
- Docs (a "Kits" section in the templates guide), a changelog fragment.

No dependency. Everything loads with the template dialog, so the first load is unchanged.
