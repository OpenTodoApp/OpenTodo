# Design

## Context

Settings → Workspaces (change `workspaces`, task 7.1) renders a "Your workspaces" card and then, for the selected workspace, five flat cards stacked 24 px apart: Name and colour, Members, Groups, Invite links, Danger zone. The selection is a `bg-sunken` row, the same colour as hover. The group card lists names as a comma-joined line and edits membership through a checkmark menu. `workspaceApi.renameGroup` exists but nothing calls it. Invites are always created with role `member` and the default expiry.

## Goals / Non-Goals

**Goals:** it is always clear which workspace is open; each part of a workspace has its own place; groups can be managed comfortably with dozens of members; the API's invite options are reachable; everything stays keyboard reachable, works at 360 px with 44 px targets, and is disabled and explained offline.

**Non-goals:** no change to routes, roles, sync or the share dialog; no bulk member import; no per-group roles inside a workspace.

## Decisions

### D1. Two panes from 768 px, drill-down below

From 768 px the page is a grid: a 13 rem list column and the detail beside it. The open workspace's row has an accent bar on its left edge, the accent-soft background and `aria-current="true"`; hover only tints. Below 768 px the list is shown alone; choosing a workspace replaces it with the detail, whose header has a Back action to the list. The choice is kept in component state (not the address), as today.

Alternative: tabs of workspaces across the top. Rejected: names of different lengths and a growing number of workspaces do not fit a tab row, and the list already carries the role badges.

### D2. A wider section column for this page

Settings shows its section page at `lg:max-w-2xl` (42 rem) beside the settings list from 1024 px. Two panes in 42 rem leave the detail about 28 rem, too narrow for a member row with a role select and Remove. The Workspaces section page uses 56 rem instead (`data-settings-width="wide"`); every other section keeps 42 rem.

### D3. Header and tabs

The detail starts with the workspace's mark (`WorkspaceMark`, large), its name as a heading, and a line "n members · your role". Tabs (the shared `Tabs` primitive): General, Members, Groups, Invites. General holds the name field, colour and icon, then a separated "Danger zone" with Transfer and Delete for the owner or Leave for everyone else. Invites is shown only to managers. The default workspace shows only General (no members, groups or invites exist there) with the same explanatory line as before. The selected tab resets to General when another workspace is opened.

### D4. Groups editor

The Groups tab lists groups as rows: name, up to four member avatars (`PersonAvatar`) and "+n", and the member count. A row opens the group inline below the list as an editor: a name field with Save (`workspaceApi.renameGroup`), a member picker built on `ComboboxField` over the workspace's members not yet in the group, the group's members as rows with Remove, and Delete. Delete opens a `ConfirmDialog` whose consequence names the projects shared with the group, read from the cached memberships (members carrying `via` with the group's id); with none it says "No project is shared with this group." Non-managers see the list and, when a group is opened, its members read-only.

### D5. Invite role and expiry

The Invites tab's form has the optional email, a Role select (Member; Admin only for the owner, matching the API) and an Expires select: 1 hour, 1 day, 7 days (default), 30 days, sent as `expiresInHours` 1, 24, 168 or 720. Pending links show the role and "expires <date>". The card copy no longer says "after seven days".

### D6. Files

`WorkspacesSettings.tsx` keeps the page and the list; `WorkspaceGeneral.tsx` (identity and danger zone), `WorkspaceMembers.tsx`, `WorkspaceGroups.tsx` and `WorkspaceInvites.tsx` hold the tabs. Each function stays under the 250-line lint limit.

## Risks / Trade-offs

- The wider column makes the Workspaces page differ from the other settings pages. Mitigation: only the section column changes; the header, spacing and patterns are the same.
- Projects named in the delete confirmation come from the cache, so a project shared with the group on another device since the last sync is missing from the list. The server still applies the deletion correctly; the list is informative.
