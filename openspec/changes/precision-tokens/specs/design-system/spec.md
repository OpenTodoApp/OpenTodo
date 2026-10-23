## MODIFIED Requirements

### Requirement: Comfortable reading scale
List, control and navigation text rendered by shared UI components and screens SHALL be one token, the list step, 13 px at the default browser size; switching it to 14 px SHALL be a one-line change of that token. Secondary metadata SHALL be 12.5 px. Running text people read rather than scan (notes, comments being written, help articles, the day page's briefing) SHALL use the prose step, 15 px. Text smaller than 12 px SHALL be reserved for keyboard hints inside key badges, section labels and counts, all at the hint step (11.5 px, weight 500). The scale SHALL offer a 14 px header title, a 22 px page title for a task and a settings page, and one display step (28 px) for day page titles and large clocks, with tighter letter-spacing than body text; headings SHALL be weight 600, the display step weight 650, and the two largest steps SHALL carry negative letter-spacing. All text SHALL scale with the browser's font-size setting.

#### Scenario: Browser zoom setting
- **WHEN** the user sets the browser default font size to 20 px
- **THEN** list, prose and metadata text grow proportionally and no layout scrolls horizontally at 360 px wide

#### Scenario: No pixel sizes in screens
- **WHEN** a change uses an 11 px font size in a row chip
- **THEN** the token lint fails naming the file and line

#### Scenario: Display step
- **WHEN** a screen renders a title with the display type utility
- **THEN** it is 28 px at the default browser size, weight 650, with negative letter-spacing, and grows with the browser's font-size setting

#### Scenario: Clocks derive from the display step
- **WHEN** the Focus timer and a display route render their clocks
- **THEN** their size is a multiple of the display or prose step and is the same size as before this change within one pixel

#### Scenario: List text in one token
- **WHEN** the list step token is changed from 13 to 14 px
- **THEN** task rows, the sidebar, buttons and inputs all render at 14 px and nothing else in the stylesheet needs to change

### Requirement: Three surfaces
Screens SHALL use five surface styles only: row (row radius, no shadow, the hover token as its hover tint), card (card radius, no shadow, a border), overlay (popover radius, the popover surface, the strong edge, the third elevation), column (card radius, sunken fill, no shadow, no border in light, border in dark; for a board column and any other container of cards), and flat section (no fill, no radius, no shadow, separated from its neighbours by vertical space and one hairline; for the secondary sections of a settings page and the panels of a dashboard). Lists and cards SHALL be flat: only overlays carry a shadow. Each style SHALL be one component class in the stylesheet. Raw radius and shadow utilities SHALL not appear in screens; the token lint SHALL fail on them.

#### Scenario: Raw shadow in a screen
- **WHEN** a change uses a raw shadow utility in a screen
- **THEN** the token lint fails naming the file and line

#### Scenario: Column surface by its class
- **WHEN** a screen draws a container of cards with the column class
- **THEN** it has the sunken fill, the card radius and no shadow in light, a border in dark, and the token lint passes

#### Scenario: Hand-made flat section
- **WHEN** a screen separates two sections with a raw border utility instead of the flat section class
- **THEN** the token lint fails naming the file and line

#### Scenario: Overlay on the popover surface
- **WHEN** a menu, popover, tooltip or sheet opens over a list in dark mode
- **THEN** it is drawn on the popover surface with the strong edge and a shadow, while the cards and rows under it have no shadow

## ADDED Requirements

### Requirement: Precision surface tokens
The tokens SHALL include, in light, dark and high contrast, a popover surface (menus, popovers, tooltips, sheets, the palette), a hover tint (rows, navigation and buttons), a selected surface (the selected navigation item, an active tab or tool), a selected-row surface, and a strong hairline (popover and selected-card edges). Every text tone SHALL meet 4.5:1 on the popover, hover and selected-row surfaces; on the selected surface the strong, default and muted tones SHALL meet 4.5:1 and the faint tone SHALL NOT be used. The neutrals SHALL be a flat cool slate, darker in dark mode than the content surface they hold, and SHALL NOT be derived from the accent. Control edges SHALL keep the input border token, which meets 3:1.

#### Scenario: Pairs are measured
- **WHEN** the token contrast test runs
- **THEN** it measures every text tone on the popover, hover and selected-row surfaces and the strong, default and muted tones on the selected surface, in light, dark and high contrast, and fails naming the pair when one is under its minimum

#### Scenario: Faint text on the selected item
- **WHEN** a change shows a count in the faint tone on the selected navigation item
- **THEN** the change is out of the design system: the active item's count uses the muted tone

#### Scenario: Neutrals ignore the accent
- **WHEN** the user switches the accent theme from emerald to violet in dark mode
- **THEN** the canvas, the content surface, the popover, hover, selected and selected-row surfaces and the strong hairline keep exactly the same values
