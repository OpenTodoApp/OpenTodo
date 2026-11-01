## MODIFIED Requirements

### Requirement: Appearance preferences
Each user SHALL have these appearance preferences:
- mode: `system`, `light` or `dark`
- theme: `emerald`, `blue`, `indigo`, `violet`, `rose`, `orange`, `teal`, `graphite` or `custom` (the accent theme, applied to the OpenTodo themes, see `themes` "Accent themes apply to the OpenTodo themes")
- custom colour: a colour written `#rrggbb`, used when the theme is `custom` (see "Custom accent colour")
- light theme and dark theme: the theme of each side, empty for OpenTodo Light and OpenTodo Dark (see `themes` "Theme choice per light and dark side, synced")

Mode SHALL default to `system`, which follows the operating system's colour scheme. Theme SHALL default to `emerald`. The light and dark theme SHALL default to empty. A client SHALL treat an unknown or missing value as the default and SHALL keep the stored value unchanged; the theme `custom` with a missing or malformed custom colour SHALL read as `emerald`.

#### Scenario: New account
- **WHEN** a user who never opened the appearance settings opens the app on a device whose system is dark
- **THEN** the app is OpenTodo Dark with the emerald accent, exactly as before this change

#### Scenario: Unknown theme from a newer client
- **WHEN** a device receives a theme value it does not know
- **THEN** it shows the emerald theme and does not write any op

#### Scenario: Any mode with any theme
- **WHEN** the user picks the `violet` theme and the `dark` mode
- **THEN** the app is dark with the violet accent

#### Scenario: Custom without a colour
- **WHEN** a device receives the theme `custom` and no valid custom colour
- **THEN** it shows the emerald theme and does not write any op

#### Scenario: Older client
- **WHEN** a device with an app version before this change receives the theme `custom`, or a light or dark theme choice
- **THEN** it shows the emerald theme on OpenTodo's tokens, as for any value it does not know, and writes nothing

### Requirement: A theme changes only the accent
On the OpenTodo themes, an accent theme SHALL change the accent colours: primary actions, the focus ring, links, selection, the current navigation item and accent-tinted surfaces. It SHALL NOT change neutrals and surfaces, priority colours p1 to p4, status colours (success, warning, danger, info) or the rendering of stored project, label and view colours. No accent theme SHALL use a red accent. A full theme (`themes`) MAY change every semantic token, but SHALL keep each meaning: success, warning, danger and info stay told apart from each other and from the accent, priorities keep their order of emphasis, and stored project, label and view colours keep rendering through the theme's 12-hue palette.

#### Scenario: Completed task under another theme
- **WHEN** the theme is `blue` and a task is completed
- **THEN** primary buttons are blue and the completed check mark keeps the success colour

#### Scenario: Priority and project colours
- **WHEN** the user switches from `emerald` to `rose`
- **THEN** a p1 task's flag and a green project's dot look exactly as before the switch

#### Scenario: A green project under a palette
- **WHEN** a dark palette is active and a project stored with a green colour is shown
- **THEN** its dot uses that palette's green label hue, not OpenTodo's green, and the stored colour is unchanged

### Requirement: No flash of the wrong appearance
A device SHALL remember the last appearance it applied, including the resolved active themes, and SHALL apply it before the first frame of the app is drawn, so the app never briefly shows another mode, accent or theme on start. When the synced value differs, the app SHALL switch to it as soon as it is read, without a reload. Remembering the appearance on the device SHALL NOT write an op.

#### Scenario: Reopening a dark app
- **WHEN** a user whose mode is `dark` on a light system reopens the app
- **THEN** the first frame drawn is already dark

#### Scenario: First start on a new device
- **WHEN** the user signs in on a device that has never run the app
- **THEN** it starts with the defaults and switches to the user's synced appearance once their data has synced

#### Scenario: Reopening with a palette
- **WHEN** a user whose light theme is a light palette reopens the app in light mode
- **THEN** the first frame drawn is already in that palette

### Requirement: Browser and system bar colour follows the appearance
The colour the browser or operating system uses around the app (address bar, installed app's title bar, phone status bar) SHALL follow the appearance live: on the OpenTodo themes the accent in light mode and the dark canvas colour in dark mode, and on another theme that theme's bar colour (see `themes` "System bars follow the theme"), including when `system` mode switches. The install splash screen, which is fixed when the app is installed and the same for every user of the server, SHALL keep its neutral colour.

#### Scenario: Installed app on a phone
- **WHEN** the app is installed on a phone, the mode is `light` and the theme is `orange`
- **THEN** the status bar is the orange accent, and after switching the mode to `dark` it becomes the dark canvas colour without a reload

#### Scenario: Splash screen
- **WHEN** the installed app is launched
- **THEN** the splash screen shows the server's neutral colour, and the first frame after it uses the user's remembered appearance

### Requirement: Appearance in Settings
Settings → Appearance SHALL be its own section offering a mode control, the theme choice (one list of theme cards for the current side when the mode is `light` or `dark`, and two labelled lists, Light and Dark, when it is `system`; each card names the theme, previews its canvas, surface, text, accent and label hues, and credits its author), one tile per accent theme followed by a Custom tile that opens the custom colour picker (a horizontal row of swatches below 640 px; shown as coming from the theme when the current side's theme is not an OpenTodo theme), the density choice, the task rows choice (One line or Detailed, see `row-layouts` "Where the row layout is chosen"), the haptic feedback switch on devices that can vibrate, and the sidebar destination switches. Each tile SHALL preview its theme's accent on the current mode and name the theme in text. A choice SHALL apply at once, without a reload. Every control SHALL be operable by keyboard alone, and the current mode, theme of each side, accent theme (for the custom theme, "Custom" and its colour), density, task rows and haptics state SHALL be announced to assistive technology. The section SHALL NOT offer the retired row detail choice (Calm or Detailed, `row_detail`).

#### Scenario: Pick a theme by keyboard
- **WHEN** the user tabs to the theme tiles, moves with the arrow keys to `teal` and presses Enter or Space
- **THEN** the app switches to the teal accent at once and the teal tile is marked as selected

#### Scenario: Previews follow the mode
- **WHEN** the user switches the mode from `light` to `dark` in the panel
- **THEN** the app and every tile preview turn dark at once

#### Scenario: Swatches on a phone
- **WHEN** the user opens Appearance on a 390 px screen
- **THEN** the eight themes are a single scrollable row of named swatches, not a grid of cards

#### Scenario: Task rows after Density
- **WHEN** the user tabs through Settings → Appearance after Density
- **THEN** the next control is the Task rows choice, One line or Detailed, and choosing Detailed writes one op for `row_layout` and none for `row_detail`

#### Scenario: Custom tile on a phone
- **WHEN** the user opens Appearance on a 390 px screen
- **THEN** the Custom swatch ends the scrollable row after the eight themes, and tapping it opens the colour picker as a bottom sheet

#### Scenario: Two sides under system
- **WHEN** the mode is `system` and the user opens Appearance
- **THEN** the theme choice shows a Light list and a Dark list, each announced with its name and selected theme, and choosing a card in the Dark list writes one op for the dark side only
