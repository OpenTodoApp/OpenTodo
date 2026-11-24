# Feature switches per workspace

## Why

#1637: a family workspace does not need time tracking, and a team workspace may not want habits. Today every workspace shows every feature, and the only switches are personal (How you work), so the owner of a shared workspace cannot keep it simple for the people in it. The closed proposal #1642 (`workspace-features`) went further (kits, a Features page replacing How you work, a first-run question). The owner approved this smaller design on 2026-11-24. It reuses #1642's D2 (server data, merged per key), D3 (off hides, never deletes) and D8's rule that nothing changes at upgrade.

## What Changes

- **Eight switches per workspace**: Notes, Calendar, Habits, Time tracking, Focus, Routines, Weekly review and Locations. Everything else (tasks, projects, labels, Inbox, Today, Upcoming, search, views, sharing, comments, reminders, recurrence, Completed, Trash) is always on. Energy and time sectors stay personal.
- **Server data, not an op.** A nullable `features` column on `workspaces` holds a JSON map `{id: false}`; a missing key reads as on and NULL reads as everything on, so no workspace changes at upgrade or on creation. It is written through the existing `PATCH /api/v1/workspaces/{id}` (`{"features": {"habits": false}}`), merged per key, by the owner and admins only, and delivered with each workspace in the sync response and `GET /api/v1/workspaces`.
- **The workspace gates, the person refines.** A feature shows only if the current workspace allows it and the person's own switch (Habits, Objectives, maps) says on. No preference is migrated. While the current workspace has a feature off, Settings hides that feature's personal row.
- **Off only hides.** In that workspace its destinations, palette commands, `g` keys and row and panel controls are hidden. Its data is kept and synced; the REST API, CLI, MCP, export, CalDAV and routines already running are unchanged. A direct link shows "Habits is off in this workspace", with **Turn on** for the owner and admins.
- **Settings → Workspaces → {workspace} → Features**, after General, for every workspace including the default one: one row per feature with its name and a switch. Other members see the switches disabled with one line saying only the owner and admins can change them. Switching needs a connection, like General.

No new route, no new environment variable, no dependency, no op field. The workspace object gains an additive `features` field. Not **BREAKING**.

## Out of scope

- Kits or templates of switches, a Features page in place of How you work, a first-run question (#1642 D1, D4 to D7, D9): not approved.
- Hiding Settings sections of a feature that is off, and the items of other workspaces in cross-workspace lists (the bell, the widget).
- Switching features from the CLI or MCP (the REST field is there; no command is added).

ROADMAP.md: adds the row `workspace-feature-switches` under 0.20 "Everywhere" for #1637.

## Capabilities

### Modified Capabilities
- `workspaces`: the `features` field, its route behaviour, the Features tab and what an off feature hides.
- `app-shell`: the sidebar, the Notes space and the tab bar leave out destinations of features that are off.
- `command-palette`: commands of features that are off are not offered.
- `keyboard-shortcuts`: the `g` keys of features that are off do nothing.
