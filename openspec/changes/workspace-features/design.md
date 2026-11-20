## Context

The exploration (posted on "PRs ready", 2026-11-20) found the following.

- **The current workspace is per device**, kept in device meta (`web/src/lib/workspaces.ts:17`, `resolveCurrent` :106).
  - Today, Upcoming, Anytime, saved views, the sidebar counts, the badge and the native app's lists read the current workspace only.
  - The palette, the switcher counts, the bell, the feed's unread count, the widget and the shell reminders read every workspace.
  - The CLI picks a workspace with a flag or its profile. MCP reads every workspace when no `workspace` is given.
- **There is no feature registry.** Destinations are listed in several places:
  - `Sidebar.tsx:771-783` and its More menu (:687-711);
  - `PROMOTABLE` (`appearance.ts:24`) and the tab bar (:142-150);
  - palette `ROUTES` (`registry.ts:111-133`);
  - `SHORTCUTS` (`shortcuts.ts:127`, gated inside their handlers);
  - the quick-add context (`QuickAdd.tsx:93-98`);
  - `SETTINGS_SECTIONS` (`settingsSections.ts:66`, `visibleSections` :192);
  - `ROUTE_SCREENS` (`screens.ts:17`) and `VIEW_QUICK_ADD` (`router.ts:97`).
- **Six account-wide switches** each have their own reader:
  - `method_mode` (`lib/method/mode.ts`);
  - `habits` (`habitPrefs.ts`);
  - `objectives` (`objectivePrefs.ts`);
  - `time_sectors` (`sectorNames.ts`);
  - `day_parts` (`dayParts.ts`);
  - `energy` (`energy.ts`).

  All six are shown on Settings → How you work (`HowYouWorkSection.tsx:68-100`).
- **Workspaces are server directory data, never ops.**
  - Table: `0045_workspaces.sql`.
  - PATCH: `httpapi/workspaces.go`, managers checked by `canManage`, owner or admin.
  - Clients receive them through the sync response's `workspaces` list and keep them in Dexie.

## Goals / Non-Goals

**Goals:**
- One registry, and one rule every surface reads.
- Managers switch a workspace's features from one page, or from where they need a feature.
- Nobody's screen changes at upgrade.
- New workspaces start small.

**Non-Goals:**
- personal overrides;
- modes as files (`workspace-modes`);
- renaming words;
- a kiosk or display mode;
- switching from the CLI or MCP.

## Decisions

### D1. The state is a field of the workspace, not an op

`workspaces.features` is a JSON object mapping a feature id to `true` or `false`. It is set through `PATCH /api/v1/workspaces/{id}` with `{features: {habits: true}}`, which merges per key: two managers who switch different features both keep their change. The field is delivered in the sync response's `workspaces` list like the name and the colour.

- **Why not an op.** Workspace data is server directory data by the `workspaces` spec, and membership and roles are never ops. A feature map edited as an op would need the role check inside convergence, which the op log does not do.
- **Offline.** Reading works offline, from the cached workspace. Switching needs a connection, like renaming or creating a workspace: the switch is disabled offline, with the existing "needs a connection" line.
- **Convergence.** The server holds one value per key, last write wins per key. Devices adopt the server's map on every sync.
- **Missing keys.** A key that is absent reads as the workspace's preset: Full for workspaces that existed before this change, Essential for new ones (D5). An unknown key, from a newer client, is kept and ignored.

### D2. One registry: ids and dependencies shared, presentation on the web

- `internal/features/registry.json` lists each feature's `id`, its `group` and the ids it `needs`.
  - Go embeds it to validate PATCH keys; the web imports it.
  - Shared vectors pin the dependency closure (switching X on turns on Y, switching Y off turns off X).
  - The Dockerfile copies the file for the web build.
- `web/src/lib/features.ts` adds each feature's line, icon and help link, the settings sections it owns, and the destinations, palette routes, shortcuts and quick-add phrases it gates.

| Group | Features |
| --- | --- |
| Plan | Next, Open Loops (needs Next, Weekly review), Objectives (needs Weekly review), Calendar, Board, Day parts, Estimates, Energy, Time sectors, Custom fields |
| Consistency | Habits, Weekly review, Time tracking, Focus |
| Write | Notes (with daily notes) |
| Together | Activity |
| Automation and AI | Rules, Routines, Assistant, Agents |

- **The basics are not in the registry**, so nothing can address them: tasks, projects, labels, subtasks, the Inbox, Today, Upcoming, search, sharing, comments, reminders, recurrence, priority and deadlines.
- **Agents off** hides the Settings sections for connecting AI apps and creating agent tokens. Tokens and connections that already exist keep working: the API surfaces stay full (D8).

### D3. Off hides, never deletes

Switching off writes nothing but the workspace field. When a feature is off:
- its destinations, palette entries, shortcuts, quick-add phrases, row and panel controls and settings sections are not shown;
- its data stays and keeps syncing;
- a direct link to its page shows the page's empty state with one line ("Habits is off in this workspace") and **Turn on** for managers.

