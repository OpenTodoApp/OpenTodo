## Why

OpenTodo shows every feature to everyone, so a person who wants "a self-hosted Todoist alternative" meets Notes, Open Loops, Objectives, Energy, Routines and an assistant on day one ("Notes is useless for me", Discord, #1637). A family sharing chores on a kitchen iPad needs even less.

What exists is scattered:
- Six account-wide switches hide a few features (`habits`, `energy`, `day_parts`, `objectives`, `time_sectors`, `method_mode`). Each is read at its own call sites and shown on Settings → How you work.
- The sidebar page also hides and promotes destinations.
- The Open Loops method is a mode that overrides the sidebar.
- The rest of the app cannot be switched off.

The owner's principle: **a new workspace starts simple, and its managers switch complexity on, easily. Nothing is duplicated: one thing lives in one place.**

## What Changes

- **One registry** of switchable features. Each declares its id, the features it needs, and every place it appears: sidebar destinations, palette commands, shortcuts, quick-add tokens, task fields, its settings section and its routes. The basics are not in it and can never be switched off.
- **One switch per feature, in one place, per workspace.**
  - Only the workspace's managers (owner and admins) change it; there is no personal override in v1.
  - The six account switches move into the registry and leave their old place.
  - Off hides, never deletes. Sync, the export, the API, the CLI and MCP stay complete.
- **The Features page is the first page of Settings and replaces "How you work".**
  - Rows are worded by intention ("Build habits", "Plan my week", "Share chores"), grouped as Plan, Consistency, Write, Together, and Automation and AI.
  - Each row has one line, a switch and a help link.
  - Dependencies switch on automatically, and the app says so in one line.
- **Settings follow features.** A feature's settings section exists only while the feature is on. Every setting shows its scope: this workspace, you, this device, or the server.
- **Switch on from where you need it.** Search and the palette offer "Turn on Habits" to managers only. There are no prompts or suggestions.
- **The sidebar page only orders.** Features decide whether a destination exists; Settings → Appearance → Sidebar decides only where it sits.
  - It is one draggable list of what is on, with one divider between "shown" and "under More". It has no hide control and one link, "Turn on more features".
  - Turning a feature on places its destinations at their default position; turning it off removes them.
  - The order stays personal, per account.
- **The Open Loops method stops being a mode.** It becomes features plus a navigation order, shipped as an official template in `workspace-templates`. Today's Open Loops users keep exactly what they see (D6).
- **Existing workspaces keep everything they show today on. New workspaces start Essential** (the basics only). The first run asks one question, "How do you want to use it?", with Essential preselected.
- **Views across workspaces follow the open workspace.** An item from another workspace shows complete.
- **API:** the workspace carries `features`. `PATCH /api/v1/workspaces/{id}` sets it, merged per key, for managers only.

Out of scope (for v1):
- a personal override;
- templates of a whole workspace (the next change, `workspace-templates`);
- renamed words (#779);
- "tap your name, see your chores" on a shared screen (a display-mode follow-up);
- switching features from the CLI or MCP (both stay complete).

It advances the ROADMAP item `workspace-features` (a new row) for #1637. No **BREAKING** change:
- one additive server column and one additive `user_prefs` field;
- no op field renamed or removed (the six old fields stay in the schema);
- no new environment variable.

## Capabilities

### New Capabilities

- `workspace-features`:
  - the registry and the basics;
  - per-workspace switches set by managers;
  - the Features page;
  - settings that follow features, and scopes;
  - Turn on from search and the palette;
  - dependencies, and hiding without deleting;
  - the ordering-only sidebar page;
  - the migration of the six switches, Open Loops and the sidebar;
  - Essential for new workspaces;
  - the API.

### Modified Capabilities

The build adds MODIFIED deltas, each copying the requirement whole (task 1.3):
- `habits`, `plan-objectives`, `time-sectors`, `task-energy`, `day-parts`: availability comes from the workspace feature;
- `open-loops` and `method-views`: no method mode; the method is features plus an order;
- `app-shell`: sidebar structure from the registry and the personal order;
- `settings-navigation`: Features first, How you work removed, sections carry a feature and a scope;
- `first-run`: one question;
- `workspaces`: the `features` field and its PATCH.

## Impact

- Server:
  - a migration (a nullable `features` JSON column on `workspaces`) and the one-time upgrade map;
  - `internal/sync/workspaces.go`;
  - `internal/httpapi/workspaces.go` (PATCH, validation against the registry);
  - the sync response, MCP `list_workspaces`, API docs, OpenAPI and the v1 surface.
- One registry file of ids and dependencies, `internal/features/registry.json`:
  - Go embeds it and the web imports it;
  - pinned by vectors;
  - copied by the Dockerfile.
- `user_prefs.sidebar_layout`, the personal order with its divider, computed once from `sidebar_destinations`, `sidebar_order` and `method_mode`.
- Web:
  - `web/src/lib/features.ts`;
  - the hook points (design D7);
  - the Features page (lazy) replacing How you work;
  - the Sidebar page;
  - Turn on in search and the palette;
  - the first run;
  - strings in every locale.
- Docs: a "Features" guide, the sidebar, method and first-run guides, and a changelog fragment.

No dependency. The registry and the hook add about 2 KB gzip to the first load; the Features page loads lazily.
