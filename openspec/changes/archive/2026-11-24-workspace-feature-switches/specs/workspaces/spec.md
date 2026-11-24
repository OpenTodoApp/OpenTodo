## ADDED Requirements

### Requirement: Workspace features
Every workspace SHALL carry `features`, a map from feature id to a boolean, for the eight switchable features `notes`, `calendar`, `habits`, `time-tracking`, `focus`, `routines`, `reviews` and `locations`. A missing key, and a workspace that never stored the map (every existing and every new workspace), SHALL read as on. Tasks, projects, labels, the Inbox, Today, Upcoming, search, views, sharing, comments, reminders, recurrence, Completed and Trash SHALL NOT be switchable. The map SHALL be server-side directory data like the name and icon: never an op, written only through `PATCH /api/v1/workspaces/{id}` with a `features` object, merged key by key into the stored map, by the workspace's owner and admins, or given as the starting switches of `POST /api/v1/workspaces`. A key that is not a known feature id, or a value that is not true or false, SHALL be refused; keys already stored that the server does not know SHALL be kept. Each change SHALL be recorded as its own audit event, `workspace.features_changed`, with the switched ids and never a name. The `reviews` feature covers the Daily check, Close the day, the weekly review, Statistics and Objectives. The map SHALL be delivered with the workspace in every sync response and REST answer and cached on the device, so the switches apply offline; changing them SHALL need a connection, and the devices of every member SHALL be woken to sync, showing the change without a reload.

#### Scenario: Nothing changes at upgrade
- **WHEN** a server is upgraded and an existing account syncs
- **THEN** each of its workspaces carries `features: {}` and every feature shows as before

#### Scenario: Owner switches Habits off
- **WHEN** the owner of Family sends `PATCH /api/v1/workspaces/{id}` with `{"features":{"habits":false}}`
- **THEN** the response is 200 with `features` holding `habits: false`, and Bob's open device in Family syncs and stops showing Habits without a reload

#### Scenario: Merged per key
- **WHEN** one admin sends `{"features":{"habits":false}}` and then another sends `{"features":{"focus":false}}`
- **THEN** the workspace's `features` holds both `habits: false` and `focus: false`

#### Scenario: Unknown key
- **WHEN** an admin sends `{"features":{"habit":false}}`
- **THEN** the response is 400 `invalid_input` naming `habit`, and nothing is stored

#### Scenario: Null value
- **WHEN** an admin sends `{"features":{"habits":null}}`
- **THEN** the response is 400 `invalid_input` naming `habits`, and nothing is stored

#### Scenario: Not a member
- **WHEN** an account that is not a member of Family sends a `features` change to it
- **THEN** the response is 404 `not_found`, as for a workspace that does not exist

#### Scenario: Audited
- **WHEN** the owner switches Focus off
- **THEN** an audit event `workspace.features_changed` is recorded with the workspace id and `focus=off`, and no `workspace.renamed` event

#### Scenario: A member cannot switch
- **WHEN** a `member` of Family sends a `features` change
- **THEN** the response is 403 `forbidden` and nothing changes

#### Scenario: Anonymous and demo
- **WHEN** a request without credentials, or a demo account, sends a `features` change
- **THEN** the response is 401 `unauthorized`, or 403 `demo_restricted` on a demo instance, and nothing changes

#### Scenario: Offline
- **WHEN** the device is offline
- **THEN** the cached switches still decide what is shown, and the Features tab's switches are disabled with the line saying workspaces need a connection

