## ADDED Requirements

### Requirement: One registry and the basics
The app SHALL keep one registry of switchable features. Each feature SHALL declare its id, its group (Plan, Consistency, Write, Together, or Automation and AI), its intention ("Build habits", "Plan my week"), one line, a help link, the features it needs, and every place it appears: sidebar destinations with their default position, palette commands, shortcuts, quick-add tokens, task fields, its settings section and its routes. The registry SHALL include Weekly review, Next, Open Loops, Objectives, Calendar, Board, Day parts, Estimates, Energy, Time sectors, Custom fields, Locations, Habits, Time tracking, Focus, Notes, Activity, Routines (rules included), Assistant and MCP. Tasks, projects, labels, subtasks, the Inbox, Today, Upcoming, search, saved views, sharing, comments, reminders, recurrence, priority, deadlines, Completed, Trash and the template library SHALL be basics: not in the registry and never hidden by it. A place that names an unknown feature SHALL fail a test.

#### Scenario: Basics stay
- **WHEN** a workspace has every feature off
- **THEN** its sidebar shows the Inbox, Today, Upcoming and its projects, and tasks can be added with labels, subtasks, priority, deadlines, reminders and repeat rules, and found by search

#### Scenario: Registry test
- **WHEN** a shortcut declares the feature id `habbits`
- **THEN** the registry test fails naming the shortcut and the unknown id

### Requirement: One switch per feature, per workspace
Each workspace SHALL hold which features are on, as server directory data delivered with the workspace to every member's devices and cached, so every screen reads it offline. Only the workspace's owner and admins SHALL change it, through `PATCH /api/v1/workspaces/{id}` with `features`, an object of ids and booleans merged per key; two managers changing different features SHALL both keep their change, and the same feature SHALL take the last write the server received. Changing it SHALL need a connection; offline, the switches SHALL be disabled with a line saying a connection is needed. A device SHALL adopt the server's map on its next sync. An id the server does not know SHALL answer 400 `invalid_input` naming it; a stored key a client does not know SHALL be kept and ignored. There SHALL be no personal override, and the account switches `habits`, `energy`, `day_parts`, `objectives`, `time_sectors` and `method_mode` SHALL no longer decide what is shown.

#### Scenario: A manager turns on Habits
- **WHEN** the owner of "Family" turns on Build habits and a member's tablet syncs
- **THEN** the tablet shows Habits in Family and in no other workspace

#### Scenario: A member cannot switch
- **WHEN** a `member` of "Family" patches `{"features":{"habits":false}}`
- **THEN** the response is 403 `forbidden` and nothing changes

#### Scenario: Two managers at once
- **WHEN** one admin turns Notes off while another turns Board on
- **THEN** after both requests Notes is off and Board is on

#### Scenario: Offline
- **WHEN** the device is offline
- **THEN** the Features page shows the stored state with its switches disabled and a connection line, and every screen still follows the stored state

#### Scenario: Anonymous request
- **WHEN** a request without credentials patches a workspace's features
- **THEN** the response is 401 `unauthorized` and nothing changes

#### Scenario: Unknown feature
- **WHEN** a manager patches `{"features":{"teleport":true}}`
- **THEN** the response is 400 `invalid_input` naming `features.teleport` and nothing changes

### Requirement: Off hides, never deletes
Switching a feature off SHALL write nothing but the workspace's map. While it is off, every place it declares SHALL be hidden in that workspace, and its data SHALL stay, sync and keep its values. The REST API, sync, the CLI, MCP, the export and import, CalDAV, reminder delivery, recurrence and routines SHALL keep working on every feature's data whatever the map says. A direct link to an off feature's page SHALL show the page's empty state with one line saying it is off in this workspace, and Turn on for managers only.

#### Scenario: Notes off and on again
- **WHEN** the owner turns Keep notes off and later on again
- **THEN** while off no Notes appears in the sidebar, palette or settings, `ot notes list` still lists the notes, and once on every note is there unchanged

#### Scenario: A field keeps its value
- **WHEN** Energy is off and a task has the energy level "low"
- **THEN** the task page shows no energy control, the API still returns `energy: "low"`, and turning Energy on shows it again

#### Scenario: Old link
- **WHEN** a member opens a bookmarked Habits address while Habits is off
- **THEN** the page says Habits is off in this workspace, with no Turn on

### Requirement: The Features page
Settings SHALL open on a Features page for the open workspace, its title naming the workspace, replacing How you work. Its rows SHALL be worded by intention and grouped Plan, Consistency, Write, Together, and Automation and AI, each with one line, a switch and a help link. Members SHALL see the switches disabled with one line saying the owner and admins set them. Turning a feature on SHALL also turn on the features it needs, and turning one off SHALL also turn off the features that need it, in one request, with one line naming the others and one Undo. How you work's addresses SHALL lead to the Features page; its personal choices SHALL live in their features' sections.

#### Scenario: Dependencies
- **WHEN** a manager turns on Set goals for the quarter while Plan my week is off
- **THEN** both are on after one request, the toast names Plan my week, and Undo turns both off

