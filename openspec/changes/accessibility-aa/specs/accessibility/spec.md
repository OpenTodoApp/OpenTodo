## ADDED Requirements

### Requirement: Published conformance statement
The repository SHALL publish `docs/accessibility.md` stating the target standard (WCAG 2.2 Level AA), the OpenTodo version and date it applies to, the scope (every entry of the screen inventory, the docs site and in-app Help, the native screens of the Android and iOS shells, the browser extension popup), the testing method (automated checks and the manual passes), a results table with one row per inventory entry, the known exceptions (criterion, screen, workaround, issue, target version) and a feedback channel answered within 10 business days. The results table SHALL be generated from the screen inventory and the latest manual audit record, and the conformance claim SHALL read "Fully conforms" only when no exception is listed and "Partially conforms" otherwise. The repository checks SHALL fail when the committed table differs from the generated one or when an inventory entry has no row.

#### Scenario: Reading the statement
- **WHEN** a buyer opens `docs/accessibility.md`
- **THEN** it names WCAG 2.2 AA, the version and date, every screen with its result, every known exception with a workaround and target version, and how to report a barrier

#### Scenario: New screen without a row
- **WHEN** a change adds an inventory entry and does not regenerate the statement
- **THEN** the repository check fails naming the entry

### Requirement: Accessibility gate on real screens
CI SHALL open every screen inventory entry against a seeded server at 360 px and 1280 px wide, in light and dark, in English, on every pull request that changes the web app or the audit scripts, and SHALL fail on any serious or critical axe violation of the WCAG 2.0, 2.1 and 2.2 Level A and AA rules, naming the screen, width, theme and rule. The nightly interface audit SHALL apply the same rule to its full matrix (360, 768 and 1280 px, English and German, browser text size 20) and report a failure through the nightly alert. Serious and critical violations SHALL NOT be exemptible.

#### Scenario: Unlabelled control on a screen
- **WHEN** a change adds an icon-only button without an accessible name to the Plan screen
- **THEN** the pull request's accessibility screen check fails naming `plan`, the width, the theme and `button-name`

#### Scenario: Contrast failure only in German at text size 20
- **WHEN** a long German label wraps onto a background with insufficient contrast at text size 20
- **THEN** the nightly audit fails and the nightly alert names the screen and rule

### Requirement: Measured criteria beyond axe
The screen gate SHALL also fail on each inventory entry when: a focused element shows no focus ring (2.4.7); a focused element is entirely covered by another element such as a sticky header, bottom bar, toast or sheet (2.4.11); an interactive target is smaller than 24 by 24 CSS pixels without 24 pixels of spacing to every other target (2.5.8); the page scrolls horizontally at a 320 by 256 CSS pixel viewport outside the regions listed with a reason in the reflow exemption file (1.4.10); or text is clipped in an element with hidden overflow after the WCAG text-spacing styles are applied (1.4.12). The reflow exemption file SHALL list only two-dimensional content regions.

#### Scenario: Toast hides the focused button
- **WHEN** the undo toast covers the bottom row's menu button while it has focus at 360 px
- **THEN** the gate fails naming the screen, the element and "focus obscured"

#### Scenario: Calendar grid at 320 px
- **WHEN** the week view is opened at 320 CSS px
- **THEN** the grid may scroll inside its own region because `calendar-week` is listed with a reason, and the page itself does not scroll horizontally

#### Scenario: Clipped label under text spacing
- **WHEN** a settings row label is clipped after the text-spacing styles are applied
- **THEN** the gate fails naming the screen and the element

### Requirement: Single-pointer alternatives to dragging and swiping
Every drag or swipe interaction in the web app SHALL have an alternative that works with a single pointer without dragging (2.5.7, 2.5.1): list row and section reorder through Move up, Move down and Move to top in their menus, board moves through the row menu's Section choice, calendar, month, plan and timeline moves and resizes through the When popover, sidebar order through Move up and Move down in the item menu, and row swipe actions through the row menu. Every drag or swipe source SHALL carry an id that a committed map links to its alternative, and a test SHALL fail when a source has no id, an id is not in the map, or the map names a menu action that does not exist. Moves made through an alternative SHALL write the same operations as the drag, so they work offline and converge like any other edit.

#### Scenario: Reorder a project without dragging
- **WHEN** a user with a head pointer opens a project's sidebar menu and chooses Move up
- **THEN** the project moves one place up, exactly as a drag would, and the order syncs to other devices

#### Scenario: New drag without an alternative
- **WHEN** a change makes saved-view chips draggable and adds no map entry
- **THEN** the drag alternatives test fails naming the file and the source

#### Scenario: Move offline
- **WHEN** a user moves a task to the top through the menu while offline
- **THEN** the new order is saved locally and converges with other devices after sync

### Requirement: Accessible authentication
Sign-in, sign-up, two-factor, recovery code, password reset and invitation screens SHALL NOT block paste into any field, SHALL set `autocomplete` (`username`, `current-password`, `new-password`, `one-time-code`) on credential fields, SHALL offer passkeys where the server allows them, and SHALL NOT use a cognitive function test such as a CAPTCHA (3.3.8). A test SHALL fail when a synthetic paste into one of these fields does not change its value or when an `autocomplete` value is missing.

#### Scenario: Pasting a one-time code
- **WHEN** a user pastes a six-digit code from a password manager into the two-factor field
- **THEN** the field contains the code and the form can be submitted

### Requirement: Recorded manual audit
A manual audit SHALL be recorded in `docs/accessibility/audit-<version>.md` before 1.0.0 and at least every 12 months after, with one row per core inventory entry and a result for keyboard only, NVDA with Firefox on Windows, VoiceOver with Safari on macOS, VoiceOver in the iOS shell, TalkBack in the Android shell, and 200% zoom with browser text size 20. Each result SHALL be `pass`, `fail` with an issue link, or `n/a` with a reason. Every failure on a core screen SHALL be fixed before 1.0.0; a failure on a non-core screen MAY remain only as a listed exception with an issue and target version and SHALL NOT concern a Level A criterion. The repository checks SHALL fail on a missing core row, an empty result, or a failure not listed as an exception, and `make release-prepare` SHALL refuse a release dated more than 12 months after the latest audit.

#### Scenario: Audit record complete
- **WHEN** the 1.0 audit file has a row for every core screen with every column filled and no failures
- **THEN** the check passes and the statement reads "Fully conforms"

#### Scenario: Stale audit blocks a release
- **WHEN** a maintainer prepares a release 13 months after the latest audit file's date
- **THEN** `make release-prepare` fails saying a manual accessibility audit is due

#### Scenario: Unlisted failure
- **WHEN** the audit records `fail #812` for TalkBack on the Settings screen and the statement does not list issue 812
- **THEN** the repository check fails naming the screen and the issue

### Requirement: Native shell accessibility checks
The Android shell's lint SHALL treat missing content descriptions, missing labels for inputs, clickable views without accessibility handling and touch targets below 48 dp as errors, and the iOS shell's UI tests SHALL run the system accessibility audit on the server sign-in screen, the settings screen and the widget configuration, failing on any reported issue.

#### Scenario: Icon without description in the Android shell
- **WHEN** a change adds an `ImageButton` without a content description to the server sign-in screen
- **THEN** `make android` fails on the lint error
