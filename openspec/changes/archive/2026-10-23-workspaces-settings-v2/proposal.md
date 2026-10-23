# Proposal

## Why

Settings → Workspaces works, but it reads badly. The selected workspace is marked only by a grey background that looks like hover, and every card below it has a generic title ("Members", "Groups"), so it is hard to tell which workspace is being edited. All cards sit 24 px apart, so the list and the detail run into each other. Groups, a feature built for managing many people, are a row of names with a checkmark menu, no rename (the API has it), and a delete without confirmation. Invite links are always `member` links that expire in seven days, although the API accepts an admin role and any expiry from 1 hour to 30 days. The owner asked for a clearer, more modern and more usable page.

## What Changes

- **Master–detail.** From 768 px the workspace list is a column on the left and the open workspace on the right. The open workspace is marked with an accent bar and `aria-current`, different from hover. Below 768 px the list opens a workspace as its own view with a Back action.
- **A header that names the workspace.** The detail starts with the workspace's mark, its name and "n members", then tabs: **General** (name, colour, icon, then Transfer, Delete or Leave), **Members**, **Groups** and **Invites**. The default workspace has General only.
- **Members.** Each row has the person's avatar and name, the role select and Remove for managers, and the role as a badge for everyone else.
- **Groups editor.** The list shows each group's name, its members' avatars and their count. Opening a group shows rename, a searchable member picker (the Combobox) that adds a person in place, each member with Remove, and Delete with a confirmation that names the projects losing access through the group.
- **Invite options.** Creating a link offers a role (Member, or Admin for the owner) and an expiry (1 hour, 1 day, 7 days by default, 30 days). The pending list shows each link's role and expiry.
- No change to the routes, the sync payload or any other spec.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspaces`: "Workspaces settings page" describes the two-pane layout, the header and tabs, the groups editor, the confirmation on deleting a group, and the invite role and expiry.

## Impact

- `web/src/app/WorkspacesSettings.tsx` is split into the page, the general tab, the members tab, the groups tab and the invites tab.
- `web/src/app/SettingsView.tsx`: the Workspaces section page may use a wider column (56 rem) from 1024 px, so the two panes fit beside the settings list.
- Copy in the five catalogs, stories in both themes, tests, `docs/workspaces.md`, CHANGELOG, visual baselines.
- No server change, no new dependency, no bundle growth beyond the page's own code (it already loads with Settings).
