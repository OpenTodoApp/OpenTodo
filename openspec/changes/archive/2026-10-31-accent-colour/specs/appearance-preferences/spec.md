## ADDED Requirements

### Requirement: Custom accent colour
The user SHALL be able to pick one colour as their accent from the Custom tile of Settings › Appearance, in a picker that offers curated swatches as a keyboard-operable radio group and a field for a hex colour (`rgb` or `rrggbb`, with or without `#`, stored as lowercase `#rrggbb`), with no native colour input. The picker SHALL preview the result in light and in dark (a primary button, a link, a selected row and a soft chip) while the user chooses, without writing anything. Picking a swatch, or committing a valid hex with Enter or by leaving the field, SHALL write the theme `custom` and the custom colour in one batch and apply at once; an invalid hex SHALL show an inline error and write nothing. Choosing a built-in theme afterwards SHALL keep the stored custom colour, and the Custom tile SHALL show it. The device SHALL derive from the picked colour the light accent, the dark-mode accent text, the text colour on the accent (white) and, when needed, a dark-mode button value, keeping the picked hue and moving only its lightness (and its chroma to stay displayable) until every contrast pair the design system measures for an accent passes in both modes. It SHALL also keep the accent at least as far from the danger and priority-1 colours as the built-in Rose theme is, turning the hue away by the least amount when needed. When the colour was adjusted, the picker SHALL say so and show the picked and the used colour together. The derivation SHALL be deterministic, so every device of the user shows the same accent from the same stored colour, and SHALL run on the device only. The theme SHALL change only the accent, as every theme does; under the high-contrast presentation the accent SHALL be that presentation's black or white, as for every theme.

#### Scenario: Pick a brand colour
- **WHEN** the user opens the Custom tile, types `#1f6feb` in the hex field and presses Enter
- **THEN** the app's buttons, links, focus ring and selection use the derived blue at once in the current mode, the tile shows it, and the other devices switch after sync

#### Scenario: Pale colour adjusted for contrast
- **WHEN** the user picks `#ffe066`, a pale yellow
- **THEN** the light-mode accent is a darker yellow of the same hue on which white text reaches 4.5:1, the dark-mode accent text is a light yellow that reaches 4.5:1 on the dark surfaces, and the picker reads "Adjusted for contrast" with both colours shown

#### Scenario: A red pick is turned away from the error red
- **WHEN** the user picks `#d93025`
- **THEN** the accent's hue is turned away from the danger colour until it is at least as far from it as the Rose theme is, and the picker says the colour was turned away from the colour for errors

#### Scenario: Keep the colour while trying a theme
- **WHEN** the user with a custom colour chooses Teal and later chooses Custom again
- **THEN** the previous custom colour is applied at once and the picker opens with it selected, since it was never cleared

#### Scenario: Picker by keyboard
- **WHEN** the user tabs to the Custom tile, presses Enter, moves through the swatches with the arrow keys and presses Space
- **THEN** the chosen swatch is applied, it is announced as selected, and Escape closes the picker with focus back on the Custom tile

#### Scenario: Offline and concurrent
- **WHEN** device A picks a custom colour and device B picks Blue, both offline, and both sync
- **THEN** both devices show the theme written with the greater timestamp, and A's custom colour stays stored either way

#### Scenario: High contrast
- **WHEN** the theme is `custom` and the high-contrast presentation is on
- **THEN** the accent is pure black in light mode and pure white in dark mode, exactly as for a built-in theme

### Requirement: Custom accent in the first frame and the bar
A device SHALL remember the derived values of the custom accent with the rest of the last applied appearance and SHALL apply them before the first frame, without running the derivation and without writing an op. The browser and system bar colour SHALL be the derived light accent in light mode and the dark canvas colour in dark mode, following `system` mode live; the install splash screen and the instance's icons SHALL keep their neutral colours whatever the user's accent.

#### Scenario: Reopen with a custom accent
- **WHEN** a user with a custom accent and mode `light` reopens the installed app
- **THEN** the first frame is drawn in the custom accent and the status bar is the derived light accent

#### Scenario: Export and import
- **WHEN** a user with a custom accent downloads their JSON export and imports it into a new account
- **THEN** the export holds the theme `custom` and the custom colour, and the new account shows the same accent

## MODIFIED Requirements

### Requirement: Appearance preferences
Each user SHALL have two appearance preferences:
- mode: `system`, `light` or `dark`
- theme: `emerald`, `blue`, `indigo`, `violet`, `rose`, `orange`, `teal`, `graphite` or `custom`
- custom colour: a colour written `#rrggbb`, used when the theme is `custom` (see "Custom accent colour")

Mode SHALL default to `system`, which follows the operating system's colour scheme. Theme SHALL default to `emerald`. A client SHALL treat an unknown or missing value as the default and SHALL keep the stored value unchanged; the theme `custom` with a missing or malformed custom colour SHALL read as `emerald`.

#### Scenario: New account
- **WHEN** a user who never opened the appearance settings opens the app on a device whose system is dark
- **THEN** the app is dark with the emerald accent, exactly as before this change

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
- **WHEN** a device with an app version before this change receives the theme `custom`
- **THEN** it shows the emerald theme, as for any theme it does not know, and writes nothing

### Requirement: Appearance in Settings
Settings → Appearance SHALL be its own section offering a mode control, one tile per theme followed by a Custom tile that opens the custom colour picker (a horizontal row of swatches below 640 px), the density choice, the task rows choice (One line or Detailed, see `row-layouts` "Where the row layout is chosen"), the haptic feedback switch on devices that can vibrate, and the sidebar destination switches. Each tile SHALL preview its theme's accent on the current mode and name the theme in text. A choice SHALL apply at once, without a reload. Every control SHALL be operable by keyboard alone, and the current mode, theme (for the custom theme, "Custom" and its colour), density, task rows and haptics state SHALL be announced to assistive technology. The section SHALL NOT offer the retired row detail choice (Calm or Detailed, `row_detail`).

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
