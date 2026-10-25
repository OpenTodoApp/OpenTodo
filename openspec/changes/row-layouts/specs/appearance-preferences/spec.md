## REMOVED Requirements

### Requirement: Appearance in Settings without a Rows choice
**Reason**: Issue #367 asks for a detailed row again; the account's row layout is chosen under Settings › Appearance (OpenSpec change row-layouts). The retired `row_detail` field stays retired; the choice is the new `row_layout` field.
**Migration**: None. The section's other controls are unchanged and listed in "Appearance in Settings".

## ADDED Requirements

### Requirement: Appearance in Settings
Settings → Appearance SHALL be its own section offering a mode control, one tile per theme (a horizontal row of swatches below 640 px), the density choice, the task rows choice (One line or Detailed, see `row-layouts` "Where the row layout is chosen"), the haptic feedback switch on devices that can vibrate, and the sidebar destination switches. Each tile SHALL preview its theme's accent on the current mode and name the theme in text. A choice SHALL apply at once, without a reload. Every control SHALL be operable by keyboard alone, and the current mode, theme, density, task rows and haptics state SHALL be announced to assistive technology. The section SHALL NOT offer the retired row detail choice (Calm or Detailed, `row_detail`).

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
