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
- switching from Todoist, Things, TickTick and Linear
- the Open Loops method

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

#### Scenario: Method page per move
- **WHEN** the docs are built
- **THEN** each of the five moves has a page that declares the screens which reference it, and the docs check fails if a screen's method link names a move without a page

#### Scenario: Coming from GTD
- **WHEN** a GTD user opens "Coming from GTD"
- **THEN** it lists contexts, next actions, waiting for, someday/maybe, tickler, projects, areas of focus and the weekly review with the Open Loops term and the screen for each

### Requirement: Documentation website
Every release SHALL ship the documentation as a static website in its site bundle, for the public website to serve under `/docs/`, grouped by audience, with navigation, an "on this page" list, search that runs in the browser over a prebuilt index, the version described, and an "Edit this page" link. Pages SHALL be readable without JavaScript, and no search text SHALL be sent anywhere.

#### Scenario: Search
- **WHEN** a visitor types "recurring" in the docs search
- **THEN** matching sections of the recurring tasks and quick add guides are listed with a snippet, and selecting one opens that section

#### Scenario: No JavaScript
- **WHEN** a visitor opens a docs page with JavaScript disabled
- **THEN** the content, navigation and links work; only search is unavailable

#### Scenario: Released version only
- **WHEN** the public website serves the docs of the latest release
- **THEN** a guide changed on the main branch after that release shows its released text until the next release

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
