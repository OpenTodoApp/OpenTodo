# Spec Delta

## Purpose

Defines OpenTodo's visual language, its design tokens and the guarantees that come with them. It also defines the contributor workbench that verifies every UI building block, so every screen looks consistent, stays accessible in both themes and keeps the app's emerald and slate identity.

## ADDED Requirements

### Requirement: Semantic design tokens
The web app SHALL define named tokens for surfaces, text, borders, the accent, priorities p1–p4, status (success, warning, danger, info), a 12-hue palette with solid and soft steps, type sizes, spacing, radii, elevations and motion durations. Each token SHALL have a light and a dark value. New UI code SHALL style colour, radius, elevation and type through these tokens instead of raw colour literals.

#### Scenario: Theme switch
- **WHEN** the system colour scheme changes from light to dark
- **THEN** every surface, text, border, accent, priority, status and palette token switches to its dark value without a reload

#### Scenario: New component uses a raw colour
- **WHEN** a component added under the shared UI folder uses a raw Tailwind colour class or hex literal instead of a token
- **THEN** the token lint in `make check` fails and names the file and line

### Requirement: OpenTodo identity is preserved
The accent SHALL remain emerald, and neutrals SHALL remain the slate family. The light theme SHALL keep white cards, and the dark theme SHALL keep a slate-950 canvas. Primary actions, the focus ring and the current navigation item SHALL use the accent.

#### Scenario: Primary button colour
- **WHEN** a primary button renders in the light theme
- **THEN** its background is the emerald accent token and its label uses the on-accent text token

#### Scenario: Focus ring
- **WHEN** any interactive control receives keyboard focus
- **THEN** a visible focus ring in the accent colour appears, at least 2 px wide and offset from the control

### Requirement: Accessible contrast in both themes
Every text token SHALL reach a WCAG 2.2 contrast of at least 4.5:1 against every surface token it is allowed on, in both themes. Non-text UI tokens (borders of inputs, focus ring, priority and palette solid steps) SHALL reach at least 3:1 against the surfaces they sit on. Text placed on a palette soft step SHALL reach 4.5:1.

#### Scenario: A token change breaks contrast
- **WHEN** a contributor changes the muted text token so that it falls to 4.2:1 on the canvas in dark mode
- **THEN** the contrast check in `make check` fails and names the token pair, theme and measured ratio

#### Scenario: Label chip readability
- **WHEN** a label chip renders with any palette hue's soft background and that hue's text step
- **THEN** the text contrast is at least 4.5:1 in light and in dark

### Requirement: Stored colours render through the palette
Project, label and view colours already stored as hex strings SHALL render using the palette hue nearest to the stored value, for both its solid and soft steps. Rendering SHALL never write an op or change the stored value. A colour picked in the UI SHALL store the chosen hue's canonical solid hex.

#### Scenario: Legacy label colour
- **WHEN** a label stored with colour `#22c55e` is shown as a chip
- **THEN** it renders with the green palette hue's soft background and text step, and its stored colour is still `#22c55e`

#### Scenario: Offline and other devices
- **WHEN** a device without network renders the same label, and another device that has not updated yet renders it too
- **THEN** both show the label without any sync traffic. The updated device uses the palette steps and the older device shows the raw stored hex, with no conflict and no op written.

### Requirement: Bundled typeface without network access
The web app SHALL ship its interface typeface inside the application and SHALL never request fonts from a third-party host. The font SHALL be available offline after the first load. If it fails to load, text SHALL render in the system sans-serif stack, with no invisible text.

#### Scenario: First load
- **WHEN** a user opens the app on a fresh browser
- **THEN** the typeface is fetched from the OpenTodo server's own origin and no request goes to any other host

#### Scenario: Offline after install
- **WHEN** the installed app is opened with no network
- **THEN** text renders in the bundled typeface

#### Scenario: Font file missing
- **WHEN** the font file cannot be loaded
- **THEN** text is shown immediately in the system sans-serif font

### Requirement: Comfortable reading scale
Body text rendered by shared UI components and redesigned screens SHALL be 15 px, and their secondary metadata SHALL be no smaller than 13 px. Text smaller than 12 px SHALL be reserved for keyboard hints and counters. All text SHALL scale with the browser's font-size setting.

#### Scenario: Browser zoom setting
- **WHEN** the user sets the browser default font size to 20 px
- **THEN** body and metadata text grow proportionally and no layout scrolls horizontally at 360 px wide

### Requirement: Reduced motion
Interface transitions SHALL last no more than 250 ms. When the system requests reduced motion, the app SHALL replace movement and scaling animations with instant changes or opacity fades.

#### Scenario: Completing a task with reduced motion
- **WHEN** reduced motion is requested and the user completes a task
- **THEN** the task changes state without a movement or scale animation

### Requirement: Legacy component classes follow the tokens
The existing button, input and keyboard-hint classes SHALL keep their names and take their colours, radius and type from the tokens. A secondary button class SHALL exist for bordered neutral buttons. Screens that have not been redesigned yet SHALL keep working and stay readable.

#### Scenario: Unmigrated screen after the token change
- **WHEN** a screen that still uses the legacy button and input classes renders
- **THEN** its buttons and inputs use the token colours, radii and focus ring in both themes, and the automated layout check still passes

### Requirement: Design workbench
The repository SHALL include a design workbench that runs locally with one command. It SHALL show the foundations (colours with their contrast, type scale, spacing, radii, elevation, motion) and SHALL have a story for every shared UI primitive and pattern, in light and dark. The workbench SHALL be a development tool only and SHALL add nothing to the shipped app or server.

#### Scenario: Contributor opens the workbench
- **WHEN** a contributor runs the workbench command in `web/`
- **THEN** a local site opens listing Foundations and every shared component, each viewable in light and dark and at phone and desktop widths

#### Scenario: Production build untouched
- **WHEN** the production web app is built
- **THEN** no workbench code or dependency is included in the output

### Requirement: Accessibility gate on stories
CI SHALL run an automated accessibility audit on every workbench story in light and dark. It SHALL fail on any serious or critical violation.

#### Scenario: Button without an accessible name
- **WHEN** a story renders an icon-only button without an accessible name
- **THEN** the UI check fails and names the story, theme and rule

### Requirement: Visual regression gate on stories
CI SHALL capture every workbench story in light and dark at 375 px and 1280 px wide and compare it with committed baselines. It SHALL fail when the difference exceeds a small threshold and report a diff image. Contributors SHALL be able to update baselines with one documented command.

#### Scenario: Unintended visual change
- **WHEN** a change alters the padding of the shared button and baselines were not updated
- **THEN** the UI check fails and attaches the before, after and diff images for each affected story

#### Scenario: Intended visual change
- **WHEN** a contributor intentionally changes a component and runs the baseline update command
- **THEN** the new baselines are written to the repository and the UI check passes
