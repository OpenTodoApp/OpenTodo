# Spec Delta

## Purpose

Lets a task or habit belong to a part of the day (Morning, Afternoon, Evening) and, when the user opts in, groups Today by those parts, while staying compatible with the existing This Evening flag.

## ADDED Requirements

### Requirement: Day part field
A task SHALL have an optional `day_part`: null (default), `morning` or `afternoon`. It SHALL be an additive task field: validated on every write path (another value is rejected as invalid and the task unchanged), settable offline, synced as a field operation, converging by per-field last-writer-wins, included in the export and the REST representation, and stored and forwarded untouched by a client without it. Evening SHALL stay expressed only by the `evening` flag. A task's part SHALL be Evening when `evening` is set, else its `day_part`. Every client SHALL set a part by writing `day_part` and `evening` together in one batch (Morning: `morning`/false; Afternoon: `afternoon`/false; Evening: null/true; Any time: null/false). The part SHALL be kept when the task is rescheduled, when a recurring task or habit advances, and on the completed occurrence record. It is not content and is not encrypted.

#### Scenario: Default on creation
- **WHEN** a task is created with only a title
- **THEN** its `day_part` is null and no operation is written for it

#### Scenario: Invalid value rejected
- **WHEN** a client submits `day_part: "night"`
- **THEN** the write is rejected as invalid and the task is unchanged

#### Scenario: Concurrent parts converge
- **WHEN** device A sets a task to Morning and device B sets it to Evening, both offline, and both sync
- **THEN** every device shows the part written with the greater timestamps, never Morning and Evening at once

#### Scenario: Older client sets This Evening
- **WHEN** a device running a client without this field toggles This Evening on a Morning task
- **THEN** after sync the task reads as Evening on every device, and toggling it off again shows it in Morning

#### Scenario: Habit keeps its part
- **WHEN** the user completes a daily habit set to Morning
- **THEN** the habit is due tomorrow and still in Morning, and the completed record carries Morning

### Requirement: Day parts preference
Each user SHALL have a "Day parts" preference, off by default, stored as an additive field of the personal preferences, synced to that user's devices only, editable offline, converging by last-writer-wins and included in the export; an empty or unknown value SHALL read as off and be kept. It SHALL be set in Settings → Preferences → Today for every mode, and offered in Today's overflow menu only in "Lists with method hints" and "Full Open Loops method". While it is off, Today SHALL be exactly as before this change, no Morning or Afternoon control SHALL be offered, and a task that has one of those parts SHALL show it as a chip.

#### Scenario: Existing account
- **WHEN** a user who had the app before this change opens Today
- **THEN** Today is unchanged, the When popover shows the Evening toggle only, and no operation is written

#### Scenario: Part from another device while off
- **WHEN** day parts are off on this account and a CalDAV client sets a task due today to Morning
- **THEN** Today lists it in the day group with a "Morning" chip

### Requirement: Today grouped by part of the day
While day parts are on, Today SHALL list the day's tasks (not Earlier, not Blocked) under **Today** (no part and no due time), **Morning**, **Afternoon** and **This Evening**, in that order, leaving out empty groups and keeping Today's usual order within each group. A task without a part that has a due time SHALL be placed by its time in the viewer's zone: before 12:00 Morning, 12:00 to 17:59 Afternoon, from 18:00 This Evening; a stored part or the evening flag SHALL win over the time. Habits SHALL be placed like any task. Earlier and Blocked SHALL be unchanged. Grouping SHALL be computed on the device without writes, work offline and follow synced changes live; a row SHALL leave out the part chip its heading already states.

#### Scenario: A planned day
- **WHEN** day parts are on and today has an untimed task, a Morning habit, a task due at 14:00 and an evening task
- **THEN** Today shows the untimed task under Today, the habit under Morning, the 14:00 task under Afternoon and the evening task under This Evening

#### Scenario: Explicit part wins over the time
- **WHEN** a task due at 20:00 is set to Morning
- **THEN** it is listed under Morning

#### Scenario: Turning day parts off
- **WHEN** the user turns day parts off
- **THEN** Today shows the day group and This Evening as before, the 14:00 task back in the day group, and no task is changed

### Requirement: Setting the part of the day
While day parts are on, the user SHALL set a part from the When popover's Do on segment (Any time, Morning, Afternoon, Evening as one segmented control replacing the Evening toggle), by dragging or keyboard-moving a task onto a part's heading in Today, from a "Day part…" submenu of the task Actions menu, and from palette commands. `Shift+E` SHALL keep toggling This Evening. Each SHALL write the pairing of the Day part field requirement with Undo, offline included; viewers SHALL see the part as text and get no control.

#### Scenario: Drag to Afternoon
- **WHEN** the user drags a task from the Today group onto the Afternoon heading
- **THEN** the task is listed under Afternoon, Undo puts it back, and the other devices show it there after sync

#### Scenario: Evening from the keyboard
- **WHEN** the user presses `Shift+E` on a Morning task
- **THEN** the task moves to This Evening and its `day_part` is null

#### Scenario: Viewer
- **WHEN** a viewer of a shared project opens a Morning task
- **THEN** the When line reads Morning and no part control is offered
