## MODIFIED Requirements

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
