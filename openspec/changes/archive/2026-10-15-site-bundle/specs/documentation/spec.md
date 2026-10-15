# Spec Delta

## MODIFIED Requirements

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
