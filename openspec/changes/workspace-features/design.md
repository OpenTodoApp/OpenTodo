## Context

The exploration (posted on "PRs ready", 2026-11-20) found the following.

- **The current workspace is per device**, kept in device meta (`web/src/lib/workspaces.ts:17`, `resolveCurrent` :106).
  - Today, Upcoming, Anytime, saved views, the sidebar counts, the badge and the native app's lists read the current workspace only.
  - The palette, the switcher counts, the bell, the feed's unread count, the widget and the shell reminders read every workspace.
- **There is no feature registry.** Destinations are listed in several places:
  - `Sidebar.tsx:687-711` (More) and `primaryDestinations`;
  - `PROMOTABLE` (`appearance.ts:24`) and the tab bar;
  - palette `ROUTES` (`registry.ts:111-133`);
  - `SHORTCUTS` (`shortcuts.ts:127`, gated inside handlers);
  - the quick-add context (`QuickAdd.tsx:93-98`);
  - `SETTINGS_SECTIONS` (`settingsSections.ts:66`);
  - `ROUTE_SCREENS` (`screens.ts:17`).
- **Six account-wide switches**, each with its own reader:
  - `method_mode` (`lib/method/mode.ts`);
  - `habits` (`habitPrefs.ts`);
  - `objectives` (`objectivePrefs.ts`);
  - `time_sectors` (`sectorNames.ts`);
  - `day_parts` (`dayParts.ts`);
  - `energy` (`energy.ts`).

  All six are on Settings → How you work (`HowYouWorkSection.tsx`).
- **The sidebar today:**
  - The primary destinations are fixed: Inbox, Today, Upcoming and Calendar.
  - `sidebar_destinations` promotes More entries, and `sidebar_order` orders the primary rows.
  - In Open Loops first (`method_mode: "first"`), `primaryDestinations` and `firstModeMore` replace the primary rows with Loop home, Inbox, Today, Next, Waiting and Review, and move Upcoming and Calendar into More.
- **Workspaces are server directory data, never ops.**
  - PATCH: `httpapi/workspaces.go`, managers checked by `canManage` (owner or admin).
  - Clients receive them through the sync response's `workspaces` list and keep them in Dexie.

## Goals / Non-Goals

**Goals:**
- one registry, and one switch per feature in one place;
- nothing duplicated: How you work and the sidebar's hiding disappear into Features;
- nobody's screen changes at upgrade;
- new workspaces start small.

**Non-Goals:**
- personal overrides;
- workspace templates (`workspace-templates`);
- renamed words;
- a display mode;
- switching from the CLI or MCP.

## Decisions

### D1. The registry

`internal/features/registry.json` holds each feature's `id`, `group` and the ids it `needs`.
- Go embeds it to validate PATCH keys; the web imports it.
- Shared vectors pin the dependency closure.
- The Dockerfile copies it for the web build.

`web/src/lib/features.ts` adds the intention wording, the help link, and every place the feature appears:

| Place | What the feature declares |
| --- | --- |
| sidebar | destination ids and their default position |
| palette | command and route ids |
| shortcuts | keys |
| quick add | tokens |
| task | fields (row and panel controls) |
| settings | section ids |
| routes | route ids |

A test fails for any of these places that names an unknown feature, and for a destination, command, shortcut, token, field, section or route of a feature's area that names none.

Completed from the code:

| Group | Row (intention) | Feature id | Needs |
| --- | --- | --- | --- |
| Plan | Plan my week | `weekly-review` (Review, Statistics, the weekly review) | |
| Plan | Decide what's next | `next` (Next, Waiting, Anytime, Someday) | |
| Plan | Follow the Open Loops method | `open-loops` (Loop home, Daily check, Monthly look, method links) | `next`, `weekly-review` |
| Plan | Set goals for the quarter | `objectives` | `weekly-review` |
| Plan | See my days on a calendar | `calendar` (Day, Week, Month, Year, time blocks, calendar sync) | |
| Plan | Move cards on a board | `board` | |
| Plan | Split the day into parts | `day-parts` | |
| Plan | Estimate how long things take | `estimates` | |
| Plan | Match tasks to my energy | `energy` | |
| Plan | Keep time for areas of life | `time-sectors` | |
| Plan | Add my own fields | `custom-fields` | |
| Plan | Remind me at places | `locations` | |
| Consistency | Build habits | `habits` | |
| Consistency | Track my time | `time-tracking` | |
| Consistency | Focus on one thing | `focus` | |
| Write | Keep notes | `notes` (with daily notes) | |
| Together | See what others changed | `activity` (Updates, workspace Activity) | |
| Automation and AI | Automate repeating work | `routines` (rules are one-step routines, `routines` "Every rule is a one-step routine") | |
| Automation and AI | Ask an assistant | `assistant` | |
| Automation and AI | Connect AI apps | `mcp` (connected apps, agent tokens) | |

"Share chores" is the help line of Together's group heading: sharing itself is a basic.

The basics are not in the registry: tasks, projects, labels, subtasks, the Inbox, Today, Upcoming, search, saved views, sharing, comments, reminders, recurrence, priority, deadlines, Completed, Trash and the template library.

### D2. One switch, per workspace, as server data

`workspaces.features` is a JSON object mapping ids to booleans, set through `PATCH /api/v1/workspaces/{id}` `{features: {habits: true}}`.
- **Merged per key.** Two managers switching different features both keep their change; for the same key the last write wins.
- **Delivered with the workspace** in the sync response.
- **Not an op.** Workspace data is server directory data by the `workspaces` spec, and a role check cannot live inside convergence.
- **Offline.** Reading works offline from the cache. Switching needs a connection, like renaming a workspace: the switch is disabled offline with the existing line.
- **Unknown keys.** An unknown key, from a newer client, is kept and ignored.
- **Missing keys** read as the workspace's starting set (D8).

### D3. Off hides, never deletes

Switching off writes only the workspace field. While a feature is off:
- every place it declared (D1) is hidden in that workspace;
- its data stays, syncs and keeps its values: a task's energy, a filter on it, a habit's records;
- a direct link to its page shows the page's empty state with one line ("Habits is off in this workspace") and **Turn on** for managers.

The REST API, sync, the CLI, MCP, the export and import, CalDAV, reminder delivery, recurrence and routines work on all data whatever the switches say.

### D4. The Features page replaces How you work

- The Features page is the first Settings page, in a group named for the workspace. Its title names the open workspace.
- Rows are grouped Plan, Consistency, Write, Together, and Automation and AI. Each row has its intention, one line, a switch and Learn more.
- Members see the switches disabled with one line, "Set by the workspace's owner and admins".
- **How you work is removed.** Its four plain switches become rows. Its two personal choices become settings of their features' sections, shown only while those features are on:
  - Day parts' "Group Today by part of the day";
  - Open Loops' "Loop home as start view".
- Old addresses of How you work redirect to Features, through the existing legacy-address mechanism (`settings-navigation` "Legacy settings addresses").

### D5. Dependencies, scopes and Turn on

- **Dependencies.** Turning a feature on also turns on what it needs; turning it off also turns off what needs it. It happens in one PATCH, with one line ("Objectives also turns on Plan my week") and one Undo.
- **Scopes.** Each Settings section declares `workspace`, `account`, `device` or `server`, and its page meta reads "This workspace", "You", "This device" or "Server". This uses the existing meta, not a new row.
- **Turn on.** While a feature is off, search and the palette offer its managers "Turn on Habits", with the dependency line and Undo. Nothing else prompts or suggests.

### D6. The sidebar page only orders; Open Loops becomes an order

- **The new field.** `user_prefs.sidebar_layout` is the personal order: destination ids, with one `|` marking where "under More" starts. Example: `inbox,today,upcoming,calendar,|,next,waiting,habits,completed,trash`.
  - It replaces `sidebar_destinations` and `sidebar_order` for new clients. Both stay in the schema for older clients.
  - Ids of features that are off, and unknown ids, are skipped on read and kept.
