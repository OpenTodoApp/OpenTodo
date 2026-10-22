## REMOVED Requirements

### Requirement: Numeric order and week start follow the preferences
**Reason**: Quick add had its own device-level choice of numeric date order next to the date format in General, so the same question was asked twice and the two could disagree.
**Migration**: Numeric dates follow the date format only ("Numeric dates follow the date format"); a device-level order stored earlier is ignored and no longer shown.

## ADDED Requirements

### Requirement: Numeric dates follow the date format
Numeric dates SHALL be read in the order of the user's date format (OpenSpec `date-time-preferences`): `day-month` reads day first, `month-day` month first, and `iso` and `system` keep the order of the language the line is parsed in. There SHALL be no separate quick-add choice of numeric order; an order stored by an earlier version on a device SHALL be ignored. "next week" and the "next <weekday>" rule SHALL use weeks that start on the user's preferred first day of the week. The date format is a synced preference, so every device reads the same line the same way, offline included.

#### Scenario: Numeric date follows the date format
- **WHEN** the browser language is English (US), the date format is `day-month`, today is 2026-10-09, and the user enters `Pay rent 3/11`
- **THEN** the task is due `2026-11-03`

#### Scenario: An old device order is ignored
- **WHEN** a device still holds a quick-add numeric order of month-day from an earlier version, the date format is `day-month`, and the user enters `Pay rent 3/11` on 2026-10-09
- **THEN** the task is due `2026-11-03`, and Settings → Capture shows no numeric order choice

#### Scenario: Next week with a Sunday start
- **WHEN** the first day of the week is `sun`, today is Wednesday 2026-10-14, and the user enters `Plan trip next week`
- **THEN** the task is due Sunday `2026-10-18`
