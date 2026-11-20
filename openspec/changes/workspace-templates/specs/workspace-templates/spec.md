## ADDED Requirements

### Requirement: The kit
A *kit* SHALL be a template of a workspace's setup, and "Kit" SHALL be its user-facing name ("Family kit", "Save as kit"), defined here once and used by every interface string through the catalog. A kit SHALL be one document with `opentodo_kit` (the envelope version, 1), the descriptive fields of a project template (title, summary, description, steps, category, icon, author, reviewed), and optionally `features` (the registry ids that are on), `sidebar` (a sidebar order in the `sidebar_layout` format), `views` (saved views in the view entity's fields), `projects` (library slugs or embedded project templates), `routines` (library slugs or embedded routine templates) and `theme` (a theme document or a built-in theme id). Each part SHALL be validated by its own format's rules. A kit SHALL be data only: it SHALL never be evaluated, no part SHALL be fetched, and a slug SHALL refer only to the library bundled with the app. A document over 256 KB, a version above 1, or an invalid part SHALL be refused naming the part; unknown keys SHALL be ignored and listed as ignored.

#### Scenario: A newer version
- **WHEN** a person pastes a kit with `"opentodo_kit": 2`
- **THEN** it is refused as made by a newer OpenTodo and nothing changes

#### Scenario: A theme that carries CSS
- **WHEN** a kit's theme gives the canvas as `url(https://example.com/x.png)`
- **THEN** the kit is refused naming `theme`, and no request leaves the device

#### Scenario: Unknown keys
- **WHEN** a kit carries `"widgets": []`
- **THEN** the preview lists it as not in this version and applying ignores it

### Requirement: Use a kit with a preview and one Undo
Kits SHALL appear in the template library dialog beside project templates, with the same preview and Use this, and SHALL be openable from a file or pasted text. Only the workspace's owner and admins SHALL use a kit; members SHALL see kits without Use this. Before anything changes, the preview SHALL say in plain sentences what turns on, what is hidden, how many lists, views and routines it creates, which routines arrive switched off, whether it changes the person's sidebar and theme, and what is ignored. Use this SHALL set the workspace's features through the workspace route (every feature it does not list turned off) and then, in one batch of operations, create its views, projects and routines in the workspace and set the applying person's sidebar order and theme; it SHALL offer one Undo that restores the features, the sidebar order and the theme choice and moves what was created to the Trash. It SHALL need a connection; offline, Use this SHALL be disabled with a line saying a connection is needed. If the workspace route fails, nothing SHALL be created. Afterwards the workspace SHALL keep no reference to the kit.

#### Scenario: Use Family
- **WHEN** the owner of "Home" uses the Family kit
- **THEN** the preview reads like "Turns on Build habits, See my days on a calendar, Move cards on a board, See what others changed. Hides the rest. Creates 1 list and 1 view.", and after Use this Home shows those features, the Household chores list and the Chores this week view, and one Undo puts Home back as it was

#### Scenario: A member
- **WHEN** a `member` opens the Family kit in the library
- **THEN** the preview shows, without Use this, with a line saying the owner and admins set up the workspace

#### Scenario: Offline
- **WHEN** the device is offline
- **THEN** the preview shows and Use this is disabled with a connection line

#### Scenario: No state afterwards
- **WHEN** the owner uses Family and then turns on Keep notes
- **THEN** nothing in the app says the workspace uses Family or was modified

### Requirement: Routines that talk to the outside arrive off
A routine in a kit that sends a webhook, sends email or notifies through delivery channels SHALL be created switched off, and the preview SHALL say how many arrive off and why.

#### Scenario: A digest routine
- **WHEN** a kit holds the Friday digest email routine
- **THEN** the preview says it arrives switched off because it sends email, and after Use this it exists switched off

### Requirement: Save as kit
A workspace's managers SHALL save the open workspace's setup as a kit file: its features, their own sidebar order, the workspace's saved views and routines (as routine templates, with webhooks, people and projects turned into choices), their chosen custom theme if any, and only the projects they tick, each saved as a project template. The result SHALL download as a `.kit.json` file that the library dialog accepts.

#### Scenario: Save and use elsewhere
- **WHEN** the owner saves "Work" as a kit without ticking a project and uses the file in "Side project"
- **THEN** Side project takes Work's features, views and routines, and no project or task of Work appears in it

### Requirement: Official kits
Essential, Family, Full and Open Loops SHALL be kits in the repository beside the project, routine and note templates, bundled with the app and validated in CI by the library's check, which SHALL fail naming the file and the part for an invalid kit or a slug that does not exist. Open Loops SHALL carry the method's features and navigation order. The first run's question SHALL offer Essential (preselected), Family, Full and Open Loops. A community kit SHALL be added by a pull request with one folder that passes the check.

#### Scenario: A broken official kit
- **WHEN** `templates/kits/family/kit.yaml` names the project slug `chores-v2`, which does not exist
- **THEN** the library check fails naming the file and `projects[0]`

#### Scenario: Open Loops from the first run
- **WHEN** a new owner chooses Open Loops in the first run
- **THEN** their workspace has Next, Weekly review and Open Loops on, and their sidebar shows Loop home first
