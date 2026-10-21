# Spec Delta

## MODIFIED Requirements

### Requirement: Row detail preference
The `row_detail` field of the user's appearance preferences SHALL remain in the operation schema and the client defaults as a retired field: it is accepted, stored, synced and exported exactly as before, converges by last-writer-wins on the field, and SHALL have no effect on how rows render. No client SHALL write it, and no client SHALL remove or rename it; an older client that still writes `detailed` SHALL cause no change on a current client.

#### Scenario: Older client writes Detailed
- **WHEN** a device running the previous version picks Detailed and syncs
- **THEN** the current devices receive the op, keep the value, and keep rendering the one row

#### Scenario: Export round-trip
- **WHEN** a user whose stored `row_detail` is `detailed` exports and imports into a new account
- **THEN** the value travels in the export and is stored, and the rows are unchanged

#### Scenario: Nothing is written
- **WHEN** a user opens Settings → Appearance and changes the density
- **THEN** one op for `density` is queued and none for `row_detail`

### Requirement: Appearance in Settings
Settings → Appearance SHALL be its own section offering a mode control, one tile per theme (a horizontal row of swatches below 640 px), the density choice and the sidebar destination switches. Each tile SHALL preview its theme's accent on the current mode and name the theme in text. A choice SHALL apply at once, without a reload. Every control SHALL be operable by keyboard alone, and the current mode, theme and density SHALL be announced to assistive technology. The section SHALL NOT offer a row detail choice.

#### Scenario: Pick a theme by keyboard
- **WHEN** the user tabs to the theme tiles, moves with the arrow keys to `teal` and presses Enter or Space
- **THEN** the app switches to the teal accent at once and the teal tile is marked as selected

#### Scenario: Previews follow the mode
- **WHEN** the user switches the mode from `light` to `dark` in the panel
- **THEN** the app and every tile preview turn dark at once

#### Scenario: Swatches on a phone
- **WHEN** the user opens Appearance on a 390 px screen
- **THEN** the eight themes are a single scrollable row of named swatches, not a grid of cards

#### Scenario: No Rows control
- **WHEN** the user tabs through Settings → Appearance after Density
- **THEN** the next control is the first sidebar destination switch, and searching settings for "Calm" or "Detailed" finds nothing