### Requirement: A feature that is off is hidden in its workspace
While the device's current workspace has a feature off, the app SHALL hide that feature's destinations, its palette commands, its `g` keys and its row and panel controls, and SHALL write nothing: the feature's data SHALL be kept, synced and shown again unchanged when the feature is turned on, and the REST API, the CLI, MCP, the export, CalDAV, reminder delivery, recurrence and routines already running SHALL work on all data whatever the switches say. A feature SHALL show only when the current workspace allows it and the person's own switch, where one exists (Habits, Objectives, maps, Daily notes), is on; personal switches SHALL NOT be migrated, and while the workspace has a feature off its personal row SHALL be hidden in Settings. A direct link to a page of a feature that is off SHALL show one line, "{Feature} is off in this workspace.", with Turn on for the owner and admins while online, and nothing more for other members. A value already set (a task's location) SHALL still show; only the offer to add one is hidden. Off SHALL hide starting, never stopping: a running time entry keeps its pill with Stop, and a running Focus session's page offers Stop. Settings sections of a feature (Focus, Calendar, Notes, Routines) SHALL stay, so preferences can still be read and changed.

#### Scenario: Habits off in Family
- **WHEN** Family has Habits off and Bob, who has Habits on, switches to Family
- **THEN** the sidebar, the palette, `g Shift+H` and the task menus offer nothing of Habits, and switching back to Personal shows them again

#### Scenario: Data is kept
- **WHEN** a manager switches Time tracking off and on again
- **THEN** every time entry is still there with its times, and nothing was written to any task

#### Scenario: Direct link
- **WHEN** Bob opens `/habits` in Family while Habits is off there
- **THEN** the page reads "Habits is off in this workspace" without a Turn on button; the owner sees Turn on, and choosing it shows the Habits page

#### Scenario: Personal row hidden
- **WHEN** the current workspace has Reviews off
- **THEN** Settings → How you work shows no Objectives row, and the stored `objectives` preference is unchanged

#### Scenario: A running entry can still be stopped
- **WHEN** a time entry is running and a manager switches Time tracking off
- **THEN** the running pill stays in the sidebar with Stop, and nothing else of time tracking is offered

#### Scenario: A running Focus session can still be stopped
- **WHEN** a Focus session is running and the current workspace has Focus off
- **THEN** opening `/focus` shows "Focus is off in this workspace." with Stop, which ends the session

#### Scenario: Settings sections stay
- **WHEN** the current workspace has Calendar off
- **THEN** Settings still shows the Calendar section with its preferences

#### Scenario: Other routes unaffected
- **WHEN** Family has Locations off and an agent reads a task through MCP
- **THEN** the task's location is returned as before

## MODIFIED Requirements

### Requirement: Workspaces settings page
Settings → Workspaces SHALL list the user's workspaces with their role, open each one to rename it, choose its icon and colour, manage members (add by email, change role, remove), groups (create, rename, members, delete), invite links (create with a role and an expiry, copy once, send by email when configured, revoke), switch features, transfer and delete, with every action reachable by keyboard and with the actions disabled and explained while offline. From 768 px the list SHALL be a column beside the open workspace, the open one marked by more than a hover tint and announced as current; below 768 px choosing a workspace SHALL open it as its own view with a Back action to the list. The open workspace SHALL start with a header showing its mark, its name and its number of members, followed by tabs: General (name, colour, icon, and Transfer, Delete or Leave in a separated danger zone), Features, Members, Groups and, for the owner and admins, Invites; the default workspace SHALL show General and Features only. Features SHALL list the eight switchable features, one row each with its name and a switch and no description; for a member who is neither owner nor admin the switches SHALL be disabled with one line saying only the owner and admins can change them. Groups SHALL list each group's name, its members' avatars and their count, and opening a group SHALL offer rename, a searchable member picker, each member with Remove, and Delete behind a confirmation that names the projects shared with the group. A member who is neither owner nor admin SHALL see the member and group lists read-only and a Leave action. The page SHALL use the standard settings patterns, with one Help action.

#### Scenario: Owner manages a workspace
- **WHEN** the owner opens Settings → Workspaces → Family
- **THEN** the page shows the name, icon and colour controls, the feature switches, the members with roles, the groups with their members, the pending invite links, and Transfer and Delete in a separated danger zone

#### Scenario: Member sees it read-only
- **WHEN** a `member` of Family opens it in Settings
- **THEN** the members and groups are listed without controls, the feature switches are disabled with one line saying only the owner and admins can change them, and a Leave action is offered

#### Scenario: Features of the default workspace
- **WHEN** a user opens Settings → Workspaces → Personal and chooses the Features tab
- **THEN** the eight features are listed with switches the user can change

#### Scenario: Phone width
- **WHEN** the page is opened on a 360 px wide screen
- **THEN** no horizontal scrolling is needed, the member rows wrap their role control under the name, and every control is at least 44 × 44 px

#### Scenario: Offline
- **WHEN** the page is opened without a network
- **THEN** the cached lists are shown and the controls are disabled with a line saying workspaces need a connection

#### Scenario: Which workspace is open
- **WHEN** the owner of Family and Work opens Family at 1280 px
- **THEN** Family's row in the list carries the current marker and is announced as current, Work's row only tints on hover, and the detail's header reads "Family" with its mark and "3 members"

#### Scenario: Drill down on a phone
- **WHEN** a member opens Settings → Workspaces at 360 px and chooses Family
- **THEN** the list is replaced by Family's detail with a Back action, and Back returns to the list with Family focused

#### Scenario: Edit a group
- **WHEN** an admin opens the group "Adults" in Family, renames it to "Grown-ups" and adds Dan through the member picker
- **THEN** the group is renamed, Dan is listed among its members with Remove, and the list row shows the new name and one more avatar

#### Scenario: Deleting a group asks first
- **WHEN** the owner chooses Delete on "Adults", which is shared on House and Trip
- **THEN** a confirmation names House and Trip as losing access through the group, and the group is deleted only after it is confirmed

#### Scenario: Invite an admin for a day
- **WHEN** the owner creates an invite link with the role Admin and the expiry 1 day
- **THEN** the link is created with role `admin` and an expiry 24 hours ahead, and the pending list shows it as an admin link with its expiry date

#### Scenario: An admin invites members only
- **WHEN** an admin opens the Invites tab
- **THEN** the role choice offers Member only

### Requirement: Sync delivers workspaces in a fixed number of queries
Every sync response SHALL carry the caller's workspaces (id, name, icon, colour, default flag, role, owner, features), the members of each (id, name, role) and the groups of each (id, name, member ids), read with a fixed number of queries however many workspaces, members and groups the caller has, in a stable order (workspaces by id, members owner first then by role and name, groups by name). Devices SHALL replace their cached lists with the response's on every exchange. The wake-up channel SHALL carry no workspace content; a membership, group or features change SHALL wake the devices of every affected account to sync.

#### Scenario: Three queries
- **WHEN** a user who belongs to 15 workspaces with 300 members and 40 groups in all syncs
- **THEN** the workspaces, members and groups are read with three queries, not one per workspace

#### Scenario: Woken on a change
- **WHEN** Bob is added to "Family" from Alice's device
- **THEN** Bob's open devices are woken, sync, and show Family in their switcher without a reload

#### Scenario: Features arrive with the workspace
- **WHEN** Alice switches Focus off in Family
- **THEN** Bob's open devices are woken, sync, and cache Family with `features.focus` false
