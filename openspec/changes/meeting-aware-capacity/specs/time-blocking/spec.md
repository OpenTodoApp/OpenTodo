## MODIFIED Requirements

### Requirement: Overlap and capacity
Blocks that overlap in time SHALL be laid out side by side without hiding each other and SHALL carry an overlap marker. Each day column SHALL show the sum of estimates of its open timed and untimed tasks against a configurable day length (default 8 hours) and SHALL mark the day when the sum exceeds it. The capacity line SHALL be set in the muted text tone with tabular figures of the interface typeface, and SHALL turn to the danger tone with the over-capacity text when the day is over capacity; it SHALL never use a monospace face. Blocks of subscribed calendar events (OpenSpec `calendar-feeds`) SHALL take part in the side-by-side layout and the marker, and SHALL NOT count toward the sum unless the device's "Count meetings in capacity" option (see "Grid preferences") is on. With the option on, the sum SHALL add the day's event minutes as defined by OpenSpec `planner-view` "Event minutes in the capacity" (busy timed occurrences of enabled calendars shown on this device, overlaps counted once, all-day and free events left out), the tooltip SHALL name both parts ("4h 15m of tasks, 2h 30m in meetings"), and a day whose tasks alone fit but whose tasks plus event minutes exceed the day length SHALL be marked in the warning tone with the text "Over with meetings", while a day whose tasks alone exceed it keeps the danger tone. Both marks SHALL be in the line's accessible name, never shown by colour alone. Events hidden on the device are neither drawn nor counted. Nothing is written by the option or the sum; it is computed on the device from local data and works offline.

#### Scenario: Two tasks at the same time
- **WHEN** two tasks are due today at 10:00
- **THEN** both blocks are visible side by side with the overlap marker

#### Scenario: Over capacity
- **WHEN** today's open tasks total 9 hours of estimates with an 8-hour day length
- **THEN** the day header shows `9h / 8h` in the danger tone, marked as over capacity

#### Scenario: Capacity line at rest
- **WHEN** today's open tasks total 2 hours of estimates with an 8-hour day length
- **THEN** the day header shows `2h / 8h` in the muted tone with tabular figures, so the figures of neighbouring days line up

#### Scenario: Task during a meeting
- **WHEN** a subscribed calendar has a meeting 10:00 to 11:00 and a 30-minute task is due today at 10:00
- **THEN** the task block and the event block are drawn side by side with the overlap marker, and the day header counts only the task's 30 minutes

#### Scenario: Calendars hidden
- **WHEN** the user hides calendars on this device
- **THEN** task blocks are laid out as if no events existed and the header is unchanged

#### Scenario: Meetings counted
- **WHEN** "Count meetings in capacity" is on, today's open tasks total 4h 15m, busy meetings run 09:00 to 10:30 and 14:00 to 15:00, and the day length is 8 hours
- **THEN** the day header reads `6h 45m / 8h` in the muted tone and its tooltip reads "4h 15m of tasks, 2h 30m in meetings"

#### Scenario: Over only with meetings
- **WHEN** the option is on, today's tasks total 6 hours and busy meetings total 3 hours with an 8-hour day length
- **THEN** the header shows `9h / 8h` in the warning tone with "Over with meetings", and a screen reader announces "over with meetings"

#### Scenario: Over with tasks alone
- **WHEN** the option is on, today's tasks total 9 hours and meetings 1 hour with an 8-hour day length
- **THEN** the header shows `10h / 8h` in the danger tone marked as over capacity

#### Scenario: Free and all-day events do not count
- **WHEN** the option is on and today holds a free (transparent) 10:00 to 12:00 event and an all-day "Offsite" event
- **THEN** neither adds to the sum, and the header equals the tasks' estimates

#### Scenario: Option on, calendars hidden
- **WHEN** the option is on and the user turns the toolbar's "Calendars" toggle off
- **THEN** no event is drawn or counted and the header shows the tasks' sum only

#### Scenario: Offline outside the cache
- **WHEN** the option is on, the device is offline and the Week shows a day outside the device's event cache
- **THEN** that day counts no event minutes and its tooltip says calendars are unavailable offline for that day

### Requirement: Grid preferences
Start hour, end hour, day length and "Count meetings in capacity" SHALL be per-device preferences editable in Settings › Calendar, with defaults that need no setup (the option off), and SHALL not be synced. The option SHALL be shown only while the device knows at least one subscribed or connected calendar; a stored value SHALL be kept while it is hidden. A missing or invalid stored value SHALL read as its default.

#### Scenario: Change day length
- **WHEN** the user sets the day length to 6 hours in Settings
- **THEN** capacity markers on this device use 6 hours and other devices are unaffected

#### Scenario: Turn meetings on for this device
- **WHEN** the user turns on "Count meetings in capacity" on the laptop
- **THEN** the laptop's Day, Week and Month count busy event minutes and the phone's do not

#### Scenario: No calendar, no option
- **WHEN** the device knows no subscribed or connected calendar
- **THEN** Settings › Calendar shows no "Count meetings in capacity" row and capacity counts tasks only
