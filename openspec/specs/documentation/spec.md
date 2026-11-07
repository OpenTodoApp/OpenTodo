# documentation Specification

## Purpose
Defines how OpenTodo is documented: one Markdown source in `docs/` that builds the docs website and the in-app Help, the user guide it must contain, the checks that keep it complete and correct, contextual help in the app, and the accessibility both renderings meet.

## Requirements

### Requirement: One documentation source
All documentation SHALL be written once, as Markdown under `docs/` with front matter naming its title, summary, audience (user, admin or developer), the capabilities it covers and the app screens it explains. The docs website and the in-app help SHALL be generated from these files at build time and never edited by hand.

#### Scenario: Edit once, both update
- **WHEN** a contributor changes a sentence in `docs/sharing.md` and runs the docs build
- **THEN** the website page and the in-app help both show the new sentence

#### Scenario: Missing front matter
- **WHEN** a page under `docs/` has no front matter
- **THEN** the docs check fails and names the file

### Requirement: Documentation stays complete and correct
The docs check SHALL run in CI and fail when generated in-app help is stale, a link between pages or to a heading does not resolve, an image is missing or has no alt text, a capability in `openspec/specs/` is covered by no page, a help link in the app points to a section that does not exist, or the documentation website cannot be built.

#### Scenario: Broken anchor
- **WHEN** a page links to `filters.md#saved-views` and that heading was renamed
- **THEN** CI fails and reports the link and the page it is on

#### Scenario: Uncovered capability
- **WHEN** a change adds `openspec/specs/time-tracking/` and no page lists it
- **THEN** CI fails until a page covers it

#### Scenario: No committed website output
- **WHEN** a docs page changes
- **THEN** the commit contains the Markdown and the regenerated in-app help only, and the documentation website is built by CI rather than committed

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

### Requirement: Documentation website
Every release SHALL ship the documentation as a static website in its site bundle, for the public website to serve under `/docs/`, with navigation, an "on this page" list, search that runs in the browser over a prebuilt index, the version described, and an "Edit this page" link. Every page SHALL belong to one of six entry points (Get started, Use OpenTodo, Self-host, Integrate, Reference, Under the hood). The landing page SHALL show the search and the six entry points, each with a one-line description, its key pages and a link to its section page; each section page SHALL list every page of its entry point with its summary, nesting the pages the docs index places under a topic guide. The sidebar SHALL follow the entry points, and every page SHALL name its entry point in a breadcrumb. The header and footer SHALL carry the public website's navigation (Features, Learn, Docs, Blog, the repository and the demo) so the docs read as part of that site. Pages SHALL be readable without JavaScript, no search text SHALL be sent anywhere, and the pages SHALL request nothing from a third party (fonts included).

#### Scenario: Search
- **WHEN** a visitor types "recurring" in the docs search
- **THEN** matching sections of the recurring tasks and quick add guides are listed with a snippet, and selecting one opens that section

#### Scenario: No JavaScript
- **WHEN** a visitor opens a docs page with JavaScript disabled
- **THEN** the content, navigation and links work; only search is unavailable

#### Scenario: Released version only
- **WHEN** the public website serves the docs of the latest release
- **THEN** a guide changed on the main branch after that release shows its released text until the next release

#### Scenario: From the landing to a deep page
- **WHEN** a visitor on `/docs/` chooses "All pages" under Use OpenTodo
- **THEN** `/docs/use/` lists every user guide with its summary, with Repeat rules nested under Recurring tasks and reminders

#### Scenario: Website navigation
- **WHEN** a visitor on any docs page at 390 px wide without JavaScript opens the header menu
- **THEN** it links Features, Learn, Docs and Blog on open-todo.app, and Try the demo stays visible in the bar

#### Scenario: No third-party request
- **WHEN** a docs page is opened with every request outside its own origin blocked
- **THEN** the page renders completely and none of its links, styles or fonts was requested from another host

### Requirement: Help inside the app
The app SHALL include a Help view with the user guide of its own version, available offline and searchable, reachable from the sidebar footer, every page header, the cheat sheet and `g` then `?`. Each guide page SHALL be under 600 words with a screenshot first. Links between guides SHALL stay in the app; admin and developer pages SHALL open on the website. The help content SHALL load only when Help is opened.

#### Scenario: Offline help
- **WHEN** the installed app is offline and the user opens Help and searches for "board"
- **THEN** the sections about boards are found and shown

#### Scenario: Version match
- **WHEN** a server runs an older release than the website describes
- **THEN** its in-app Help shows the guide for the version it runs

### Requirement: Help landing page
The Help view's landing SHALL open on the search field, followed by task-shaped entries, with the full guide list below. The entries are:
- "Add a task with a date"
- "Repeat a task"
- "Share a project"
- "Sync a calendar"
- "Import from another app"
- "Install the app"
- "Use the keyboard"
- "Run your own server"
- "Learn Open Loops"

