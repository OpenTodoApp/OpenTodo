# Spec Delta

## ADDED Requirements

### Requirement: Row detail preference
Each user SHALL have a row detail preference, `calm` (default) or `detailed`, stored and synced like density as an additive preference written through the operation log on the user's personal data, so it applies on every device of that user and never on another user's. It SHALL be editable offline, take effect at once on the editing device, and converge by last-writer-wins on the field. A client SHALL treat an unknown or empty value as `calm` and keep the stored value unchanged.

#### Scenario: Detailed on two devices
- **WHEN** the user picks Detailed on a laptop
- **THEN** rows show every chip and colour there at once and on the user's phone after sync

#### Scenario: Chosen offline
- **WHEN** the device is offline and the user picks Detailed
- **THEN** the rows change immediately, one operation is queued, and it reaches the other devices on the next sync

#### Scenario: Concurrent choices
- **WHEN** device A picks Detailed and device B picks Calm, both offline, and both sync
- **THEN** every device ends with the value written with the greater timestamp, and a density change made in the meantime is kept

#### Scenario: Unknown value from a newer client
- **WHEN** a device receives `row_detail` set to a value it does not know
- **THEN** it shows Calm rows and leaves the stored value as it is

## MODIFIED Requirements

### Requirement: Appearance in Settings
Settings → Appearance SHALL be its own section offering a mode control, one tile per theme (a horizontal row of swatches below 640 px), the density choice, the row detail choice (Calm or Detailed, with one sentence saying what Calm leaves out) and the sidebar destination switches. Each tile SHALL preview its theme's accent on the current mode and name the theme in text. A choice SHALL apply at once, without a reload. Every control SHALL be operable by keyboard alone, and the current mode, theme, density and row detail SHALL be announced to assistive technology.

#### Scenario: Pick a theme by keyboard
- **WHEN** the user tabs to the theme tiles, moves with the arrow keys to `teal` and presses Enter or Space
- **THEN** the app switches to the teal accent at once and the teal tile is marked as selected

#### Scenario: Previews follow the mode
- **WHEN** the user switches the mode from `light` to `dark` in the panel
- **THEN** the app and every tile preview turn dark at once

#### Scenario: Swatches on a phone
- **WHEN** the user opens Appearance on a 390 px screen
- **THEN** the eight themes are a single scrollable row of named swatches, not a grid of cards

#### Scenario: Pick Detailed by keyboard
- **WHEN** the user tabs to the Rows control after Density and chooses Detailed with the arrow keys
- **THEN** the choice is announced, every open list shows Detailed rows at once, and the setting is on the user's other devices after sync
