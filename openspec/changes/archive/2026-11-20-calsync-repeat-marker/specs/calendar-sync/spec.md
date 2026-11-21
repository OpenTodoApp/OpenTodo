## ADDED Requirements

### Requirement: Repeating tasks marked in the calendar
An event that calendar sync writes for a repeating task (one with a repeat rule) SHALL be titled `🔁` followed by one space and the task's title, for CalDAV, Google and Microsoft connections alike. An event for a task that does not repeat SHALL keep the task's title unchanged, as SHALL every event of an encrypted account. When the server reads such an event back, it SHALL remove one leading `🔁` and the spaces after it before comparing the title or applying it to the task: an unchanged event SHALL change nothing, a renamed event SHALL give the task the new title without the marker, and an event whose marker was deleted in the calendar SHALL change nothing. When a task starts or stops repeating, its event SHALL be rewritten within a cycle. Calendar feeds and CalDAV are unchanged.

#### Scenario: A repeating task in Google Calendar
- **WHEN** the task "Water the plants", repeating every week and due Saturday at 09:00, is synced to Google Calendar
- **THEN** the event on Saturday is titled "🔁 Water the plants", and the task's title is still "Water the plants" after the next cycle

#### Scenario: Renamed in the calendar
- **WHEN** the user renames that event to "🔁 Water the garden" in the calendar
- **THEN** after the next cycle the task is titled "Water the garden"

#### Scenario: Marker deleted in the calendar
- **WHEN** the user renames that event to "Water the plants", without the marker
- **THEN** the task's title does not change

#### Scenario: A one-off task
- **WHEN** a task titled "🔁 Rotate keys" that does not repeat is synced
- **THEN** its event is titled "🔁 Rotate keys", and reading it back changes nothing

#### Scenario: A task stops repeating
- **WHEN** the repeat rule of "Water the plants" is removed
- **THEN** within a cycle its event is titled "Water the plants"

#### Scenario: Encrypted account
- **WHEN** an encrypted account syncs a repeating task
- **THEN** its event is titled "Encrypted item", with no marker
