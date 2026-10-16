# Spec Delta

## ADDED Requirements

### Requirement: Page template primitives
The client SHALL offer a page header primitive (title in the page title size, optional meta, up to two actions, an overflow menu, a Help action) and a page body primitive with the three content widths named in `app-shell`. Every view SHALL use them; an automated check SHALL fail when a view under the app folder renders a level-one heading outside the page header primitive.

#### Scenario: Heading outside the template
- **WHEN** a change adds a view with its own `h1`
- **THEN** the design-system check fails naming the file

### Requirement: Tooltip primitive
The client SHALL offer one tooltip that opens on hover after 400 ms and on focus at once, shows a label and an optional shortcut, closes on Escape and blur, is announced as the control's description, and does not open on touch (the accessible name still applies). Icon-only buttons SHALL use it by default. The native `title` attribute SHALL not be used in screens; a lint SHALL fail on it.

#### Scenario: Keyboard user sees the hint
- **WHEN** a keyboard user focuses the notifications button
- **THEN** a tooltip reading "Notifications" appears at once and leaves on blur

#### Scenario: Native title in a screen
- **WHEN** a change adds `title=` to a button under the app folder
- **THEN** the lint fails naming the file and line

### Requirement: Skeleton primitive
The client SHALL offer a skeleton block in the row, line and card shapes, with a subtle shimmer that is still under reduced motion, used wherever local data is awaited.

#### Scenario: Reduced motion
- **WHEN** reduced motion is requested and a list is loading
- **THEN** the skeleton rows are static

### Requirement: Three surfaces
Screens SHALL use three surface styles only: row (control radius, no shadow, hover tint), card (card radius, first elevation, border in dark) and overlay (card radius, third elevation, border in dark). Raw radius and shadow utilities SHALL not appear in screens; the token lint SHALL fail on them.

#### Scenario: Raw shadow in a screen
- **WHEN** a change uses a raw shadow utility in a screen
- **THEN** the token lint fails naming the file and line

### Requirement: Token lint covers the screens
The token lint SHALL cover the app folder as well as the shared UI folder, with a per-file allow-list that may only shrink and reaches zero when this change is complete. Raw palette colours, hex literals, raw text sizes, pixel font sizes, raw radii, raw shadows and the legacy component classes SHALL each fail it.

#### Scenario: New raw size
- **WHEN** a change adds `text-xs` to a screen that is not on the allow-list
- **THEN** the token lint fails naming the file and line

#### Scenario: Allow-list only shrinks
- **WHEN** a change adds a file to the allow-list
- **THEN** the lint's self-test fails

### Requirement: Core screens in the workbench
The workbench SHALL have stories with fixture data for the sidebar, the shell with a list and the panel open, the task row in every state, a task list with groups, the board, the Day and Week calendar, quick add with chips, the page header and the settings page, each in light and dark at 375 and 1280 px, under the same accessibility and visual-regression gates as the primitives.

#### Scenario: Row state missing
- **WHEN** a change adds a new chip to the task row without a story state showing it
- **THEN** the review checklist of the change names the missing state and the visual baseline does not cover it

#### Scenario: Shell baseline
- **WHEN** a change moves the panel by 8 px
- **THEN** the shell story's visual check fails with a diff image

### Requirement: Interface budget
Every change that touches a screen SHALL state in its design how it stays within the interface budget: at most two rows of chrome above the first item of a list, at most seven properties visible by default on a task, at most six primary sidebar destinations, at most three vertical scroll regions per screen, and every new shortcut registered without conflict. The measurable limits SHALL be enforced by tests.

#### Scenario: A feature adds a banner
- **WHEN** a change renders a banner between the page header and the first task
- **THEN** the budget test fails naming the view

### Requirement: Secondary text is one size
Secondary text in screens SHALL be the metadata size only; counters and estimates SHALL use tabular figures in the interface face, never a monospace face. Two icon sizes SHALL be used in content (16 px in rows, 20 px in headers) and one in chips (12 px).

#### Scenario: Estimate chip
- **WHEN** a row shows "1 h 30"
- **THEN** it is set in the interface face at the metadata size with tabular figures

### Requirement: One focus style
Every interactive control in screens SHALL show the token focus ring on keyboard focus and nothing else; a control SHALL not draw its own border or colour change for focus. The accessibility gate SHALL include a focus-visibility check on the core-screen stories.

#### Scenario: Priority chip focus
- **WHEN** a keyboard user focuses a priority option
- **THEN** the token focus ring is shown and the option's border does not change

## MODIFIED Requirements

### Requirement: Comfortable reading scale
Body text rendered by shared UI components and screens SHALL be 15 px, and their secondary metadata SHALL be 13 px. Text smaller than 12 px SHALL be reserved for keyboard hints inside key badges. All text SHALL scale with the browser's font-size setting.

#### Scenario: Browser zoom setting
- **WHEN** the user sets the browser default font size to 20 px
- **THEN** body and metadata text grow proportionally and no layout scrolls horizontally at 360 px wide

#### Scenario: No pixel sizes in screens
- **WHEN** a change uses an 11 px font size in a row chip
- **THEN** the token lint fails naming the file and line

### Requirement: Legacy component classes follow the tokens
The legacy button, input and keyboard-hint classes SHALL take their colours, radius and type from the tokens while any screen still uses them. Once no screen uses a legacy class, it SHALL be removed from the stylesheet and a test SHALL fail if it returns. Screens SHALL use the shared button, field and key-badge primitives instead.

#### Scenario: Unmigrated screen after the token change
- **WHEN** a screen still on the allow-list that uses the legacy button and input classes renders
- **THEN** its buttons and inputs use the token colours, radii and focus ring in both themes, and the automated layout check still passes

#### Scenario: Legacy class returns
- **WHEN** a change adds a `btn-primary` class to a screen after the classes were removed
- **THEN** the token lint fails naming the file and line

### Requirement: Settings section and row patterns
Settings content SHALL be built from sections and rows with a fixed anatomy. A section is a titled card with a one-sentence description and rows; it has no help link of its own and no action in its header. A row puts a label and its description beside the control from 640 px wide, stacks them below 640 px, shows the current state as a badge beside the label before any action, and places a primary action as the control of its last row. Keyboard hints live in tooltips, never as paragraphs.

#### Scenario: Row stacks on phones
- **WHEN** a settings row is shown 375 px wide
- **THEN** the label and description sit above the control, and nothing scrolls horizontally

#### Scenario: Two-factor section anatomy
- **WHEN** a user with two-factor off opens Account
- **THEN** the Two-factor row shows an "Off" badge beside its label and "Set up" as its control, and the section header has no button or help link
