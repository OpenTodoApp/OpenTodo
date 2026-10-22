# Spec Delta

## Purpose

Defines OpenTodo's accessibility conformance target, WCAG 2.2 level AAA, the rule that decides between an AAA criterion and the look, the register of deliberate exceptions with the statement that publishes them, and the cross-cutting AAA requirements that belong to no single screen.

## ADDED Requirements

### Requirement: Conformance target and the beauty rule
The web app SHALL target WCAG 2.2 level AAA in light and dark, for every accent theme, with and without a pointer. An AAA success criterion SHALL be met by default wherever meeting it does not change how the app looks. Where meeting it by default would change the look (the accent colour, the number of text tones, the density of rows), the default SHALL keep its look, the criterion SHALL still be reachable through a presentation the person chooses with at most one switch in Settings → Appearance or one system setting, and the case SHALL be an entry in the exceptions register. No criterion SHALL be unmet without a register entry.

#### Scenario: A criterion that keeps the look
- **WHEN** a contributor finds that the muted text tone can reach 7:1 by a lightness change that no story baseline shows as a visible difference
- **THEN** the tone is changed and no register entry is written

#### Scenario: A criterion that would change the look
- **WHEN** reaching 7:1 on the primary button would require a darker emerald than the brand accent
- **THEN** the default keeps the emerald, the high-contrast presentation reaches 7:1 on the same button, and the register names the criterion, the measured ratio, the reason and the route

### Requirement: Exceptions register and statement
The repository SHALL hold one register of accessibility exceptions. Each entry SHALL name the success criterion, where it applies, the measured value in each theme where a value applies, why the default keeps its look, and the route to the criterion. The user guide SHALL contain an accessibility statement that lists the target, every register entry in plain language, what the statement does not cover, how to report a problem and the date of the last review; the statement SHALL be reachable from Help. A check run by `make check` SHALL fail when an entry of the register is missing from the statement or the statement lists an exception that is not in the register. The register and the statement are documentation: nothing is stored per user and nothing changes offline.

#### Scenario: Register and statement drift
- **WHEN** a contributor adds a register entry for the compact density without adding it to the statement
- **THEN** `make check` fails and names the entry

#### Scenario: An exception is removed
- **WHEN** a change makes a registered pair reach its AAA minimum and removes the register entry but not the statement's line
- **THEN** `make check` fails and names the stale line

#### Scenario: Statement in Help
- **WHEN** a person opens Help and searches for "accessibility"
- **THEN** the statement page is a result, and it lists the current target and each exception with its route

### Requirement: Pointer targets
Every pointer target in a screen SHALL offer a hit area of at least 44 × 44 CSS pixels in the comfortable density, whether or not its visible shape is that large; a target drawn smaller SHALL gain the difference as an invisible area that does not move its neighbours or change any story's visual baseline. Exceptions are a link inside a sentence, a target whose size is set by the browser, and a target that is the same action as a larger target on the same screen. Two cases SHALL be register entries: the compact density, whose rows are closer than 44 px by the person's choice, and, with a fine pointer, targets whose 44 px box would reach into a neighbouring target (sidebar rows, group headers, controls side by side), since the invisible area cannot grow into another target and a touch screen already gives them 44 px. The UI check SHALL measure the hit area of every interactive element of the core-screen stories in the comfortable density and SHALL fail naming the story, the theme and the element when a point just inside 22 px from the element's centre in any of the four directions hits neither the element nor another target; an exemption list SHALL hold only the elements found by the first run and SHALL only shrink.

#### Scenario: Small icon button
- **WHEN** a row shows a 32 px icon button for its menu
- **THEN** a tap 20 px from its centre, within the row, opens the menu, and the row's visual baseline is unchanged

#### Scenario: Shrunk target fails the check
- **WHEN** a change adds a 28 px chip to a core screen without the hit area
- **THEN** the UI check fails naming the story, the theme and the chip

#### Scenario: Compact density
- **WHEN** the person has chosen the compact density
- **THEN** targets keep the comfortable density's invisible area where it does not overlap a neighbour, and the register entry explains the rest

#### Scenario: Neighbouring rows with a mouse
- **WHEN** the check probes a 36 px sidebar row 22 px below its centre and lands on the next row
- **THEN** the point is claimed by another target, the row is not reported, and the register entry names the case with its touch-screen route

### Requirement: Focus is never obscured
When an element receives keyboard focus, no part of it SHALL be hidden by content the person did not open: the phone tab bar, the add button, a toast, a sticky header or the edge of a scroller. The UI check's focus pass SHALL fail naming the story, the theme and the element when a focused element's rectangle is partly outside the viewport or when the topmost element at any of its corners or its centre is not the element, one of its descendants, or an overlay the element itself opened; an exemption list SHALL hold only the elements found by the first run and SHALL only shrink.

#### Scenario: Last row above the phone bar
- **WHEN** a keyboard user on a phone tabs to the last row of a long list
- **THEN** the list scrolls so the row sits fully above the tab bar and the add button

#### Scenario: A toast over a focused control
- **WHEN** a toast appears while a button under its position has focus
- **THEN** the toast is positioned so the button stays fully visible, or the UI check fails naming the button

