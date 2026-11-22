## MODIFIED Requirements

### Requirement: Numeric dates follow the date format
Numeric dates SHALL be read in the order of the user's date format (OpenSpec `date-time-preferences`): `day-month` reads day first, `month-day` month first, and `iso` and `system` keep the order of the language the line is parsed in. While the order is month first, a day and month joined by a dash without a year (`3-4`) SHALL NOT be a date and SHALL stay in the title, since it is a quantity range there; with a slash or a year (`3/4`, `3-4-2027`) it SHALL be a date, and while the order is day first a dashed day and month SHALL be a date as before. There SHALL be no separate quick-add choice of numeric order; an order stored by an earlier version on a device SHALL be ignored. "next week" and the "next <weekday>" rule SHALL use weeks that start on the user's preferred first day of the week. The date format is a synced preference, so every device reads the same line the same way, offline included.

#### Scenario: Numeric date follows the date format
- **WHEN** the browser language is English (US), the date format is `day-month`, today is 2026-10-09, and the user enters `Pay rent 3/11`
- **THEN** the task is due `2026-11-03`

#### Scenario: A range on a shopping list
- **WHEN** the date format is `month-day`, today is 2026-10-09, and the user enters `Buy 3-4 tomatoes`, then `Pay rent 3/4`
- **THEN** the first task is titled `Buy 3-4 tomatoes` with no due date, and the second is due `2027-03-04`

#### Scenario: A dash day first
- **WHEN** the date format is `day-month`, today is 2026-10-09, and the user enters `Pay rent 3-4`
- **THEN** the task is due `2027-04-03`

#### Scenario: An old device order is ignored
- **WHEN** a device still holds a quick-add numeric order of month-day from an earlier version, the date format is `day-month`, and the user enters `Pay rent 3/11` on 2026-10-09
- **THEN** the task is due `2026-11-03`, and Settings → Capture shows no numeric order choice

#### Scenario: Next week with a Sunday start
- **WHEN** the first day of the week is `sun`, today is Wednesday 2026-10-14, and the user enters `Plan trip next week`
- **THEN** the task is due Sunday `2026-10-18`
