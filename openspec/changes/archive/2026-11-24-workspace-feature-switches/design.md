## Context

- Workspaces are server directory data (`workspaces` "Workspace entity"): `internal/sync/workspaces.go` changes them inside `directoryTx`, `PATCH /api/v1/workspaces/{id}` (`internal/httpapi/workspaces.go`) takes `WorkspaceInput` with nil fields left alone, and `canManage` (owner or admin) gates it. Clients cache the list in Dexie (`storeWorkspaces`, `web/src/lib/workspaces.ts`) and read it with `useWorkspaceState()`.
- The current workspace is per device (`CURRENT_WORKSPACE_KEY` in meta).
- Personal switches already exist and stay: `user_prefs.habits` (`useHabitsEnabled`), `objectives` (`useObjectivesOn`), `maps` (`useMapsOn`), `daily_notes`.
- Destinations are listed in `moreEntriesOf` and `primaryDestinations` (`app/Sidebar.tsx`), `PROMOTABLE` (`lib/appearance.ts`), the palette's `ROUTES` (`app/palette/registry.ts`), the global `go.*` handlers and the route switch (`app/Shell.tsx`); `ROUTE_SCREENS` (`app/screens.ts`) is the typed list of every route.

## Goals / Non-Goals

**Goals:** one switch per feature and workspace, owned by its managers; nothing changes for anyone until a manager switches something off; one pure rule read everywhere.

**Non-Goals:** kits, replacing How you work, a first-run question, Settings sections, cross-workspace lists, CLI or MCP commands.

## Decisions

### D1. The feature list

`web/src/lib/features.ts` exports `FEATURES` (ids in Settings order) and their names:

