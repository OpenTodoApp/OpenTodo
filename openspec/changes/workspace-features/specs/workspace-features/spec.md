## ADDED Requirements

### Requirement: Switchable features and the basics
The app SHALL keep one registry of switchable features, each with an id, a group (Plan, Consistency, Write, Together, or Automation and AI), one line, a help link and the ids of the features it needs. The registry SHALL include at least Next, Open Loops, Objectives, Calendar, Board, Day parts, Estimates, Energy, Time sectors, Custom fields, Habits, Weekly review, Time tracking, Focus, Notes, Activity, Rules, Routines, Assistant and Agents. Tasks, projects, labels, subtasks, the Inbox, Today, Upcoming, search, sharing, comments, reminders, recurrence, priority and deadlines SHALL be basics: they are not in the registry and SHALL never be hidden by it. Every sidebar destination, palette route, shortcut, quick-add phrase and settings section that belongs to a switchable feature SHALL name its feature id, and an unknown id SHALL fail a test.

#### Scenario: Basics stay
- **WHEN** a workspace has every switchable feature off
- **THEN** its sidebar still shows the Inbox, Today, Upcoming and its projects, tasks can be added with labels, subtasks, priority, deadlines, reminders and repeat rules, and search finds them

#### Scenario: Registry test
- **WHEN** a settings section declares the feature id `habbits`
- **THEN** the registry test fails naming the section and the unknown id

### Requirement: A workspace's features
Each workspace SHALL hold which switchable features are on, as server directory data delivered to every member's devices with the workspace and cached, so every screen reads it offline. Only the workspace's owner and admins SHALL change it, through `PATCH /api/v1/workspaces/{id}` with `features`, an object of feature ids and booleans merged per key. Changing it SHALL need a connection; offline, the switches SHALL be disabled with a line saying a connection is needed. Two managers changing different features SHALL both keep their change, and the same feature SHALL take the last write the server received. Every device SHALL adopt the server's map on its next sync. An id the server does not know SHALL answer 400 `invalid_input` naming it; a stored key a client does not know SHALL be kept and ignored. There SHALL be no personal override.

#### Scenario: A manager turns Habits on
- **WHEN** the owner of "Family" turns Habits on and a member's tablet syncs
- **THEN** the tablet shows Habits in Family and in no other workspace

#### Scenario: A member cannot switch
- **WHEN** a `member` of "Family" patches `{"features":{"habits":false}}`
- **THEN** the response is 403 `forbidden` and nothing changes

#### Scenario: Two managers at once
- **WHEN** one admin turns Notes off while the other turns Board on, both before syncing
- **THEN** after both requests Notes is off and Board is on

#### Scenario: Offline
- **WHEN** the device is offline
- **THEN** the Features page shows the stored state with its switches disabled and a line saying a connection is needed, and every screen still hides and shows by the stored state

#### Scenario: Anonymous request
- **WHEN** a request without credentials patches a workspace's features
- **THEN** the response is 401 `unauthorized` and nothing changes

#### Scenario: Unknown feature
- **WHEN** a manager patches `{"features":{"teleport":true}}`
- **THEN** the response is 400 `invalid_input` naming `features.teleport` and nothing changes

### Requirement: Off hides, never deletes
Switching a feature off SHALL write nothing but the workspace's feature map. While it is off, the feature's destinations, palette entries, shortcuts, quick-add phrases, row and panel controls and settings sections SHALL be hidden in that workspace, and its data SHALL stay, sync and keep its values. The REST API, sync, the CLI, MCP, the export, the import, CalDAV, reminder delivery, recurrence and rules SHALL keep working on every feature's data whatever the map says. A direct link to an off feature's page SHALL show the page's empty state with one line saying it is off in this workspace, and Turn on for managers.

#### Scenario: Notes off
- **WHEN** the owner turns Notes off in "Personal" and later turns it on again
- **THEN** while off the sidebar, palette and settings show no Notes, `ot notes list` still lists them, and once on every note is there unchanged

#### Scenario: A field keeps its value
- **WHEN** Energy is off and a task has the energy level "low"
- **THEN** the task page shows no energy control, the API still returns `energy: "low"`, and turning Energy on shows it again

#### Scenario: Old link
- **WHEN** a member opens a bookmarked Habits address while Habits is off
- **THEN** the page says Habits is off in this workspace, with no Turn on for a member

