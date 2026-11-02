## ADDED Requirements

### Requirement: Time sector terms
The query grammar SHALL accept these terms:
- `sector`: tasks with a time sector;
- `no sector`: tasks without one;
- `carried`: tasks whose sector is carried over (OpenSpec `time-sectors`);
- `sector: <name>`, where the name is `this week`, `next week`, `this month`, `next month`, `this quarter` or `next quarter` (resolved on the viewer's local date and week start) or an absolute period such as `2026-W44`, `2026-11` or `2026-Q4`, matching that sector exactly.

The terms SHALL be evaluated on the device from local data with the open-only default, combine with every other term, and be keywords in the published grammar. The server's filter parser SHALL accept them when it validates a saved view, and refuse an invalid period with an error that names it.

#### Scenario: This week's work in one project
- **WHEN** the user enters `#Work & sector: this week`
- **THEN** open tasks of "Work" whose sector is the viewer's current week are listed

#### Scenario: Carried over
- **WHEN** the user enters `carried | sector: this week`
- **THEN** open tasks of this week and those carried over from earlier periods are listed

#### Scenario: Invalid period
- **WHEN** the user enters `sector: 2026-W60`
- **THEN** the query shows an error naming `2026-W60` and lists nothing, and saving it as a view over REST is refused with `400 invalid_input`

#### Scenario: Saved view offline across a week boundary
- **WHEN** a view `sector: this week` is open offline and the local date moves into the next week
- **THEN** the view lists the new week's tasks from local data without a reload
