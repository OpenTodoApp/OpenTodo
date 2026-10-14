# Proposal

## Why

The task detail panel is where people spend the most time after the list, and it is the least finished screen in the app. Every field is a stacked uppercase label over a bare control. The project, section and parent pickers are native `<select>`s: one has a space-indented tree, another lists every open task in the project, and none of them search. The "Fixed to time zone" checkbox is powerful but cryptic. Comments and activity are interleaved in one dense list that is hard to read. The revision history is a valuable feature hidden behind a `▸ History` toggle and rendered as raw `field from → to` lines. Reminders show dates in a format the user cannot control. The new design language (`design-language`) and shared primitives (`ui-primitives`) make it possible to fix all of this consistently, and this change applies them to the task detail panel.

## What Changes

- **Panel layout.** Rebuild `TaskDetail` on the new primitives:
  - a header bar with Complete, a priority and progress summary, an overflow menu (Delete, Copy link, Open parent) and Close;
  - title and notes;
  - a properties card of label/value rows (Project, Section, Parent, Assignee, Priority, Due, Reminders, Estimate, Repeat, Labels) that read as values and become editors on click or Enter;
  - Subtasks;
  - a tabbed area: Comments · Activity · History.

  Roomy spacing, Lucide icons, and light and dark themes from the tokens.
- **Smart entity pickers.** Every remaining native select that picks a project, section or parent task becomes the design-system smart picker from `ui-primitives`. The picker shows the most probable choices first (recent and frequent picks on this device), filters as you type with prefix and fuzzy matching, and shows parent paths ("Work › Clients › Acme"). This change migrates:
  - the task detail Project (with "Create project"), Section and Parent fields;
  - the sidebar's new-project "Parent project";
  - the ShareCapture project;
  - the Import target project.

  Entity-specific options are defined in a new `entity-pickers` capability. `ui-primitives` already rebuilds `AssigneePicker` and `LabelPicker` on the picker; this change places them in the new properties rows. Plain option lists (sort, group, role, import format) stay native selects.
