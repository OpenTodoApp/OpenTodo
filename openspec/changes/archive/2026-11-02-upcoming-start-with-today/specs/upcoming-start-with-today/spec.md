## ADDED Requirements

### Requirement: Start with Today option
Upcoming's page menu SHALL offer **Start with Today**, a checked item that is off by default. Its state SHALL be stored in the user's preference row as `upcoming_today` (`"on"` while on; any other value reads as off and is kept as stored), written locally first so it works offline, sent as one operation, and converging across the account's devices by last-writer-wins. It SHALL not be shared with project members and SHALL not be content.

#### Scenario: Off by default
- **WHEN** a user who never chose opens Upcoming
- **THEN** Upcoming lists Tomorrow and the following days only, as before

#### Scenario: Turned on offline
- **WHEN** the user turns Start with Today on while offline
- **THEN** Upcoming starts with Today's groups at once, and the account's other devices show the same after the next sync

#### Scenario: Two devices disagree
- **WHEN** one device turns the option on and another turns it off while both are offline
- **THEN** after both sync, every device shows the later choice

### Requirement: Upcoming starts with Today's own groups
While Start with Today is on, Upcoming SHALL open with the groups Today shows, chosen and grouped by the same rules as Today: Earlier, Today (with Morning and Afternoon when the account groups by part of the day), This Evening, Blocked and, with a Today limit, Waiting for a slot. Tomorrow and the following days SHALL follow as without the option. Each task SHALL be listed once: a task Today holds SHALL appear only in Today's groups. Without filters, the Today groups SHALL hold the same tasks as Today, so their count agrees with Today and its sidebar count. The Today group SHALL carry its heading and SHALL be left out when it holds no task. Done today and Close the day SHALL stay on Today only, and the part-of-the-day headings SHALL take no drops in Upcoming. Today SHALL be unchanged.

#### Scenario: Combined list
- **WHEN** the option is on and the user has a task due yesterday, one due today, one for this evening and one due tomorrow
- **THEN** Upcoming shows Earlier, Today, This Evening and Tomorrow, each with its task, in that order

#### Scenario: Listed once
- **WHEN** a task is due tomorrow and its deadline was yesterday
- **THEN** it is listed under Earlier only, as in Today

#### Scenario: Today limit
- **WHEN** the Today limit is 3 and Today holds 5 tasks
- **THEN** Upcoming's Today groups hold the same 3 tasks as Today, the other 2 are in a folded Waiting for a slot group before Tomorrow, and no task after today takes a slot

#### Scenario: Repeating occurrences
- **WHEN** Show repeating occurrences is also on
- **THEN** the projected rows start on Tomorrow and Today's groups stay first

#### Scenario: Today unchanged
- **WHEN** the option is on and the user opens Today
- **THEN** Today lists the same tasks and groups as with the option off
