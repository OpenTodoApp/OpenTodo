## ADDED Requirements

### Requirement: Full task titles preference
Each user SHALL have a full task titles preference, off by default, stored as the additive field `full_titles` of the user's preferences (`"on"`, else off). It SHALL be written as an operation on the user's personal data like the density, so it is editable offline, applies at once on the editing device, reaches the user's other devices with sync and converges by last-writer-wins. A client SHALL treat an empty or unknown value as off and keep the stored value unchanged.

While it is on, every task title in list rows (in both row layouts), on board cards and in Today SHALL be shown in full, wrapped onto as many lines as it takes, at every width, instead of ending with an ellipsis after two lines (one on a phone row); the phone row's end cell SHALL stay on the title's first line. The calendar's compact rows and other one-line mentions of a task keep their shapes. A long list SHALL keep its scroll height close to the real one with the taller rows, so End and the scroll bar reach the last task.

Settings → Appearance SHALL offer it as the switch "Show full task titles" after the task rows choice, announced with its state to assistive technology. Searching settings for "full task titles", "truncate" or "wrap" SHALL find it.

#### Scenario: Turn it on
- **WHEN** a user turns on Show full task titles and opens a project whose task has a title of four lines' length on a 390 px phone
- **THEN** the row shows the whole title on four lines, with its date beside the first line, and no ellipsis

#### Scenario: Board and Today
- **WHEN** the preference is on and the same task is shown as a board card and in Today on a desktop
- **THEN** the card and the Today row show the whole title, wrapped

#### Scenario: Off by default
- **WHEN** a user who never changed the preference opens the same project
- **THEN** the title ends with an ellipsis after one line on the phone and after two lines on a desktop, and resting the pointer on it shows the whole title

#### Scenario: Offline on two devices
- **WHEN** the user turns the preference on while offline on a phone and the laptop syncs later
- **THEN** the phone shows full titles at once and the laptop shows them after sync without a reload

#### Scenario: A long project
- **WHEN** the preference is on and the user presses End in a project of 2,000 tasks
- **THEN** the list scrolls to its last task

#### Scenario: Unknown value from a newer client
- **WHEN** a device receives a `full_titles` value it does not know
- **THEN** it shows titles cut as by default and writes no operation

#### Scenario: Older device
- **WHEN** a device with an app version before this preference receives the field
- **THEN** it ignores the field and keeps syncing as before