#### Scenario: Turning off a needed feature
- **WHEN** a manager turns Decide what's next off while Follow the Open Loops method is on
- **THEN** Open Loops is turned off too and the toast names it

#### Scenario: How you work is gone
- **WHEN** a user opens the old address of Settings → How you work
- **THEN** the Features page opens

### Requirement: Settings follow features and show their scope
A feature's settings section SHALL exist only while the feature is on in the open workspace. Every Settings section SHALL show its scope in its page meta: this workspace, you, this device, or the server.

#### Scenario: A section appears
- **WHEN** Focus is off and a manager turns it on
- **THEN** Settings gains the Focus section at once, and it disappears again when Focus is turned off

#### Scenario: Scope
- **WHEN** a user opens the Features page and then Appearance
- **THEN** the Features page's meta reads "This workspace" and Appearance's reads "This device" or "You" as that section declares

### Requirement: Turn on where you need it
While a feature is off in the open workspace, search and the command palette SHALL offer its managers "Turn on <feature>", which turns it on with what it needs and offers Undo. Members SHALL see no such entry, and the app SHALL show no other prompt or suggestion to turn a feature on.

#### Scenario: From the palette
- **WHEN** a manager types "habits" in the palette while Habits is off
- **THEN** "Turn on Habits" is offered, and choosing it shows Habits in the sidebar at once with an Undo toast

#### Scenario: A member
- **WHEN** a member types "habits" while Habits is off
- **THEN** no Turn on entry is offered

### Requirement: The sidebar page only orders
Whether a destination exists SHALL be decided by the features; Settings → Appearance → Sidebar SHALL decide only where it sits. The page SHALL show one draggable list of the destinations that exist in the open workspace, with one divider between those shown and those under More, no control to hide a destination, and one link, "Turn on more features", to the Features page. The order SHALL be personal: one account preference shared by the account's devices, converging by last-writer-wins as one value, working offline, and applied in every workspace to the destinations that exist there. Turning a feature on SHALL place its destinations at their default position unless the person already placed them; turning it off SHALL remove them from the sidebar and keep their place in the order. The Open Loops method SHALL no longer override the sidebar.

#### Scenario: Drag under More
- **WHEN** a user drags Completed below the divider
- **THEN** Completed is under More on every device of the account after sync

#### Scenario: A feature turned on
- **WHEN** a manager turns on Build habits in a workspace where the user never placed Habits
- **THEN** Habits appears at its default position in the user's sidebar

### Requirement: Upgrade changes no screen
At upgrade, each existing workspace SHALL get every feature on, except Habits, Objectives, Time sectors, Energy, Day parts and Open Loops, which SHALL take its owner's values: Habits on unless it was off; Objectives, Time sectors, Energy and Day parts on only if they were on; Open Loops on only if the method mode was a companion or first. Each account's sidebar order SHALL be computed once from its promoted and ordered destinations and its method mode, so that an Open Loops first user keeps Loop home, Inbox, Today, Next, Waiting and Review as their shown destinations and Upcoming and Calendar under More. Grouping Today by part of the day and the Loop home as start view SHALL stay personal choices, in their features' sections.

#### Scenario: An owner with Habits off
- **WHEN** a server is upgraded where the owner had Habits off, Energy on and the method mode `lists`
- **THEN** their workspace shows no Habits and no Open Loops, shows Energy, and shows every other feature as before

#### Scenario: Open Loops first
- **WHEN** an Open Loops first user's server is upgraded
- **THEN** their sidebar, Loop home and rhythm markers look exactly as before, and Settings shows Follow the Open Loops method on

### Requirement: New workspaces start Essential
A workspace created after this change SHALL start with every feature off (Essential). The first run SHALL ask one question, "How do you want to use it?", with Essential preselected and Full offered.

#### Scenario: A new workspace
- **WHEN** a user creates "Groceries"
- **THEN** Groceries shows the basics only, and the user's other workspaces keep their features

#### Scenario: The first run
- **WHEN** a new owner keeps Essential and finishes the first run
- **THEN** their workspace shows the basics only, and Settings opens on Features

### Requirement: Views across workspaces follow the open workspace
The palette, the bell, the unread count of Updates, reminders and widgets, which read every workspace, SHALL hide what the open workspace hides. An item from another workspace SHALL show complete and open in its own workspace.

#### Scenario: A reminder from another workspace
- **WHEN** a habit's reminder from "Home" fires while "Work", which has Habits off, is open
- **THEN** the reminder shows, and opening it switches to Home, where Habits shows

### Requirement: Features through the API
`GET /api/v1/workspaces` and `GET /api/v1/workspaces/{id}` SHALL return each workspace's `features` as the full map of registry ids to booleans, and MCP's workspace list SHALL return it too. Changing features SHALL require a session or a `full` or `admin` token and the owner or admin role, and SHALL be refused for `read` and `agent` tokens and on a demo instance as the workspace routes are.

#### Scenario: Read the map
- **WHEN** a member lists workspaces
- **THEN** each workspace carries `features` with every registry id

#### Scenario: Read token
- **WHEN** a `read` token patches a workspace's features
- **THEN** the response is 403 `insufficient_scope` and nothing changes