- **Assignee in personal scopes.** When you are the only person who can be assigned (Inbox, an unshared project, or a shared project whose only member is you), the panel shows the assignee as **You** instead of "Unassigned". No operation is written for this; it is a display default. A "Show in Assigned to me" switch replaces the meaningless Unassigned/You choice and writes the explicit assignee operation, exactly as today. Shared projects with several members keep "Unassigned" as the default.
- **Time-zone control.** The checkbox becomes a zone chip next to the due time: "Floating" or "Berlin · UTC+2". The chip opens a small popover that explains the two modes, offers a one-key "Fix to my zone" (`z` still toggles it), and lets the user pick **any** IANA zone through a searchable zone combobox (the viewer's zone and recently used zones first). The popover previews how the time reads in the viewer's zone. This uses the existing `due.tz`; no data change.
- **Comments.** Each thread is a readable card with avatar, name, relative time (absolute time on hover, in the user's format), the Markdown body and quiet actions. Threads read oldest first, chat style, with the composer anchored at the end of the Comments tab; `Shift+C` still focuses it. The composer grows with its content, keeps @-mention completion, and shows `Ctrl/⌘+Enter` to send.
- **Activity.** The Activity tab lists derived events grouped into readable runs: consecutive changes by the same person within a few minutes collapse into one line ("You changed the due date and priority · 2 h ago") that expands to the individual events. Comment events appear as compact one-line entries. It still renders from local storage, marks pending events, and loads older events from the server.
- **History.** The History tab turns change sets into **versions**: one entry per author/device burst, with a human summary ("Renamed and rescheduled"), relative time, and device label. It expands into a readable diff per field (old value struck through, new value highlighted, rich rendering for due, priority, labels and references). It offers **Restore this value** per field and **Restore this version** for every field in the version, behind one confirmation. It still needs a connection and states so with an empty state when offline.
- **Reminders.** The Reminders row sits next to Due in the properties area. Each reminder reads as a removable chip ("30 min before", "Tue 3 Nov, 09:00"), and the add menu offers presets with icons. The date/time controls and the user's format come from `date-time-preferences`, which owns that behaviour (including its `reminders` delta). This change only applies the layout, so the two read alike.

Nothing here is **BREAKING**: no op field is added, renamed or removed, there are no new environment variables, and no new API routes.

### Out of scope

- The design tokens, Storybook and the primitives themselves (`design-language`, `ui-primitives`).
- The date and time preference setting, the date/time entry controls and reminder formatting (`date-time-preferences`; this change only lays them out).
- The project header "Move to" picker, the label merge picker on the Labels page, and every ⋯ menu outside the task panel (`labels-and-menus`).
- The generic picker behaviour (ranking, matching, keyboard, presentation) and the rebuilt Assignee and Label pickers (`ui-primitives`).
- Task list rows and board cards. Project-level activity and project history screens beyond reusing the new timeline components.
- Rich text for comments (still Markdown; see ROADMAP "Future ideas").
- Server changes. The history and activity routes are used as they are.

### ROADMAP

Advances the UI-quality follow-up to the shipped `bootstrap-core-platform` (task detail panel), `absolute-datetimes`, `comments-and-activity`, `trash-and-history` and `task-assignment` rows. When this change is archived, it is recorded as a new "Design refresh" row next to `design-language`.

## Capabilities

### New Capabilities
- `entity-pickers`: which screens choose a project, section, parent task, assignee or label with the design-system smart picker, what each entity's options show and allow (paths, archived or completed current values, project creation), and that picks are ordinary offline operations that converge.

### Modified Capabilities
- `web-app`: adds the task panel layout (properties rows, header menu), the Comments · Activity · History tabs and viewer-mode presentation alongside "Task detail panel".
- `task-management`: "Convert between floating and zoned" gains choosing an arbitrary zone and the explained zone control, keeping the `z` toggle.
- `task-assignment`: "Assignee on task rows and detail" changes the personal-scope presentation (implicit **You**, "Show in Assigned to me" switch).
- `comments`: "Comment thread in the client" changes to chronological threads with the composer at the end of the Comments tab.
- `activity-log`: "Per-task activity" moves to its own tab, groups consecutive events and shows comment events compactly instead of interleaving full threads.
- `trash-and-history`: "Revision history" (client presentation as versions with summaries and diffs) and "Restore a previous value" (adds restoring a whole version).

## Impact

- **Web:**
  - `web/src/app/TaskDetail.tsx`, `DueField.tsx`, `RemindersField.tsx`, `AssigneePicker.tsx`, `LabelPicker.tsx`, `TaskConversation.tsx`, `HistoryPanel.tsx`
  - the picker call sites in `Sidebar.tsx`, `ShareCapture.tsx`, `ImportScreen.tsx`
  - new pure helpers in `web/src/lib/`: entity picker sources (`pickerSources.ts`), activity grouping (`activityRuns.ts`), history versions and summaries (`historyVersions.ts`), and a device-local zone recents list
  - picker ranking reuses `lib/pickRank.ts` from `ui-primitives`
- **Dependencies:** lands after `ui-primitives` (Combobox, Tabs, Avatar, Badge, MenuItem, Timeline, EmptyState, Icon, Field, Switch) and `date-time-preferences` (formatting helpers and date/time fields). No new npm dependencies.
- **Data and sync:** no op or schema change. All edits still go through `mutate()`; personal-scope "You" is display-only; picker and zone recents are device-local and never synced; a version restore is several ordinary field ops.
- **Server, API, binary size:** unchanged. The bundle grows by a few KB of client code; the panel's pickers and history helpers can share the Combobox chunk.
- **Docs:** `docs/` user guide pages for the task panel, time zones, comments and history; screenshots regenerated via `make docs-screenshots`; in-app help ids kept.
- **Tests:**
  - vitest for ranking, grouping, summaries and the assignee default
  - the layout check (`scripts/e2e-*`) covers the new popovers and tabs at 360/390/768 px
  - `scripts/e2e-views.mjs` and `scripts/e2e-smoke.mjs` selectors for the panel updated
