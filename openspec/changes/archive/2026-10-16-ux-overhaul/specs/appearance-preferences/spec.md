# Spec Delta

## ADDED Requirements

### Requirement: Density preference
Each user SHALL have a density preference, `comfortable` (default) or `compact`, stored and synced like mode and theme as an additive preference, applied at once to task rows, group headers and the sidebar. A client SHALL treat an unknown value as `comfortable` and keep the stored value unchanged. Touch targets SHALL stay 44 px on coarse pointers in both densities.

#### Scenario: Compact on two devices
- **WHEN** the user picks Compact on a laptop
- **THEN** rows are 36 px tall there at once and on the user's tablet after sync, where touch targets remain 44 px

### Requirement: Sidebar destinations preference
Each user SHALL have a synced list of promoted destinations (any of Anytime, Someday, Assigned to me, Completed, Updates, Trash, Filter) shown among the primary sidebar items; the default is empty. Settings → Appearance SHALL offer one switch per destination. A client SHALL ignore unknown entries and keep the stored value unchanged.

#### Scenario: Promote Someday
- **WHEN** the user turns on Someday in Settings → Appearance
- **THEN** Someday is listed under Calendar in the primary items on every device after sync and leaves the More group

## MODIFIED Requirements

### Requirement: Appearance in Settings
Settings → Appearance SHALL be its own section offering a mode control, one tile per theme (a horizontal row of swatches below 640 px), the density choice and the sidebar destination switches. Each tile SHALL preview its theme's accent on the current mode and name the theme in text. A choice SHALL apply at once, without a reload. Every control SHALL be operable by keyboard alone, and the current mode, theme and density SHALL be announced to assistive technology.

#### Scenario: Pick a theme by keyboard
- **WHEN** the user tabs to the theme tiles, moves with the arrow keys to `teal` and presses Enter or Space
- **THEN** the app switches to the teal accent at once and the teal tile is marked as selected

#### Scenario: Previews follow the mode
- **WHEN** the user switches the mode from `light` to `dark` in the panel
- **THEN** the app and every tile preview turn dark at once

#### Scenario: Swatches on a phone
- **WHEN** the user opens Appearance on a 390 px screen
- **THEN** the eight themes are a single scrollable row of named swatches, not a grid of cards
