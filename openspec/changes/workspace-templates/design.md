## Context

The template library (`template-library`) already holds:
- project templates (`templates/<slug>/template.yaml`);
- routine templates (`templates/routines/<slug>/routine.yaml`);
- note templates (`templates/notes/<slug>`).

They are YAML in the repository, built into `web/src/generated/templates.json`, validated by `make templates-check` (`scripts/templates-check.mjs`), and opened in the app through one dialog with a preview and "Use this". The project format can also be saved from a project ("Save a project as a template file").

The other formats a kit wraps:
- Themes are versioned JSON documents of at most 16 KB, validated identically by `internal/themes` and `web/src/lib/theme/format.ts`, and kept as personal synced `theme` rows (up to 20).
- Saved views are synced `view` rows: name, query, kind, group, sort and display options.
- `workspace-features` adds a workspace's `features` map, set by managers through `PATCH /api/v1/workspaces/{id}`, and the personal `user_prefs.sidebar_layout`.

## Goals / Non-Goals

**Goals:**
- one library, one preview, one "Use this", one level up;
- no format of its own beyond the envelope;
- data only;
- one Undo;
- a one-time act.

**Non-Goals:**
- an editor;
- a gallery;
- linked kits;
- renamed words;
- a display mode.

## Decisions

### D1. The name

The user-facing name is **Kit** ("Family kit", "Save as kit"), defined once in the spec's first requirement; strings use it through the catalog. Code and files use `kit`; the change id is `workspace-templates`.

### D2. The envelope

A kit is one document, YAML in the repository and JSON when saved, downloaded or pasted:

```yaml
opentodo_kit: 1              # the envelope version; a higher one is refused as "made by a newer OpenTodo"
title: Family                # as a project template's title; summary, description, howToUse, category, icon, author, reviewed likewise
features: [habits, calendar, board, activity]       # registry ids that are on; every other feature is off
sidebar: [inbox, today, calendar, habits, "|", upcoming, completed]   # the sidebar_layout format
views:                       # saved views, in the view entity's fields
  - { name: Chores this week, query: "label:chore & due:7d", kind: list, group_by: assignee }
projects: [household-chores, { ...a project template... }]   # library slugs or embedded project templates
routines: [inbox-over-20, { ...a routine template... }]      # library slugs or embedded routine templates
theme: { ...a theme document... }                            # optional, or a built-in theme id
```

- Each part is validated by the validator its own format already has:
  - project templates and routine templates by `templates-check`'s rules;
  - the theme by the theme format (`internal/themes` with `theme/format.ts`);
  - views by the view fields' kinds;
  - feature ids by the registry;
  - the sidebar by the `sidebar_layout` reader.
- Unknown keys anywhere are ignored and listed in the preview as "not in this version".
- A document over 256 KB is refused.

### D3. Data only, nothing fetched

- Parsing never evaluates anything.
- A slug refers only to the library bundled with this build.
- No part is fetched, at import or at apply.
- A description keeps the template rules: https links stay text, opened only by a person's click.
- A theme keeps the theme format's refusal of CSS, `url()` and `var()`.

### D4. Routines that talk to the outside arrive off

Some routines contain a step that reaches outside the app: Send a webhook, Email me, Email project members, or Notify me through delivery channels. They are created switched off, and the preview says so: "Adds 2 routines, 1 switched off because it sends email". A routine template cannot name a webhook or a person, because the routine-template rules already require choices for them; the person fills those when switching it on.

### D5. Where each part goes

| Part | Goes to | Written how | Whose |
| --- | --- | --- | --- |
| `features` | the workspace's `features` (every id not listed: off) | `PATCH /api/v1/workspaces/{id}` | the workspace |
| `views` | new view rows in the workspace | ops | the workspace |
| `projects` | new projects in the workspace, from the project-template code | ops | the workspace |
| `routines` | new routines in the workspace, from the routine-template code | ops | the workspace |
| `sidebar` | the applying person's `sidebar_layout` | an op | the applying person (the order is personal) |
| `theme` | a new custom theme, chosen for its side | ops | the applying person (themes are personal) |

- Applying needs a connection, because `features` is server data.
- The PATCH goes first. The ops are written only after it succeeded, in one batch, so a failed apply leaves nothing behind.
- Managers only. A member sees kits in the library without "Use this", and with one line saying the owner and admins set up the workspace.

### D6. The preview and one Undo

- **The preview** lists, in plain sentences:
  - what turns on and what is hidden (by intention, from the registry);
  - how many lists, views and routines it creates, and which routines arrive off;
  - whether it changes your sidebar and your theme;
  - what is ignored.
- **Apply** records the previous `features`, `sidebar_layout` and theme choice, and the ids it created, in one Undo entry. Undo PATCHes `features` back, writes the previous sidebar and theme choice, and moves what was created to the Trash. If the PATCH fails, the toast says so and nothing is trashed.
- **Afterwards** the workspace keeps no reference to the kit.

### D7. Save as kit

Save as kit, on the Features page and in the workspace menu, managers only, builds a kit from the open workspace:
- its features;
- the saver's sidebar order;
- the workspace's saved views;
- the workspace's routines, as routine templates, with their webhooks, people and projects turned into choices by the routine-template rules;
- the saver's chosen custom theme, if one.

Projects are listed unticked; a ticked project is saved through "Save a project as a template file", which already strips dates to offsets and leaves out comments, attachments and assignees. The result downloads as `<name>.kit.json`. Saving to the user's own library is out of scope: the file is the unit of sharing, and dropping it in the library dialog applies it.

### D8. The official kits

`templates/kits/` holds four kits:

| Kit | Features | Contents |
| --- | --- | --- |
| `essential` | none | basics only |
| `family` | Habits, Calendar, Board, Activity | Household chores (project), a chores view |
| `full` | every feature | |
| `open-loops` | Next, Weekly review, Open Loops | the method's navigation order (Loop home first) and the four context labels today's first run offers |

- `templates-check` validates them and builds them into `generated/templates.json`.
- The first run's "How do you want to use it?" offers Essential (preselected), Family, Full and Open Loops. Choosing one applies it as Use this does, without a preview, since nothing exists yet.
- Community kits come by pull request with one folder, reviewed like templates.

## Data model

No new op field and no new server column: kits create views, projects, routines and themes with their existing fields, and set `features` and `sidebar_layout` from `workspace-features`.

## Risks / Trade-offs

- **A pasted kit is outside input.** It is parsed strictly, with size caps, no evaluation and nothing fetched; each part goes through its own validator, and outside-talking routines arrive off. The building PR needs a security read.
- **Undo spans the server and local writes.** Undo restores the server field first and then trashes; a failure is reported and leaves the created items in place.
- **A personal part** (sidebar, theme) changes only the applying person's setup. Other members keep theirs, and new destinations reach them at their default positions.
- **Size:** kits load with the template dialog, so the first load is unchanged; the official kits add under 4 KB to `generated/templates.json`. No dependency.

## Interface budget

- No new destination, row or shortcut.
- Kits are a section of the existing template dialog.
- One "Save as kit" item on the Features page and in the workspace menu.
- The palette's "Use a template…" also lists kits.