| Id | Name | Hidden while off |
| --- | --- | --- |
| `notes` | Notes | the Notes space, `/notes`, New note, Open today's note, `g n`, `g j` |
| `calendar` | Calendar | the Calendar destination, Day to Year, New frame, New slot, their `g` keys |
| `habits` | Habits | everything `useHabitsEnabled` gates today |
| `time-tracking` | Time tracking | Start and Stop tracking (`y`, menus, the panel's Time tab), the planned and tracked totals in Today's header |
| `focus` | Focus | the Focus destination, `/focus`, Start focus, `g f` |
| `routines` | Routines | the Routines destination and pages, New routine, Run routine, Describe a routine |
| `reviews` | Reviews | Review (with its Daily check, Monthly look and Close the day steps), Statistics, Objectives |
| `locations` | Locations | the Locations destination and pages, adding a location to a task, maps |

`internal/sync/workspace_features.go` holds the same ids for validation; a Go test reads `features.ts` and fails when the two lists differ.

### D2. Stored per workspace, merged per key (from #1642 D2)

- `workspaces.features` is a nullable TEXT column with a JSON object of booleans, added by the Go step `store.migrateWorkspaceFeatures` (migration `0075_workspace_features.sql` documents it; `ALTER TABLE ADD COLUMN` cannot be repeated, see 0037). NULL and a missing key read as on.
- `WorkspaceInput.Features map[string]bool`: the PATCH merges each key into the stored map in the same transaction, so two managers switching different features both keep theirs; for the same key the last write wins. An empty object changes nothing. `POST /api/v1/workspaces` takes the same field as the starting switches (the input type is shared); without it the column stays NULL.
- **Validation.** A key that is not a known id, or a null value, is refused with 400 `invalid_input` naming it, so a typo never stores silently. Keys already stored that this server does not know (written by a newer version before a downgrade) are kept on merge and returned as they are.
- **Roles.** Owner and admins only (`canManage`); a member gets 403 `forbidden`. The default workspace has its owner only.
- **Not an op.** Workspace data is outside the op log (`workspaces` "Workspace entity"), and a role check cannot live inside convergence. The change wakes every member's devices (`NotifyMembership`), which sync and see it without a reload.
- **Delivered** with every workspace as `features` (an object, `{}` for NULL) in the sync response and the REST answers. Each change is its own audit event, `workspace.features_changed`, with `setting: features` and `to` naming the switched ids (`focus=off,habits=on`); a rename stays `workspace.renamed`.
- **Offline.** Devices read the cached map, so gating works offline. Switching needs a connection and is disabled offline with General's line.

### D3. The workspace gates, the person refines

`featureOn(ws, id)` is `ws?.features?.[id] !== false`; `useFeature(id)` reads the current workspace from `useWorkspaceState()`. A feature shows when `useFeature(id)` and the existing personal switch are both on: `useHabitsEnabled`, `useObjectivesOn` and `useMapsOn` include the workspace's answer, so their call sites follow without change. No preference is migrated. Settings hides the Habits and Objectives rows of How you work, and the Maps section's switch, while the current workspace has the feature off.

### D4. Off hides, never deletes (from #1642 D3)

- **Routes.** `ROUTE_FEATURES` in `app/screens.ts`, a `Partial<Record<Route['view'], FeatureId>>` of the gated views beside `ROUTE_SCREENS`; a test classifies every route of `ROUTE_SCREENS` as gated or always on, so a new route must be placed on purpose. The shell lazy-loads `FeatureOff` in place of a gated page: an empty state "{Name} is off in this workspace" with **Turn on** for managers while online (one PATCH).
- **Destinations.** `moreEntriesOf` and the primary destinations drop entries whose route is gated off; `promotableIn(on)` filters `PROMOTABLE` for Appearance → Sidebar and the promoted rows; the Notes space switch hides with `notes`; the phone tab bar holds Inbox, Today and Upcoming, which are always on.
- **Palette.** Every command whose route is gated off, and the commands listed in `COMMAND_FEATURES` (in `app/palette/registry.ts`) (`task:focus`, `task:location`, `routine:run`, `new:frame`, …), are left out.
- **Shortcuts.** The `go.*` handlers return `false` for a gated route, so the key does nothing; `list.track` does nothing with Time tracking off.
- **Starting, never stopping.** A running time entry keeps its pill with Stop, and a running Focus session's off page offers Stop. Settings sections of a feature stay.
- **Data.** Nothing is written when a feature goes off: tasks keep their locations, habits their records, entries their times. A value already set (a task's location) still shows in the panel; only the offer to add one is hidden, as Energy does (task-energy D3).
- **Elsewhere unchanged.** The REST API, sync, CLI, MCP, export and import, CalDAV, reminder delivery, recurrence and running routines read and write all data whatever the switches say.

### D5. The Features tab

`WorkspaceFeatures` (`app/WorkspaceFeatures.tsx`), loaded lazily when the tab opens, so the first load does not grow. The tab follows General for every workspace; the default workspace, which showed General without tabs, now shows General and Features as tabs. One `SettingRow` per feature with its name and a `Switch`, no description. Members see the switches disabled and one line, "Only the owner and admins can change these." Offline, the switches are disabled with the workspace line.

## Data model

- Additive: `workspaces.features` TEXT NULL; `Workspace.features` in the sync and REST answers (`map[string]bool`); `features?: Record<string, boolean>` on the client's `Workspace` and `WorkspaceEntry`. No op field, no `Schema` change.
- Dexie stores the field with the workspace row; no Dexie version bump (the table's indexes are unchanged).

## Risks / Trade-offs

- **A member loses a feature they used** when a manager switches it off. Their data stays, a direct link says why, and a manager can turn it on.
- **Many call sites.** The routes map is typed, and `features.test.ts` walks `moreEntriesOf` and the palette's commands with each feature off, so nothing of a feature stays visible.
- **Older clients** ignore `features` and keep showing everything until they update; harmless, the data is the same.
- **Size.** About 1.5 KB gzip on the first load (the list, the hooks, the route map); `FeatureOff` and the tab are lazy. No dependency: image size and memory unchanged.

## Interface budget

No new sidebar destination, chrome row, task property or shortcut; switching features off only removes items. Settings gains one tab inside a workspace. The off-page empty state is one line and one button.