### Requirement: Reading blocks
A block of text the person reads (a task's notes and description, a project's notes, a comment, Help) SHALL have a line height of at least 1.5, a measure of at most 80 characters, and SHALL never be justified. Help and the user guide SHALL space paragraphs at least 2 em apart (WCAG technique C21); notes and comments keep their close paragraphs by default so a note reads as one block in the panel, which SHALL be a register entry whose route is the high-contrast presentation spacing their paragraphs 2 em apart. Rows, chips, labels and controls are not blocks of text and keep their type scale. Foreground and background colours SHALL be selectable by the person through the mode, the theme and the contrast preference. Text SHALL reflow at 200 % browser zoom without horizontal scrolling (design-system "Comfortable reading scale").

#### Scenario: Help rhythm
- **WHEN** a Help page renders two paragraphs
- **THEN** the computed line height is at least 1.5 times the font size, the paragraphs are at least 2 em apart and no line is longer than 80 characters

#### Scenario: Notes rhythm
- **WHEN** a task's notes render two paragraphs in the default look and then under the high-contrast presentation
- **THEN** the line height is at least 1.5 in both, and the paragraphs move from their close spacing to 2 em apart under high contrast

#### Scenario: Justified text
- **WHEN** a change sets justified alignment on a text block
- **THEN** the token lint fails naming the file and line

### Requirement: Location and link purpose
A page inside a hierarchy (a nested project, a section, a task page) SHALL show where it is: the lead line under its title SHALL name the path to it from the workspace, each step a link, without adding a row of chrome. Every link's purpose SHALL be clear from its text alone: a screen SHALL NOT use a bare "here", "more", "Learn more", "click here" or "read more" as a link text; the web lint SHALL fail naming the file and line. Every settings section and every group of a long page SHALL have a heading. This is presentation only and behaves the same offline.

#### Scenario: Nested project
- **WHEN** a person opens a project inside "Work › Clients"
- **THEN** the lead line reads "Work › Clients" with each step a link to that page, and the chrome above the first row is still at most two rows

#### Scenario: Bare link text
- **WHEN** a change adds a link whose text is "Learn more"
- **THEN** `npm run lint` fails and names the file and line

### Requirement: No time limits
No action in the app SHALL require a response within a time the person cannot extend. A message that leaves on its own (a toast, an undo offer) SHALL only offer actions that stay reachable elsewhere after it has gone. The app SHALL NOT end a session for inactivity without warning; the session's lifetime SHALL be documented in the statement. Nothing SHALL flash more than three times a second.

#### Scenario: Undo after the toast
- **WHEN** the undo toast for a completed task has left on its own
- **THEN** the task can still be reopened from Completed and the change can still be undone from the task's history

#### Scenario: Nothing timed
- **WHEN** every control of the core-screen stories is listed
- **THEN** none of them disables or changes its action because time passed

### Requirement: Authentication without a cognitive test
Signing in and confirming a sensitive action SHALL be possible without remembering or transcribing: a passkey SHALL always be offered where a password or a code is asked, and a password or one-time-code field SHALL accept pasted text and carry the autocomplete hint that lets a browser or a password manager fill it. Nothing in sign-in SHALL be a puzzle or a recognition task.

#### Scenario: Pasted code
- **WHEN** a person pastes a six-digit code from an authenticator into the second-factor field
- **THEN** the field accepts it and the form can be submitted

#### Scenario: Passkey beside the password
- **WHEN** the sign-in form asks for a password
- **THEN** a passkey sign-in is offered on the same screen

### Requirement: Glossary and reading level
The user guide SHALL have a glossary that expands and explains every abbreviation and every uncommon term the app shows (at least GTD, CalDAV, E2EE, MCP, OIDC, TOTP, PWA, SMTP, IMAP, WebDAV, VAPID, API, CLI, HLC), linked from Help and from the statement. Interface strings SHALL be written in short sentences: the i18n check SHALL report every English string with a sentence longer than 25 words so a reviewer can shorten it, and the translation guide SHALL ask the same of every language. This is documentation and behaves the same offline.

#### Scenario: Abbreviation in Help
- **WHEN** a person searches Help for "CalDAV"
- **THEN** the glossary is a result and explains it in one or two plain sentences

#### Scenario: Long sentence
- **WHEN** a change adds an English interface string with a 31-word sentence
- **THEN** the i18n check reports the string and its length

### Requirement: Automated AAA gate
The automated accessibility audits of the stories and of the documentation SHALL run the WCAG 2.2 level AAA rule set in addition to A and AA and SHALL fail on any serious or critical violation, except that an enhanced-contrast finding SHALL pass when its foreground and background colours resolve to a pair in the exceptions register and SHALL fail otherwise, naming the story or page, the theme, the element and the measured ratio.

#### Scenario: Registered pair
- **WHEN** the audit finds the on-accent label on the emerald primary button at 5.5:1
- **THEN** the finding is matched to its register entry and the audit passes

#### Scenario: Unregistered pair
- **WHEN** a change adds a muted caption on a soft tint that measures 5.1:1
- **THEN** the audit fails naming the story, the theme, the element and 5.1:1
