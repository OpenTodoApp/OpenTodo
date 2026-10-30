## ADDED Requirements

### Requirement: Query filter on the calendar and Upcoming
The Calendar (Day, Week, Month and Plan together) and Upcoming SHALL each offer a filter by query in the published grammar, with label checkboxes that add and remove `@label` terms in the query, from Filter… in the Calendar's overflow menu and from Upcoming's Filter action. An active filter SHALL be one chip with its words and a clear control in the header's lead line, adding no row of chrome. The filter SHALL narrow the tasks drawn and listed and the deadline markers shown, SHALL leave calendar events, frames and the planning list unaffected, and SHALL leave the day's capacity counting every task, its tooltip saying how many are hidden by the filter. An invalid query SHALL keep the last valid filter active and show the parser's error. Each filter SHALL be remembered per device across reloads, never synced, and evaluated on the device from local data, offline and on unlocked encrypted accounts.

#### Scenario: Only work in the week
- **WHEN** the user opens Filter… in the Week and enters `##Work`
- **THEN** only tasks of "Work" and its sub-projects are drawn, a chip reading "Project is Work or a sub-project" (the condition words of saved views' toolbar) shows in the header, and meetings are still drawn

#### Scenario: Label checkboxes
- **WHEN** the user ticks the labels "errand" and "call" in Upcoming's filter
- **THEN** the query reads `@errand | @call` and Upcoming lists only tasks carrying either label

#### Scenario: Capacity unchanged
- **WHEN** a filter hides two tasks estimated at 1 hour each on Tuesday
- **THEN** Tuesday's capacity still counts them and its tooltip says "2 tasks hidden by the filter"

#### Scenario: Invalid query
- **WHEN** the user changes an active filter to `p1 &`
- **THEN** the error is shown in the popover and the previous filter stays active

#### Scenario: Remembered offline
- **WHEN** the device is offline, the Calendar's filter is active and the page is reloaded
- **THEN** the same filter is active in Day, Week, Month and Plan, and other devices are unaffected
