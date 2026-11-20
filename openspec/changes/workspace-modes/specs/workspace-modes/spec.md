## ADDED Requirements

### Requirement: The mode format
A mode SHALL be a JSON document with `opentodo_mode` (the format version, 1), `name` (1 to 60 characters), and optionally `features` (registry ids mapped to booleans), `sidebar` (up to 6 destination ids, in order), `templates` (up to 10 entries, each a built-in template slug or an embedded template in the template format) and `defaults` (keys from a closed list of display preferences, each value one that preference accepts). A mode SHALL be data only: it SHALL never be evaluated as code, no field SHALL be fetched or followed, and a template slug SHALL refer only to the library bundled with the app. A document over 256 KB, invalid JSON, a missing or invalid `name`, a version above 1, or an invalid value SHALL be refused naming the field. Unknown top-level keys, unknown feature ids and unknown `defaults` keys SHALL be ignored and listed as ignored. A feature absent from `features` SHALL read as off; the basics SHALL never appear in it.

#### Scenario: A newer version
- **WHEN** a person pastes a mode with `"opentodo_mode": 2`
- **THEN** it is refused with a message that it was made by a newer OpenTodo, and nothing changes

#### Scenario: Unknown keys
- **WHEN** a mode carries `"theme": "dark"` and the feature id `"teleport": true`
- **THEN** the preview lists both as ignored, and applying changes nothing for them

#### Scenario: A link is not followed
- **WHEN** an embedded template's description contains an https link
- **THEN** importing and applying make no network request, and the link stays text in the created project's description

### Requirement: Import with a preview and one Undo
A workspace's owner and admins SHALL import a mode from a file or pasted text into the open workspace. Before anything changes, the dialog SHALL show what the mode turns on, what it hides, the lists it creates, the sidebar and defaults it sets, and what it ignores. Applying SHALL set the workspace's `features`, `sidebar` and `defaults` through the workspace route and then create the template projects in the workspace through the op log, and SHALL offer one Undo that restores the three fields and moves the created projects to the Trash. Applying SHALL need a connection; offline, Apply SHALL be disabled with a line saying a connection is needed. If the workspace route fails, no project SHALL be created. Members SHALL not be offered import.

#### Scenario: Apply Family
- **WHEN** the owner of "Home" imports `family.json` and applies it
- **THEN** Home shows Habits, the calendar, boards and Activity and hides the rest, the "Household chores" project exists in Home, and one Undo returns Home's features, sidebar and defaults to what they were and moves that project to the Trash

#### Scenario: Offline
- **WHEN** the device is offline
- **THEN** the preview still shows, Apply is disabled, and a line says a connection is needed

#### Scenario: A member
- **WHEN** a `member` opens the Features page
- **THEN** no Import, Save as mode or Apply to is offered

### Requirement: Workspace sidebar and defaults as fallbacks
A workspace SHALL hold an optional `sidebar` and optional `defaults`, set only by its managers, as server directory data delivered with the workspace and cached. On a member's devices, a preference the member has set SHALL win; an empty one SHALL read the workspace's value, then the app's default. `PATCH /api/v1/workspaces/{id}` SHALL accept `sidebar` and `defaults` validated as in a mode, require a session or a `full` or `admin` token and the owner or admin role, refuse `read` and `agent` tokens and demo accounts as the workspace routes do, and answer 400 `invalid_input` naming a bad field.

#### Scenario: A personal sidebar wins
- **WHEN** Home's sidebar is Today, Upcoming, Calendar and Habits, and a member has chosen their own sidebar
- **THEN** that member keeps theirs, while a member who never chose one sees Home's

#### Scenario: Anonymous request
- **WHEN** a request without credentials patches a workspace's `sidebar`
- **THEN** the response is 401 `unauthorized` and nothing changes

#### Scenario: Invalid defaults
- **WHEN** a manager patches `{"defaults":{"add_position":"sideways"}}`
- **THEN** the response is 400 `invalid_input` naming `defaults.add_position`

### Requirement: Save a setup and apply it elsewhere
A workspace's managers SHALL save the open workspace's setup as a mode: its features, sidebar and defaults, under a name they type, never with projects, tasks or other content. A saved mode SHALL be kept in the user's saved modes, a personal synced list readable offline, where creating and deleting one are ops that converge by last-writer-wins, and SHALL be downloadable as a `.json` file. From the saved modes the user SHALL apply a mode to any workspace they manage, through the same preview and Undo.

#### Scenario: Save and reuse
- **WHEN** the owner saves "Work" as the mode "Lean work" and applies it to the new workspace "Side project"
- **THEN** the preview shows Lean work's features, Side project takes them after Apply, and no project or task from Work appears in Side project

#### Scenario: Saved offline
- **WHEN** the device is offline and the owner saves a mode
- **THEN** it appears in the saved modes at once and on the user's other devices after sync

### Requirement: Official modes
Essential, Family and Full SHALL be mode files in `modes/`, bundled with the app and validated by `make modes-check` like any imported mode, which SHALL also check that every template slug they name exists. The first run's "Who is it for?" and New workspace SHALL apply these files. Adding a community mode SHALL be a pull request adding one file that passes the check.

#### Scenario: A broken official mode
- **WHEN** `modes/family.json` names the template slug `chores-v2`, which does not exist
- **THEN** `make modes-check` fails naming the file and `templates[0]`
