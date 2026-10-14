# Spec Delta

## MODIFIED Requirements

### Requirement: Semantic design tokens
The web app SHALL define named tokens for surfaces, text, borders, the accent, priorities p1–p4, status (success, warning, danger, info), a 12-hue palette with solid and soft steps, type sizes, spacing, radii, elevations and motion durations. Each token SHALL have a light and a dark value. Every screen, shared component and component style class SHALL style colour through these tokens instead of raw colour literals, raw palette classes or fixed white and black.

#### Scenario: Theme switch
- **WHEN** the system colour scheme changes from light to dark
- **THEN** every surface, text, border, accent, priority, status and palette token switches to its dark value without a reload

#### Scenario: New component uses a raw colour
- **WHEN** a component added under the shared UI folder uses a raw Tailwind colour class or hex literal instead of a token
- **THEN** the token lint in `make check` fails and names the file and line

#### Scenario: A screen uses a raw colour
- **WHEN** a contributor adds `text-slate-500`, `bg-white` or a hex literal to a screen or to a component style class
- **THEN** the token lint in `make check` fails and names the file and line

#### Scenario: Screens awaiting their redesign
- **WHEN** a screen is on the lint's named allow-list because an open change is rewriting it
- **THEN** the lint skips only that screen, and adding a new entry to the allow-list fails the lint

#### Scenario: Stored data colour
- **WHEN** a screen passes a stored project, label or view colour to a component as data
- **THEN** the lint does not report it, and the colour renders through the palette

### Requirement: Legacy component classes follow the tokens
The existing button, input and keyboard-hint classes SHALL keep their names and take their colours, radius and type from the tokens. A secondary button class SHALL exist for bordered neutral buttons. Screens on the lint's allow-list SHALL keep working and stay readable until their redesign removes them from it.

#### Scenario: Unmigrated screen after the token change
- **WHEN** a screen on the allow-list that still uses the legacy button and input classes renders
- **THEN** its buttons and inputs use the token colours, radii and focus ring in both themes, and the automated layout check still passes

### Requirement: Stored colours render through the palette
Project, label and view colours already stored as hex strings SHALL render using the palette hue nearest to the stored value, for both its solid and soft steps, on every screen that shows them. Rendering SHALL never write an op or change the stored value. A colour picked in the UI SHALL store the chosen hue's canonical solid hex.

#### Scenario: Legacy label colour
- **WHEN** a label stored with colour `#22c55e` is shown as a chip
- **THEN** it renders with the green palette hue's soft background and text step, and its stored colour is still `#22c55e`

#### Scenario: Offline and other devices
- **WHEN** a device without network renders the same label, and another device that has not updated yet renders it too
- **THEN** both show the label without any sync traffic. The updated device uses the palette steps and the older device shows the raw stored hex, with no conflict and no op written.

#### Scenario: Project colour in the calendar and the feed
- **WHEN** a task of a project stored with colour `#3b82f6` appears in the calendar grid and in the activity feed
- **THEN** both show the blue palette hue's solid step for that project, in light and in dark

## ADDED Requirements

### Requirement: Accent marks interaction
Screens SHALL use the accent tokens for actions, selection, links, focus and the current navigation item, and SHALL NOT use them for completion or status.

#### Scenario: Completed task and primary action
- **WHEN** a completed task's check mark and a primary button are shown on the same screen
- **THEN** the check mark uses the success token and the button uses the accent token, even though both are emerald today

### Requirement: Status and priority colours follow meaning
Screens SHALL use success for completion and positive confirmation, danger for errors and destructive actions, warning for cautions, info for neutral notices, and p1 to p4 for task priority, choosing each by what it means rather than by its current hue.

#### Scenario: Error message
- **WHEN** a form shows a validation error
- **THEN** the message uses the danger text token in light and in dark

### Requirement: Migration keeps the look
While the accent is emerald, moving a screen onto tokens SHALL keep its light and dark look, apart from shade differences to the nearest token: layout, borders, states and emphasis SHALL stay the same.

#### Scenario: No visible regression
- **WHEN** a screen is compared before and after the migration in light and in dark
- **THEN** layout, borders, states and emphasis are unchanged, and any difference is limited to a shade moving to its token value