#### Scenario: Task-shaped landing
- **WHEN** the user opens Help
- **THEN** focus is in the search field and the nine task entries are visible before any guide list

#### Scenario: Learn Open Loops
- **WHEN** the user activates "Learn Open Loops"
- **THEN** the method overview opens, with its loop diagram first and links to each move

### Requirement: Contextual help
Every page header, the task panel menu, the share dialog, the import screen and the Learn more link of a Settings card SHALL offer a Help action that opens the matching guide section beside the current screen (a sheet on phones) without closing it or discarding what the user entered. The quick add SHALL carry no help link of its own: in a task list the page header's Help action is the one help control, it opens the view's guide section, and that section SHALL link to the quick-add guide in its first paragraph, so the syntax is one activation away from any list. The Help landing's "Add a task with a date" entry SHALL open the same guide. Nothing about help use SHALL be stored on the device or the account. The in-app guide is local, so this works offline. The guide section a Settings card's Learn more opens SHALL hold the explanation that left the card, so no sentence of the earlier card text is lost, and each such screen id SHALL be declared by exactly one guide page.

#### Scenario: Help while sharing
- **WHEN** a user has typed an email in the share dialog and selects Help
- **THEN** the sharing section opens beside the dialog, and closing it returns to the dialog with the email still there

#### Scenario: Help from the board
- **WHEN** the user activates Help in a project's page header while the board is shown
- **THEN** the sections and boards guide opens in the panel slot and the board stays as it was

#### Scenario: Quick-add syntax from the Inbox
- **WHEN** a user with "Call the dentist tomorrow" typed in the Inbox's quick add activates the header's Help action and then the quick-add link in the section that opens
- **THEN** the quick-add guide is shown in the Help panel and the typed line is still in the field

#### Scenario: No help under the field
- **WHEN** a new browser opens any task list
- **THEN** no help link is rendered under the quick add, on the first add or any later one

#### Scenario: Link kept in check
- **WHEN** a list view's guide section loses its link to the quick-add guide
- **THEN** the docs check fails and names the section

#### Scenario: Learn more from a card
- **WHEN** a user activates Learn more on the Recent activity card
- **THEN** the "Check recent sign-ins" section of the account security guide opens beside Settings and says what to do about a sign-in you do not recognise, which the card no longer says in full

#### Scenario: Screen id without a page
- **WHEN** a change adds a Learn more link for screen `settings/nonsense` that no page declares
- **THEN** the docs check fails naming the file that links it

#### Scenario: Guide page stays under the limit
- **WHEN** the moved sentences are added to the Settings: App guide
- **THEN** the page stays under 600 words, as the docs check requires, with the longer explanations on the feature pages their cards link to

### Requirement: Accessible documentation
The docs website and the in-app Help SHALL meet WCAG 2.2 AA: landmarks, one top heading and no skipped levels, skip link, visible focus, 4.5:1 contrast in light and dark, descriptive link text, header cells in tables, reduced motion respected, 200% zoom and 360 px width without horizontal scroll, and search results announced to screen readers. CI SHALL check this automatically.

#### Scenario: Screen reader search
- **WHEN** a screen reader user searches the docs
- **THEN** the number of results is announced and each result is reachable with Tab and opens with Enter

#### Scenario: Automated check
- **WHEN** a change introduces an image without alt text or a contrast failure on a docs page or the Help view
- **THEN** the CI accessibility check fails

### Requirement: Contributor guide names every server package
`AGENTS.md` SHALL name every Go package under `internal/` with what it does, and `docs/architecture.md` SHALL have a row for every top-level package under `internal/` and mention each sub-package. `AGENTS.md` SHALL list exactly the API token scopes the server defines and SHALL describe what each package can write, so an agent does not treat a package with write paths as read-only. A repository check run by `make check` and CI SHALL fail when any of this drifts.

#### Scenario: A new package without documentation
- **WHEN** a change adds `internal/foo` without naming it in `AGENTS.md` or adding a row to `docs/architecture.md`
- **THEN** `make check` fails and names `internal/foo`

#### Scenario: A new token scope
- **WHEN** `internal/auth` gains a token scope that `AGENTS.md` does not list
- **THEN** `make check` fails until the scope list matches

#### Scenario: MCP described as read-only
- **WHEN** `AGENTS.md` describes `internal/mcp` as read-only
- **THEN** `make check` fails, because the MCP server has write tools for `agent` tokens

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
- "Shipped in x.y" when archived, with the oldest release of the changelog that names it, or else the last release on the first release date on or after the change's archive date;
- "Shipped" when archived after the last release;
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