### Requirement: The Features page
Settings SHALL open on a Features page for the open workspace, its title naming the workspace, with one card per switchable feature grouped by Plan, Consistency, Write, Together, and Automation and AI. Each card SHALL show the feature's name, one line, a switch and a Learn more link. Members SHALL see the switches disabled with one line saying the workspace's owner and admins set them. A feature's own settings section SHALL be shown only while the feature is on in the open workspace. Every Settings section SHALL show its scope in its page meta: this workspace, you, this device or the server.

#### Scenario: Settings follow features
- **WHEN** Focus is off in the open workspace
- **THEN** Settings has no Focus section, and turning Focus on shows it

#### Scenario: Scope
- **WHEN** a user opens Settings → Appearance
- **THEN** the section's meta reads "This device" or "You" as the section declares, and the Features page's meta reads "This workspace"

### Requirement: Dependencies switch together
Turning a feature on SHALL also turn on the features it needs, and turning a feature off SHALL also turn off the features that need it, in the same request, with one line naming the others ("Objectives also turns on Weekly review"). Undo SHALL restore the previous map.

#### Scenario: Objectives needs the weekly review
- **WHEN** a manager turns Objectives on while Weekly review is off
- **THEN** both are on after one request, the toast names Weekly review, and Undo turns both off again

#### Scenario: Turning off a needed feature
- **WHEN** a manager turns Next off while Open Loops is on
- **THEN** Open Loops is turned off too and the toast names it

### Requirement: Turn on where you need it
While a feature is off in the open workspace, search and the command palette SHALL offer its managers "Turn on <feature>", which turns it on with its dependencies and offers Undo. Members SHALL see no such entry.

#### Scenario: From the palette
- **WHEN** a manager types "habits" in the palette while Habits is off
- **THEN** "Turn on Habits" is offered, and choosing it shows Habits in the sidebar at once with an Undo toast

#### Scenario: Members
- **WHEN** a member types "habits" in the palette while Habits is off
- **THEN** no Turn on entry is offered

### Requirement: Presets and the first question
There SHALL be three presets: Essential (the basics only), Family (Habits, Calendar, Board and Activity) and Full (every feature). A workspace created before this change SHALL read as Full, except for the six features that had account switches, which SHALL start from its owner's values: Habits on unless it was off; Objectives, Time sectors, Energy and Day parts on only if they were on; Open Loops on only if the method mode was a companion or first. The personal choices of grouping Today by part of the day and Open Loops first SHALL stay account preferences, offered while their feature is on. A workspace created after this change SHALL start from the preset chosen in the first run's step 2 or in New workspace, which asks "Who is it for?" with Essential preselected, Family and Full.

#### Scenario: Upgrade changes no screen
- **WHEN** a server is upgraded where the owner had Habits off, Energy on and the method mode `lists`
- **THEN** their default workspace shows no Habits and no Open Loops, shows Energy, and shows every other feature as before

#### Scenario: A new workspace starts small
- **WHEN** a user creates "Groceries" and keeps Essential
- **THEN** Groceries shows the basics only, and the user's other workspaces keep their features

#### Scenario: Family
- **WHEN** a user creates "Home" with Family
- **THEN** Home shows Habits, the calendar, boards and Activity, and no Notes, Open Loops, Objectives or assistant

### Requirement: Views across workspaces follow the open workspace
The palette, the bell, the unread count of Updates, reminders and widgets, which read every workspace, SHALL hide what the open workspace hides. An entity from another workspace SHALL open in its own workspace, with that workspace's features.

#### Scenario: A reminder from another workspace
- **WHEN** a habit's reminder from "Home" fires while "Work", which has Habits off, is open
- **THEN** the reminder shows, and opening it switches to Home, where Habits shows

### Requirement: Features through the API
`GET /api/v1/workspaces` and `GET /api/v1/workspaces/{id}` SHALL return each workspace's `features` as the full map of registry ids to booleans, with presets resolved. MCP's workspace list SHALL return it too. Changing features SHALL require a session or a `full` or `admin` token and the owner or admin role, and SHALL be refused for `read` and `agent` tokens and on a demo instance as the workspace routes are.

#### Scenario: Read the map
- **WHEN** a member lists workspaces
- **THEN** each workspace carries `features` with every registry id

#### Scenario: Read token
- **WHEN** a `read` token patches a workspace's features
- **THEN** the response is 403 `insufficient_scope` and nothing changes
