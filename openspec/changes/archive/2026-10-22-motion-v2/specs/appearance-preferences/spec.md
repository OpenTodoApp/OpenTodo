## ADDED Requirements

### Requirement: Haptic feedback preference
Each user SHALL have a `haptics` preference, `on` or `off`, defaulting to `on`, synced like the other appearance preferences as an additive field and editable offline, converging by last-writer-wins. With it on, a device that can vibrate SHALL give a short tick (at most 15 ms) when a task is completed and when a long press lifts a task for dragging; with it off, or on a device that cannot vibrate, nothing SHALL vibrate. The switch SHALL appear in Settings → Appearance only on devices that can vibrate; a client that receives an unknown value SHALL treat it as `on` and keep the stored value.

#### Scenario: Complete on a phone
- **WHEN** the preference is on and the user completes a task on a phone whose browser supports vibration
- **THEN** the device ticks once as the check mark fills, and does not tick again when the row leaves

#### Scenario: Turned off on one device
- **WHEN** the user turns haptics off on their phone while offline and later opens a tablet
- **THEN** the phone stops ticking at once, the preference syncs when online, and the tablet stops ticking too

#### Scenario: Desktop hides the switch
- **WHEN** the user opens Settings → Appearance in a desktop browser without vibration support
- **THEN** no haptics row is shown and nothing is written to the preference

#### Scenario: Older device
- **WHEN** a device with an app version before this preference receives the field
- **THEN** it ignores the field and keeps syncing as before

## MODIFIED Requirements

### Requirement: Appearance in Settings without a Rows choice
Settings → Appearance SHALL be its own section offering a mode control, one tile per theme (a horizontal row of swatches below 640 px), the density choice, the haptic feedback switch on devices that can vibrate, and the sidebar destination switches. Each tile SHALL preview its theme's accent on the current mode and name the theme in text. A choice SHALL apply at once, without a reload. Every control SHALL be operable by keyboard alone, and the current mode, theme, density and haptics state SHALL be announced to assistive technology. The section SHALL NOT offer a row detail choice.

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
- **THEN** the next control is the haptic feedback switch on a device that can vibrate and otherwise the first sidebar destination switch, and searching settings for "Calm" or "Detailed" finds nothing