A task's fields keep their values: a task with an energy level keeps it, and a filter on it still matches.

### D4. The six switches fold in

At upgrade the server computes each existing workspace's `features` once, from its owner's `user_prefs`. Every other feature is on.

| Switch | Feature | Initial state | What stays personal |
| --- | --- | --- | --- |
| `habits` | Habits | on unless `"off"` | nothing |
| `objectives` | Objectives | on if `"on"` | nothing |
| `time_sectors` | Time sectors | on if `"on"` | nothing |
| `energy` | Energy | on if `"on"` | nothing |
| `day_parts` | Day parts | on if `"on"` | Grouping Today by part, a Today menu item shown while the feature is on |
| `method_mode` | Open Loops | on if `companion` or `first` | `companion` or `first` (method words beside lists, or the Loop home first), shown while the feature is on |

- New clients stop reading the four plain switches for availability. The fields stay in the schema: rule 3 keeps every field, and older clients still read them.
- Settings → How you work loses those four cards and keeps the two personal choices, each shown only while its feature is on.
- **Risk:** in a shared workspace a member who had, say, Energy on while its owner had it off stops seeing it. Their data stays, and a manager can turn it on.

### D5. Presets: Full for existing workspaces, a question for new ones

There are three presets, each a list of feature ids. `workspace-modes` later turns them into mode files.
- **Essential:** the basics only.
- **Family:** Habits, Calendar, Board and Activity.
- **Full:** every feature.

A workspace created after this change records its preset's map at creation. The first run's step 2 becomes **"Who is it for?"**, with Essential preselected, Family and Full, each with one sentence. New workspace asks the same question in its dialog. Open Loops leaves the first run and becomes a feature, turned on from the Features page. The Loop home remains its start view.

### D6. Where the rule is read

There is one hook, `useFeature(id)`, and one pure `featureOn(workspace, id)`, read at the places the exploration listed:
- sidebar destinations and More;
- `PROMOTABLE` and the tab bar;
- palette `ROUTES` and commands;
- `SHORTCUTS` (a `feature` field on each entry, checked by the dispatcher instead of inside handlers);
- quick-add phrases;
- `SETTINGS_SECTIONS` (a `feature` field, filtered in `visibleSections`);
- `ROUTE_SCREENS`;
- row and panel controls for Energy, Estimates, Day parts, Time sectors and Custom fields.

A unit test fails for a destination, route, shortcut or settings section that names an unknown feature id.

### D7. Views that span workspaces follow the open workspace

The palette, the bell, the feed's unread count, reminders and widgets hide what the open workspace hides. An entity from another workspace, such as a palette hit or a reminder, opens with its own workspace's features: following it switches the workspace, as today (`useWorkspaceFollow`). The alternative, always showing everything in cross-workspace views, would show a screen in one workspace that its manager switched off.

### D8. Surfaces that stay full

The REST API, sync, the CLI, MCP, the export, the import, CalDAV, reminder delivery, recurrence and rules evaluate everything whatever the switches say. A workspace's features are about what its screens show. MCP's `list_workspaces` and the API return `features`, so an agent can tell what a person sees.

### D9. The Features page, scopes and Turn on

- **The Features page** is the first Settings page, in a new group, Workspace.
  - It lists the cards by group, each with an icon, a name, one line, a switch and a Learn more link.
  - Managers switch the features; members see the switches disabled with one line, "Set by the workspace's owner and admins".
  - It covers the open workspace only, and its title names it.
- **Each Settings section declares its scope**: `workspace`, `account`, `device` or `server`. The section page's meta reads "This workspace", "You", "This device" or "Server". This is existing meta, not a new row.
- **Turn on.** While a feature is off, managers find "Turn on Habits" in search and the palette. It runs with the dependency line as its toast, and Undo switches it back.

## Data model

- **Additive:** a nullable `features` TEXT (JSON) column on `workspaces`.
  - NULL reads as the workspace's preset: Full for workspaces created before this change. New workspaces store their map.
  - The upgrade writes the D4 map for every existing workspace once. A workspace whose owner has no `user_prefs` row gets Full.
- **No op field changes.** The six `user_prefs` fields stay.
- **Sync response:** the `workspaces` list adds `features`.

## Risks / Trade-offs

- **Mixed clients.** An older client keeps reading the account switches until it updates. That is harmless: the data is the same and only what is shown differs.
- **Shared workspaces lose personal switches** (D4). The workspace is the unit people share, which is the owner's choice for v1.
- **Many call sites** (D6). The registry test and the hook keep them uniform.
- **Size:**
  - first load about +2 KB gzip (registry and hook);
  - the Features page lazy;
  - no dependency, so no change to image size or memory.

## Interface budget

- No new sidebar destination, no new row above a list, no new shortcut.
- One Settings page (the first), and a scope word in the existing section meta.
- One palette or search entry per off feature, for managers only.
- First run: step 2's choice is replaced, not added to.
