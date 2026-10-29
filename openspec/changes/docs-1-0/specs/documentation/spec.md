## MODIFIED Requirements

### Requirement: User guide
The documentation SHALL include a guide for people using the app, written as tasks rather than reference. It SHALL cover:
- getting started
- tasks and projects
- views
- sections and boards
- labels and filters
- recurring tasks and reminders
- time blocking
- sharing and comments
- notifications
- offline use and sync
- installing the app
- keyboard shortcuts
- account security
- import and export
- trash and history
- settings
- troubleshooting
- switching from Todoist, Things, TickTick, Linear, Microsoft To Do, Google Tasks, Apple Reminders, Trello, Asana, Any.do, OmniFocus, Vikunja, Notion, Super Productivity and Tududi
- the Open Loops method

The switch guides have three further rules:
- A switch guide for an app that has no export of its own (Microsoft To Do, Apple Reminders, Any.do) SHALL give the exact script, Shortcut or data request that produces the file the importer reads, and name what that file cannot carry.
- Every switch guide SHALL have an `#export` section with the export steps, which the Import screen shows inline.
- The Apple Reminders guide SHALL present the CalDAV connection first.

The method chapter SHALL hold one overview page, one page per move, one page each for Places, Rhythms and Horizons, "Set up in ten minutes", and "Coming from GTD". "Coming from GTD" SHALL map GTD terms to Open Loops terms and state that Open Loops is inspired by GTD and is not affiliated with its authors. Every term on these pages SHALL be the one the app shows for the same id.

#### Scenario: First steps
- **WHEN** a new user opens Getting started
- **THEN** it walks them from signing in to adding, scheduling and completing a task, with screenshots, in a few minutes of reading

#### Scenario: Keyboard reference matches the app
- **WHEN** a shortcut is added to the app's shortcut table
- **THEN** the `?` overlay and the keyboard guide both list it after the next build, with no separate edit

#### Scenario: Switching from another app
- **WHEN** a Todoist user opens the Todoist switch guide on the website or in the in-app Help
- **THEN** it shows how to export from Todoist, how to import the file, what carries over, and what is dropped with a warning, matching the importer's documented mapping

#### Scenario: Switching from an app without an export
- **WHEN** a Microsoft To Do user opens the Microsoft To Do switch guide
- **THEN** it gives the script that writes the file, the import steps, what carries over and what is dropped, and the importer's documented mapping matches the file that script produces

#### Scenario: Method page per move
- **WHEN** the docs are built
- **THEN** each of the five moves has a page that declares the screens which reference it, and the docs check fails if a screen's method link names a move without a page

#### Scenario: Coming from GTD
- **WHEN** a GTD user opens "Coming from GTD"
- **THEN** it lists contexts, next actions, waiting for, someday/maybe, tickler, projects, areas of focus and the weekly review with the Open Loops term and the screen for each

#### Scenario: Switch guide without an export section
- **WHEN** a switch guide has no `#export` heading
- **THEN** the docs check fails and names the guide

## ADDED Requirements

### Requirement: Every screen has a guide
The app SHALL export one list of screen ids: every route of the app, every Settings section, and every dialog with a Help action. A unit test SHALL fail when a route or Settings section is missing from the list. The docs build SHALL write the list to the generated help files, and the docs check SHALL fail when a screen id is declared by no page's `screens:` front matter. A page MAY declare several screens, and a screen MAY be declared by several pages.

#### Scenario: New screen without a page
- **WHEN** a change adds a Settings section `settings/telegram` and no docs page declares it
- **THEN** the docs check fails and names `settings/telegram`

#### Scenario: Route missing from the list
- **WHEN** a change adds a route to the app's router without adding its id to the screen list
- **THEN** the web unit tests fail and name the route

### Requirement: Self-hosting handbook
The documentation SHALL hold a self-hosting handbook, `docs/self-hosting/README.md`, with eight ordered sections:
1. install, with a table of every platform page;
2. first run;
3. reverse proxy and TLS, with Caddy, nginx and Traefik examples;
4. backups and a restore drill, which restores into a scratch container and checks the health endpoint and the task count;
5. upgrading, linking the published upgrade policy;
6. monitoring;
7. hardening, as a checklist;
8. sizing, with the measured memory and disk numbers of the performance budgets.

Every platform page under `docs/self-hosting/` SHALL be linked from the install table, and the docs check SHALL fail when one is not.

#### Scenario: Operator path
- **WHEN** an operator opens the handbook
- **THEN** they can go from an empty host to a running server with TLS, a tested restore and a monitored health endpoint by following the eight sections in order

