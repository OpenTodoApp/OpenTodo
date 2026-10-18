## ADDED Requirements

### Requirement: Component size limit
The web app's checks SHALL fail when a function in the app's source (a component, hook or helper; tests, stories and test kits excepted) is longer than 250 lines. A function that was already longer when the limit came in SHALL be listed by file with a ceiling and the reason it is long; a listed ceiling SHALL NOT be raised, and the entry SHALL be removed once the function fits the limit. Splitting a screen to meet the limit SHALL NOT change what it shows, what its keys do or what it writes.

#### Scenario: New long component fails the check
- **WHEN** a change adds a component whose function is longer than 250 lines
- **THEN** the web lint fails and names the file, the line and the function's length

#### Scenario: Allow-listed function grows
- **WHEN** a change makes an allow-listed function longer than its listed ceiling
- **THEN** the web lint fails for that function

#### Scenario: Split task list behaves as before
- **WHEN** the task list is split into hooks, pure grouping functions and bodies
- **THEN** its groups, keyboard shortcuts with their read-only checks, drag and drop, tree semantics for assistive technology and per-row re-rendering behave as before, as shown by the existing list tests
