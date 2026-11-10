## MODIFIED Requirements

### Requirement: When popover shows one segment
The When popover SHALL offer the segments Do on, Start, Deadline, Repeat and Reminders in a segmented control and show one at a time, starting on the segment of the part that opened it (Do on when opened from the Add menu or a shortcut that names no part). The Do on segment SHALL hold the date, the time of day row (a part of the day or a time) and, with a time, its zone.

#### Scenario: Open on the clicked part
- **WHEN** the user activates the "2 reminders" part
- **THEN** the When popover opens on its Reminders segment with the first reminder control focused, and switching to Deadline shows only the deadline field

#### Scenario: Shortcut from the list
- **WHEN** a task is selected in a list and the user presses the deadline shortcut
- **THEN** the panel opens with the When popover on its Deadline segment and the date field focused

### Requirement: Do on segment
The Do on segment of the When popover SHALL show, in order:
1. One date field. Its placeholder SHALL be an example of what it accepts in the interface language (in English "tomorrow 3pm, next fri"). It SHALL show the chosen date in words in the user's date format, accept typed dates, relative words and a date with a time, and preview what it understood (the date and, when typed, the time) before it is committed.
2. Quick choices on one line (Today, Tomorrow, This weekend, Next week), each naming the date it means in its accessible name and tooltip.
3. A month calendar that is visible without opening anything.
4. One time of day row: Any time, Morning, Afternoon, Evening and Time while day parts are on, and Any time, Evening and Time while they are off. The row is enabled only when the task has a do date.
5. Only while Time is chosen, one line holding the time field with suggested times and, at the line's end, the zone behaviour as quiet text ("Floating", or the city of a fixed zone) that opens the zone choices.

The row SHALL select Time when the task has a due time, else the task's part, else Any time. A task holding both a part and a time SHALL show the part selected and the time line. Within this row a part and a time SHALL be exclusive:
- choosing a time SHALL write the time together with the Any time pairing;
- choosing a part SHALL write that part's pairing together with the date without a time or zone;
- choosing Any time SHALL write the Any time pairing and remove the time.

Each choice SHALL be one batch of field operations with Undo, applied at once offline and converging by per-field last-writer-wins. The word for the part SHALL be "Evening", never "This Evening". The segment SHALL NOT contain a clear button of its own (Clear is in the popover's footer), a "No date" choice, an "Add time" or "Remove time" control, or a zone shown as a button-styled value or on a line of its own. Without a time it SHALL show nothing about time zones.

#### Scenario: Pick tomorrow in one click
- **WHEN** the user opens the Do on part of an undated task and chooses Tomorrow
- **THEN** the task is due tomorrow, and the When line reads "Tomorrow"

#### Scenario: Typed date with a preview
- **WHEN** the user types `fri` into the date field
- **THEN** a line under the field reads the next Friday's date in words before Enter is pressed, and Enter sets it

#### Scenario: Typed date and time
- **WHEN** the user types `tomorrow 3pm` into the date field of an evening task and presses Enter
- **THEN** the task is due tomorrow at 15:00, its part is Any time, the row shows Time selected with "15:00", and one Undo restores the earlier date and Evening

#### Scenario: Placeholder teaches the field
- **WHEN** the user opens the Do on segment of an undated task in English
- **THEN** the date field's placeholder reads "tomorrow 3pm, next fri"

#### Scenario: Dates in words
- **WHEN** the user's date format is day-month and the task is due 2026-10-22
- **THEN** the date field reads "Thu 22 Oct" and no field shows `10/22/2026`

#### Scenario: Evening on a later day
- **WHEN** a task is due next Tuesday and the user chooses Evening in the time of day row
- **THEN** the row reads "Evening", the task's `evening` is true and its `day_part` null, and nothing in the segment reads "This Evening"

#### Scenario: Adding a time
- **WHEN** the user chooses Time in the row of a Morning task and then the suggestion 09:00
- **THEN** the task is due at 09:00, its part is Any time, and the line under the row reads "09:00" with "Floating" at its end

#### Scenario: A part replaces the time
- **WHEN** a task due tomorrow at 19:30 is open and the user chooses Afternoon
- **THEN** the task is due tomorrow without a time, its part is Afternoon, the time line is gone, and Undo restores 19:30

#### Scenario: No zone without a time
- **WHEN** the task is due on a date with no time
- **THEN** the segment shows no zone and no hint about time zones

#### Scenario: Both stored
- **WHEN** a task synced from an older client is Evening and due at 08:00
- **THEN** the row shows Evening selected and the time line with "08:00", and nothing is written until the user chooses

#### Scenario: Day parts off
- **WHEN** day parts are off and the user opens the Do on segment of a dated task
- **THEN** the row offers Any time, Evening and Time

#### Scenario: No date yet
- **WHEN** the task has no do date
- **THEN** the time of day row is shown disabled, and picking a date in the calendar enables it without moving the segment's content
