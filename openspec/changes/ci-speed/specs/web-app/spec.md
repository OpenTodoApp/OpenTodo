## MODIFIED Requirements

### Requirement: Interface audit tour
The repository SHALL provide one command that opens every entry of the screen inventory on the built web app with a seeded account at 360, 768 and 1280 px wide, in light and dark, in English and German, saves a screenshot of each, measures the interface budget (rows of chrome above a list's first item, task properties visible by default, primary sidebar destinations, vertical scroll regions), WCAG 2.2 AA violations, each audited interface rule (OpenSpec `design-system` "Audited interface rules"), the time from navigation to the first task row rendered from the local copy while the server is unreachable, and story coverage of the core screens, and writes a JSON report and an HTML contact sheet. The tour SHALL change nothing in the app or the repository, SHALL run in CI as a non-blocking job that uploads the report at least nightly on the default branch and on demand on any branch, without delaying the checks of a pull request or the image publishing of a push, and SHALL have a strict mode that fails on budget, overflow, story-coverage and reduced-motion violations once the maintainer turns it on. Under reduced motion the tour SHALL watch every overlay of the inventory as it opens, at 1280 px with a mouse and at 360 px as a touch device, completing a task in Today, and dragging a card to the next board column, a task to the next day of the Plan and a block down an hour in the Week, from before the action until it settles, so a movement that ends before a snapshot is still reported. Each violation SHALL name the screen, the width, the theme, the language, the rule and the element.

#### Scenario: Full tour on a code change
- **WHEN** a change under `web/src` is merged and the nightly run starts on the default branch
- **THEN** the audit job uploads a report with one screenshot per inventory entry, width, theme and language, and a ranked list of violations, without failing anything

#### Scenario: Tour on demand for a pull request
- **WHEN** a contributor starts the audit workflow on a pull request's branch
- **THEN** it uploads the same report for that branch, and the pull request's checks neither wait for it nor fail on it

#### Scenario: Strict mode on a budget violation
- **WHEN** strict mode is on and a screen renders three rows of chrome above its first task at 1280 px
- **THEN** the audit fails naming the screen, the width and the rule

#### Scenario: Server unreachable on a second visit
- **WHEN** the tour loads the Inbox a second time with the server stopped
- **THEN** the report records the time to the first task row rendered from the local copy, and the screen is captured as it is shown offline

#### Scenario: Story coverage in the report
- **WHEN** a core screen has no story
- **THEN** the report lists it under story coverage, and strict mode fails on it

#### Scenario: Tour on a developer's machine
- **WHEN** a contributor runs the audit command with a Chromium on disk
- **THEN** the report and the contact sheet are written to a directory the command names, and the command exits non-zero only in strict mode

#### Scenario: A sheet slides under reduced motion
- **WHEN** a change gives the phone task sheet a 120 ms slide without a reduced-motion rule and the tour runs
- **THEN** the report lists a movement under reduced motion for the task panel at 360 px naming the sheet and `transform`, and strict mode fails on it

#### Scenario: A drag placeholder moves
- **WHEN** the board's drop placeholder grows its height while a card is dragged under reduced motion
- **THEN** the report lists a movement for the board drag naming the placeholder and `height`

#### Scenario: A push to main does not wait for the audit
- **WHEN** a pull request is merged and CI runs for the push to `main`
- **THEN** the push run does not run the audit and publishes the image once its other checks passed, and the next nightly audit covers `main`