#### Scenario: Orphan platform page
- **WHEN** a contributor adds `docs/self-hosting/nixos.md` without a row in the install table
- **THEN** the docs check fails and names the page

### Requirement: Configuration reference is complete
`docs/self-hosting/configuration.md` SHALL list every `OPENTODO_*` environment variable the server or the CLI reads, each with its default, an example and a link to the page that explains it. A Go test SHALL collect the variable names read by the code under `cmd/` and `internal/` and SHALL fail when a variable is read but not listed, or listed but never read. No variable SHALL be mandatory, and the page SHALL say so first.

#### Scenario: Undocumented variable
- **WHEN** a change makes `internal/maps` read `OPENTODO_MAPS_CACHE_MB` without a row in the reference
- **THEN** `go test ./internal/config/...` fails and names the variable and the file that reads it

#### Scenario: Stale row
- **WHEN** a variable is removed from the code but its row stays
- **THEN** the same test fails and names the row

### Requirement: API error codes and examples are checked
`docs/api.md` SHALL have an error code table that lists every code the server can send, with its HTTP status and meaning. A test SHALL fail when a code in the client's server error code list is missing from the table, or a code in the table is missing from that list. Request examples in `docs/api.md` marked to run SHALL be executed in order against an in-process test server with a signed-in owner and seeded data. The test SHALL fail when the documented status differs from the response, or when a documented top-level response key is missing. There SHALL be at least one executed example for each of the tasks, projects, sync, import, tokens and settings route groups. The examples SHALL include one request without credentials, documented with its 401 `unauthorized` response, and one invalid request, documented with its 400 `invalid_input` response.

#### Scenario: Code without documentation
- **WHEN** a handler starts sending `telegram_chat_invalid` and the code is added to the client's list but not to `docs/api.md`
- **THEN** the API docs test fails and names the code

#### Scenario: Example drifts
- **WHEN** a documented `POST /api/v1/tasks` example says 201 and the route answers 200
- **THEN** the API docs test fails and names the example's line in `docs/api.md`

#### Scenario: Unauthenticated example
- **WHEN** the executed examples run
- **THEN** the documented request without credentials receives a 401 `unauthorized` error, as its block states

### Requirement: Contributor guide
`CONTRIBUTING.md` SHALL link a contributor guide under `docs/contributing/` with seven pages:
- the first contribution, a walkthrough that fits in 30 minutes;
- an architecture tour following one task edit from the interface through the operation log and back;
- the OpenSpec workflow;
- tests and checks;
- adding a language;
- adding an importer;
- adding a shared Go and TypeScript contract.

Each page SHALL name the commands it relies on, and each command SHALL be a target of the `Makefile` or a script in the repository. A repository check SHALL fail when a page names a `make` target that does not exist.

#### Scenario: Newcomer finds the importer steps
- **WHEN** a contributor wants to add an importer for a new app
- **THEN** `CONTRIBUTING.md` links "Add an importer", which lists the profile, the detection signature, the sanitiser, the fixtures and goldens, the switch guide with its export section, and the matrix row

#### Scenario: Renamed make target
- **WHEN** the `Makefile` renames `i18n-check` and a contributor page still says `make i18n-check`
- **THEN** the repository check fails and names the page

### Requirement: Public roadmap page
The documentation SHALL include a roadmap page, generated at docs build from the milestone tables of `ROADMAP.md` and the OpenSpec state of each named change. Each change SHALL be shown with one of these statuses:
- "Shipped in x.y" when archived, with the version from the changelog where it is named;
- "Shipped" when archived and no changelog section names it;
- "In progress (n of m)" when its tasks are partly checked;
- "Planned" otherwise.

The page SHALL be on the docs website and in the in-app Help under an "About" group of the full guide list. The status SHALL be text, never colour alone. The docs check SHALL fail when the generated page is stale.

#### Scenario: A change ships
- **WHEN** `time-sectors` is archived and the 0.21.0 changelog section names it
- **THEN** after the next docs build the roadmap page shows "Shipped in 0.21" for it

#### Scenario: Stale page
- **WHEN** a pull request checks tasks in `openspec/changes/plan-objectives/tasks.md` without rebuilding the docs
- **THEN** the docs check fails because the generated roadmap is stale

#### Scenario: Offline Help
- **WHEN** the installed app is offline and the user opens Help, then About, then Roadmap
- **THEN** the roadmap of the version the app runs is shown from the bundled help
