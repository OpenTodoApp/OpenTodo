## MODIFIED Requirements

### Requirement: Core screens in the workbench
The workbench SHALL have stories with fixture data for every core screen of the screen inventory (OpenSpec `web-app` "Interface audit tour"): at least the sidebar, the shell with a list and the panel open, the task row in every state, a task list with groups, the board, the Day, Week, Month and Plan calendars, the timeline, quick add with chips, the page header, the settings page, the Inbox triage, the Labels, Filter, Filters overview, Updates, Completed, Trash, Next, Waiting, Someday and Anytime views, the Ask screen, the task panel with each of its tabs, each in light and dark at 375 and 1280 px, under the same accessibility and visual-regression gates as the primitives. A script SHALL compare the inventory's core screens with the stories and SHALL fail naming every core screen without one; a screen SHALL be marked core in the inventory by its frequency of use (daily or weekly), not by whether a story exists.

#### Scenario: Row state missing
- **WHEN** a change adds a new chip to the task row without a story state showing it
- **THEN** the review checklist of the change names the missing state and the visual baseline does not cover it

#### Scenario: Shell baseline
- **WHEN** a change moves the panel by 8 px
- **THEN** the shell story's visual check fails with a diff image

#### Scenario: Core screen without a story
- **WHEN** a change adds a route that the inventory marks as used weekly and adds no story for it
- **THEN** the story-coverage check fails naming the route and the story title it expects

#### Scenario: Rare screen without a story
- **WHEN** the inventory marks the password reset screen as rarely used and it has no story
- **THEN** the story-coverage check reports it as uncovered without failing

## ADDED Requirements

### Requirement: Screen inventory
The repository SHALL keep one machine-readable inventory of the web app's screens: every route of the router, every settings section, the overlays reachable from each screen (dialogs, sheets, popovers, the task panel and its tabs), the display routes, the signed-out screens, the capture screen, the start guide, the command palette and the sequence spotlight. Each entry SHALL name the seed state it needs, its frequency of daily use (daily, weekly or rare), whether it is a core screen, and the name it has in the automated layout check or the reason it is not in it. A test SHALL fail when a router view is missing from the inventory, when an entry names a layout-check screen that does not exist, or when a core entry has no frequency.

#### Scenario: New route without an inventory entry
- **WHEN** a change adds a `view` to the router and no inventory entry names it
- **THEN** the inventory test fails naming the view

#### Scenario: Entry outside the layout check
- **WHEN** an inventory entry is not in the layout check's list and gives a reason
- **THEN** the inventory test passes and the audit tour still opens the entry

#### Scenario: Stale layout-check name
- **WHEN** an inventory entry names a layout-check screen that was renamed
- **THEN** the inventory test fails naming the entry and the missing screen

### Requirement: Audited interface rules
Every screen of the web app SHALL satisfy, at 360, 768 and 1280 px wide, in light and dark, in every shipped interface language: no horizontal scrolling outside designated regions; every interactive control at least 24 × 24 CSS px with a fine pointer (inline links in running text and controls whose spacing to every neighbour is at least 24 px excepted) and at least 44 × 44 px on a touch screen; the token focus ring visible on every focusable element when it receives keyboard focus; truncated text carrying its full text in an accessible name, a tooltip or a nearby element; no two visible interactive controls overlapping by more than 4 px; a cumulative layout shift of at most 0.1 from navigation to idle; and, when reduced motion is requested, no running animation or transition that moves or scales an element. The audit tour SHALL measure each rule and report every violation with the screen, width, theme, language and element.

#### Scenario: German label overflows
- **WHEN** a settings row's German label makes the row wider than a 360 px viewport while the English one fits
- **THEN** the audit reports a horizontal-overflow violation naming the screen, the language and the element

#### Scenario: Small control with a fine pointer
- **WHEN** a screen at 1280 px has a 20 × 20 px button with another control 8 px beside it
- **THEN** the audit reports a target-size violation for that button

#### Scenario: Focus without a ring
- **WHEN** a focusable element on a screen shows no visible change when it receives keyboard focus
- **THEN** the audit reports a focus-visibility violation naming the element

#### Scenario: Truncated title without its full text
- **WHEN** a project name is cut with an ellipsis and neither its accessible name, a tooltip nor a nearby element carries the full name
- **THEN** the audit reports a truncation violation

#### Scenario: Movement under reduced motion
- **WHEN** reduced motion is requested and completing a task still slides the row
- **THEN** the audit reports a reduced-motion violation naming the screen and the animated element

### Requirement: Focus visibility in the accessibility gate
The accessibility gate on stories SHALL, for every core-screen story, move keyboard focus through every focusable element and SHALL fail when an element receives focus without the token focus ring becoming visible, naming the story, the theme and the element.

#### Scenario: Control with its own focus style
- **WHEN** a core-screen story contains a control that removes the outline on focus and draws nothing else
- **THEN** the UI check fails naming the story, the theme and the control

#### Scenario: Every control shows the ring
- **WHEN** every focusable element of the core-screen stories shows the token focus ring on keyboard focus
- **THEN** the focus-visibility pass reports no failure
