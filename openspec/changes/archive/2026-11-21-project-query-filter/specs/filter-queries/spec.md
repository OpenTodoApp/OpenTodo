## ADDED Requirements

### Requirement: Query filter on a project
A project's page SHALL offer the query filter of Upcoming, in the published grammar, in its List, Board and Timeline layouts (its Calendar layout keeps the Calendar's filter): Filter… in the page's Filter menu (and the phone's overflow), the label checkboxes, and an active filter as one chip with its words and a clear control in the header, adding no row of chrome. Each project SHALL have its own filter. It SHALL narrow the project's tasks before its sections and board columns are built, so columns and sections stay with fewer cards; a query without `completed` matches open tasks only, as everywhere. Every valid edit SHALL apply as it is typed; an invalid query SHALL keep the last valid filter active and show the parser's error. Each filter SHALL be remembered per device across reloads, never synced, and evaluated on the device from local data, offline and on unlocked encrypted accounts.

#### Scenario: Narrow a board as you type
- **WHEN** the user opens Filter… on the board of "Kitchen" and types `search: tile`
- **THEN** each column shows only the cards whose title or description contains "tile", and every column stays on the board

#### Scenario: Labels and priority
- **WHEN** the user ticks the label "errand" and adds `& p1` in the project's filter
- **THEN** the query reads `@errand & p1` and the project shows only priority 1 tasks with that label

#### Scenario: One filter per project
- **WHEN** a filter is active on "Kitchen" and the user opens "Garden"
- **THEN** "Garden" shows all its tasks, and "Kitchen" still shows its filter when opened again

#### Scenario: Remembered on this device only
- **WHEN** the device is offline, the project's filter is active and the page is reloaded
- **THEN** the same filter is active, and the project on another device of the account is unfiltered
