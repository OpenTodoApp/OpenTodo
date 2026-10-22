# Spec Delta

## MODIFIED Requirements

### Requirement: Appearance preferences
Each user SHALL have four appearance preferences:
- mode: `system`, `light` or `dark`
- theme: `emerald`, `blue`, `indigo`, `violet`, `rose`, `orange`, `teal` or `graphite`
- contrast: `auto` or `high`
- motion: `system` or `none`

Mode SHALL default to `system`, which follows the operating system's colour scheme. Theme SHALL default to `emerald`. Contrast SHALL default to `auto`, which follows the operating system's request for more contrast, and `high` SHALL apply the high-contrast presentation regardless of the system (OpenSpec `design-system`, "High-contrast and no-motion presentation"). Motion SHALL default to `system`, which follows the operating system's reduced-motion setting, and `none` SHALL apply the no-motion attribute. A client SHALL treat an unknown or missing value as the default and SHALL keep the stored value unchanged. Contrast and motion SHALL be stored, synced and applied like mode and theme: two additive fields of the user's preferences, written through the op log, last writer wins, applied from the local copy before the first paint and when a sync changes them, and available offline. The Appearance settings SHALL show them as two rows after Mode and Theme.

#### Scenario: New account
- **WHEN** a user who never opened the appearance settings opens the app on a device whose system is dark
- **THEN** the app is dark with the emerald accent, exactly as before this change

#### Scenario: Unknown theme from a newer client
- **WHEN** a device receives a theme value it does not know
- **THEN** it shows the emerald theme and does not write any op

#### Scenario: Any mode with any theme
- **WHEN** the user picks the `violet` theme and the `dark` mode
- **THEN** the app is dark with the violet accent

#### Scenario: High contrast on every device
- **WHEN** the user sets contrast to `high` on a laptop and opens the app on a phone that has synced
- **THEN** the phone shows the high-contrast presentation from its first paint

#### Scenario: Offline choice converges
- **WHEN** a device offline sets motion to `none` and another device sets it to `system` later by the clock, and both sync
- **THEN** every device ends with `system`, the later write

#### Scenario: Older server
- **WHEN** a device from this version syncs the contrast preference to a server that predates it
- **THEN** the server refuses the unknown field, the device keeps its local value and the upgrade note names the field
