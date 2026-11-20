## Why

OpenTodo shows every feature to everyone. A person who wants "a self-hosted Todoist alternative" meets Notes, Open Loops, Objectives, Energy, Routines and an assistant on day one ("Notes is useless for me", Discord, #1637). A family sharing chores on a kitchen iPad needs even less. Today six account-wide switches hide a few features (`method_mode`, `habits`, `objectives`, `time_sectors`, `energy`, `day_parts`). Each one is read at its own call sites and shown on its own settings card, and the rest of the app cannot be switched off at all.

The owner's principle: **users start simple and switch complexity on themselves, easily.** That needs one registry of switchable features, one place to switch them, and one rule every screen follows.

## What Changes

- **One registry of switchable features** (D2), for example Notes, Next, Weekly review, Open Loops, Objectives, Calendar, Board, Day parts, Estimates, Energy, Time sectors, Custom fields, Habits, Time tracking, Focus, Activity, Rules, Routines, Assistant and Agents. Each entry has its group, one line, a help link, the features it needs, and the places it appears.
- **The basics can never be switched off:** tasks, projects, labels, subtasks, the Inbox, Today, Upcoming, search, sharing, reminders, recurrence, priority and deadlines.
- **The state belongs to the workspace** (D1): one `features` map on the workspace, set only by its managers (owner and admins), delivered to every member through sync and cached for offline use. There is no personal override in v1.
- **The Features page is the first page of Settings.** It shows cards grouped by purpose: Plan, Consistency, Write, Together, and Automation and AI. Each card has one line, a switch and a help link. Members see the page read-only.
- **Settings follow features:** a feature's settings section appears only while the feature is on. Every Settings section shows its scope: this workspace, you, this device, or the server.
- **Turn it on where you need it:** search and the command palette offer "Turn on Habits" to managers while Habits is off. Others see nothing.
- **Dependencies switch on together**, and the app says so in one line ("Objectives also turns on Weekly review"). Switching off a feature others need switches them off too, with the same line.
- **Off hides, never deletes.** Data stays, and sync, the REST API, the CLI, MCP, the export, reminders and recurrence keep working on everything.
- **The six existing switches fold in** (D4): each workspace's initial state comes from its owner's current values, so nobody loses or gains a screen at upgrade. Personal choices that sat in the same fields (Open Loops first or as a companion, Today grouped by part of the day) stay personal.
- **Existing workspaces stay as they are**, every other feature on ("Full"). **New workspaces start Essential** (the basics only). The first run and New workspace ask **"Who is it for?"**: Essential (preselected), Family, or Full.
- **Views that span workspaces follow the open workspace** (D7). The palette, the bell and reminders show an entity from another workspace with its full words and features.
- **API:** `GET /api/v1/workspaces` carries `features`. `PATCH /api/v1/workspaces/{id}` accepts `features`, merged per key, from managers only.

Out of scope (for v1):
- a personal override of a workspace's features;
- modes as files, saving, importing and applying them (the next change, `workspace-modes`);
- renaming words ("Projects" → "Lists", #779);
- the kitchen-iPad display mode ("tap your name, see your chores");
- switching features from the CLI or MCP (both stay full; a later change can add `ot workspaces features`).

It advances the ROADMAP item `workspace-features` (a new row) for #1637. No **BREAKING** change: one additive server column, op fields are kept as they are (the six `user_prefs` fields stay in the schema), and no new environment variable.

## Capabilities

### New Capabilities

- `workspace-features`: the registry, the basics, per-workspace state set by managers, the Features page, settings that follow features, turning on from the palette, dependencies, hiding without deleting, presets for new workspaces, the migration of the six switches, and the API.

### Modified Capabilities

The build adds MODIFIED deltas, each copying the requirement whole (task 1.3):
- `habits`, `plan-objectives`, `time-sectors`, `task-energy`, `day-parts` and `open-loops`: availability comes from the workspace feature instead of the account switch;
- `first-run`: step 2 becomes "Who is it for?", and Open Loops is a feature turned on from the Features page;
- `settings-navigation`: Features is the first page; sections carry a feature and a scope;
- `workspaces`: the `features` field and its PATCH.

## Impact

- Server:
  - migration `00xx_workspace_features.sql` (a nullable `features` JSON column);
  - `internal/sync/workspaces.go` (the field, the one-time initial state);
  - `internal/httpapi/workspaces.go` (PATCH, validation against the registry ids);
  - the sync response, API docs, OpenAPI and the v1 surface.
- One registry of ids and dependencies, `internal/features/registry.json`, read by Go and the web. It is pinned by vectors, and the Dockerfile copies it.
- Web:
  - `web/src/lib/features.ts` (`useFeature`, presets);
  - the hook points listed in the design (D6);
  - the Features page (lazy);
  - the palette's Turn on entries;
  - the New workspace dialog and the first run;
  - strings in every locale.
- Docs (a "Features" guide), a changelog fragment.

No dependency. The registry and the hook read about 2 KB gzip on first load; the Features page loads lazily.
