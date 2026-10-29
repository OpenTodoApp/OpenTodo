## ADDED Requirements

### Requirement: Short blocks never cover each other
Every block on the Day and Week grids, task or event, SHALL be drawn at least tall enough for one line of its title, and blocks whose drawn boxes would overlap SHALL be laid out side by side like blocks that overlap in time, so no block hides another. The overlap marker SHALL appear only on blocks whose times overlap.

#### Scenario: Short tasks close together
- **WHEN** a day has tasks at 13:30 for 15 minutes, 13:45 for 5 minutes, 13:50 for 10 minutes and 14:00 for 15 minutes
- **THEN** each block shows its title, the blocks sit in columns where they would otherwise cover each other, and none of them carries the overlap marker

#### Scenario: Long blocks keep the full width
- **WHEN** a day has a one-hour task at 10:00 and a 90-minute task at 11:00
- **THEN** both are drawn across the full column width, one under the other
