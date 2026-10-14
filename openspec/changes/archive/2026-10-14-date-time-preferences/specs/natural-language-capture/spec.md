# Spec Delta

## MODIFIED Requirements

### Requirement: Date and time phrases
The parser SHALL recognise relative day words, weekday names with an optional "next", "in N days/weeks/months", "next week/month", month-and-day and numeric dates, and 12-hour or 24-hour times optionally preceded by "at". Dates SHALL resolve against the viewer's local date, always to today or later, and a time without a date SHALL mean today. The result SHALL be stored as the floating `{date: "YYYY-MM-DD", time?: "HH:MM"}` due value. While the device's numeric date order is automatic, numeric dates SHALL be read in the order of the user's date format (OpenSpec `date-time-preferences`; `iso` and `system` keep the language's order). "next week" and the "next <weekday>" rule SHALL use weeks that start on the user's preferred first day of the week.

#### Scenario: Next weekday with time
- **WHEN** today is Friday 2026-10-09 and the user enters `Dentist next Wed at 3pm`
- **THEN** the task is due `{date: "2026-10-14", time: "15:00"}` and its title is `Dentist`

#### Scenario: Time only
- **WHEN** the user enters `Call back 16:30` with no date phrase
- **THEN** the task is due today at `16:30`

#### Scenario: Date in the past rolls forward
- **WHEN** today is 2026-10-09 and the user enters `Renew passport 3 Feb`
- **THEN** the task is due `2027-02-03`

#### Scenario: Numeric date follows the date format
- **WHEN** the browser language is English (US), the quick-add order is automatic, the date format is `day-month`, today is 2026-10-09, and the user enters `Pay rent 3/11`
- **THEN** the task is due `2026-11-03`

#### Scenario: Explicit quick-add order wins
- **WHEN** the device's quick-add numeric order is set to month-day and the date format is `day-month`, and the user enters `Pay rent 3/11` on 2026-10-09
- **THEN** the task is due `2027-03-11`

#### Scenario: Next week with a Sunday start
- **WHEN** the first day of the week is `sun`, today is Wednesday 2026-10-14, and the user enters `Plan trip next week`
- **THEN** the task is due Sunday `2026-10-18`