- **The page.** Settings → Appearance → Sidebar is one draggable list of the destinations that exist (the basics and the features that are on), with the divider row. It has no hide control and one link, "Turn on more features", to the Features page.
- **Turning a feature on** inserts its destinations at their declared default position (D1), unless they are already in the order. Turning it off removes them from the drawn sidebar only.
- **Open Loops first** stops overriding the sidebar: its primary rows were simply an order.
- **Migration, once per account, when `sidebar_layout` is empty:**
  - from `method_mode: "first"`: the order Loop home, Inbox, Today, Next, Waiting, Review | Upcoming, Calendar, then the rest of More in today's order;
  - otherwise: Inbox, Today, Upcoming, Calendar, then the promoted `sidebar_destinations` in `sidebar_order`, | the rest of More in today's order.

  The owner's workspace features for Open Loops, Next and Weekly review start on (D8), so an Open Loops first user sees the same sidebar.
- **Rhythm markers** (the Monthly look, the Daily check) follow the `open-loops` feature instead of the mode.
- **The Open Loops template.** `workspace-templates` ships Open Loops as an official template: these features plus this order.

### D7. Where the rule is read

There is one hook, `useFeature(id)`, and one pure `featureOn(workspace, id)`, read at:
- the sidebar's destinations;
- `PROMOTABLE` and the tab bar;
- palette `ROUTES` and commands;
- the shortcut dispatcher (a `feature` field on each entry);
- quick-add tokens;
- the task row and panel controls;
- `SETTINGS_SECTIONS` (`visibleSections`);
- `ROUTE_SCREENS`.

The six readers named in the context become `useFeature` calls. The method readers that switch words and links by mode read `open-loops`, plus the personal start-view choice.

### D8. Starting sets

- **Existing workspaces keep everything they show today.** At upgrade the server writes each existing workspace's map once:
  - every feature on;
  - except the six that had account switches, which take the workspace owner's current values: `habits` on unless `"off"`; `objectives`, `time-sectors`, `energy` and `day-parts` on only if `"on"`; `open-loops` on only if `method_mode` is `companion` or `first`.

  Turning those four on for everyone would show screens their owners never chose.
- **New workspaces start Essential** (every feature off).
- **The first run asks one question,** "How do you want to use it?", with Essential preselected, Full, and the official templates of `workspace-templates` once it ships. It replaces today's step 2, "How do you want to work".
- **New workspace** starts Essential; its managers switch features on, or apply a template once `workspace-templates` ships.
- **Risk:** in a shared workspace, a member who had, say, Energy on while the owner had it off stops seeing it. Their data stays, and a manager can turn it on.

### D9. Views across workspaces follow the open workspace

The palette, the bell, the unread count, reminders and widgets hide what the open workspace hides. An item from another workspace, such as a palette hit or a reminder, shows complete and opens in its own workspace, as `useWorkspaceFollow` does today.

## Data model

All additive:
- a nullable `features` TEXT (JSON) column on `workspaces`:
  - NULL reads as every feature on (a workspace not yet migrated);
  - new workspaces store their map;
- `user_prefs.sidebar_layout` (kString, default `""`), declared once in `Schema`, with the generated files regenerated;
- the sync response's `workspaces` carry `features`.

No op field is renamed or removed: `habits`, `objectives`, `time_sectors`, `energy`, `day_parts`, `method_mode`, `sidebar_destinations` and `sidebar_order` stay.

## Risks / Trade-offs

- **Mixed clients.** An older client keeps reading the old fields until it updates. That is harmless: the data is the same and only what is shown differs.
- **Shared workspaces lose personal switches** (D8). The workspace is the unit people share, which is the owner's choice.
- **Many call sites** (D7). The registry test and the single hook keep them uniform.
- **Size:**
  - about +2 KB gzip on the first load (registry and hook);
  - the Features page lazy;
  - no dependency, so image size and memory are unchanged.

## Interface budget

- No new sidebar destination, row above a list, or shortcut.
- Settings loses How you work and gains Features in its place; the Sidebar page loses its hide controls.
- One palette and search entry per off feature, for managers only.
- The first run's step 2 is replaced, not added to.
