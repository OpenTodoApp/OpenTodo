## MODIFIED Requirements

### Requirement: Documentation website
Every release SHALL ship the documentation as a static website in its site bundle, for the public website to serve under `/docs/`, grouped by audience, with navigation, an "on this page" list, search that runs in the browser over a prebuilt index, the version described, and an "Edit this page" link. Pages SHALL be readable without JavaScript, and no search text SHALL be sent anywhere.

Every page SHALL share the public website's top-level header: the OpenTodo brand linking to the website's home page, links to Features, Compare, What it costs, Self-host, Help and Docs, a GitHub icon link and a "Try the demo" button, on the same surface colour as the website's header in light and in dark, collapsing below 768 px into a menu that opens without JavaScript. Colours SHALL come from the app's generated `--ot-*` tokens, and fonts SHALL be served from the documentation site itself, so a docs page makes no request for fonts or stylesheets to another origin.

#### Scenario: Search
- **WHEN** a visitor types "recurring" in the docs search
- **THEN** matching sections of the recurring tasks and quick add guides are listed with a snippet, and selecting one opens that section

#### Scenario: No JavaScript
- **WHEN** a visitor opens a docs page with JavaScript disabled
- **THEN** the content, navigation and links work; only search is unavailable

#### Scenario: Released version only
- **WHEN** the public website serves the docs of the latest release
- **THEN** a guide changed on the main branch after that release shows its released text until the next release

#### Scenario: Same header as the website
- **WHEN** a visitor goes from the website's `/self-host/` page to `/docs/reminders/` at 1280 px wide in light
- **THEN** the header shows the same brand, the same links in the same order and the same "Try the demo" button on the same surface colour, and the Docs link is marked as the current section

#### Scenario: Phone menu without JavaScript
- **WHEN** a visitor opens a docs page at 360 px wide with JavaScript disabled and opens the menu
- **THEN** the header links are shown and work, and the page does not scroll sideways

#### Scenario: No font request to another origin
- **WHEN** a docs page is loaded and its network requests are recorded
- **THEN** every font and stylesheet request goes to the page's own origin

#### Scenario: Colours follow the app
- **WHEN** an `--ot-*` accent token changes in `web/src/index.css` and the site bundle is rebuilt
- **THEN** the docs site's links and buttons use the new value without an edit to the docs stylesheet

### Requirement: Documentation stays complete and correct
The docs check SHALL run in CI and fail when generated in-app help is stale, a link between pages or to a heading does not resolve, an image is missing or has no alt text, a capability in `openspec/specs/` is covered by no page, a help link in the app points to a section that does not exist, the documentation website cannot be built, a page for users or administrators names an OpenSpec change in its text, or the documentation website references a font or stylesheet on another origin.

#### Scenario: Broken anchor
- **WHEN** a page links to `filters.md#saved-views` and that heading was renamed
- **THEN** CI fails and reports the link and the page it is on

#### Scenario: Uncovered capability
- **WHEN** a change adds `openspec/specs/time-tracking/` and no page lists it
- **THEN** CI fails until a page covers it

#### Scenario: No committed website output
- **WHEN** a docs page changes
- **THEN** the commit contains the Markdown and the regenerated in-app help only, and the documentation website is built by CI rather than committed

#### Scenario: Planning vocabulary in a user guide
- **WHEN** a page with `audience: user` contains "OpenSpec change `reminders`"
- **THEN** the docs check fails and names the page and the line, while the same phrase in a page with `audience: developer` passes

#### Scenario: External font
- **WHEN** the docs site's head links a stylesheet on `fonts.googleapis.com`
- **THEN** the docs check fails and names the URL
