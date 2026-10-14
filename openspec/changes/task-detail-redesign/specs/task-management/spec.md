## MODIFIED Requirements

### Requirement: Convert between floating and zoned
The detail panel SHALL offer a keyboard-reachable toggle to fix a timed due to a zone or release it. Fixing SHALL keep the displayed date and time and set the viewer's zone. Releasing SHALL keep the date and time as currently displayed in the viewer's zone and drop the zone. A due without a time SHALL not be fixable and SHALL stay floating. The conversion SHALL be one ordinary due edit, applied locally first.

#### Scenario: Fix to my zone
- **WHEN** a Berlin user fixes a floating task due `09:00`
- **THEN** the due becomes `09:00 Europe/Berlin` and the row still reads `09:00`

#### Scenario: Release in another zone
- **WHEN** a Los Angeles user releases a task due `09:00 Europe/Berlin` that they see at `00:00`
- **THEN** the due becomes floating `00:00` on the displayed date and the hint disappears

#### Scenario: Clear the time of a zoned due
- **WHEN** the user clears the time of a zoned task
- **THEN** the zone is dropped as well and the task becomes a floating date

#### Scenario: Toggle with the keyboard
- **WHEN** the panel of a timed floating task is open and the user presses `z` outside a text field
- **THEN** the due is fixed to the viewer's zone, and pressing `z` again releases it

## ADDED Requirements

### Requirement: Zone control
Next to a timed due the panel SHALL show a zone control reading "Floating" or the zone's city and current UTC offset. Opening it SHALL explain both modes in one sentence each, offer "Fix to my zone" or "Make floating", and offer a searchable list of all IANA zones with the viewer's zone and recently used zones first. Without a time the control SHALL be disabled with the reason stated.

#### Scenario: Read the mode at a glance
- **WHEN** a task is due `09:00 America/New_York`
- **THEN** the due row shows a zone control reading "New York · UTC−4" (or −5 in winter)

#### Scenario: No time set
- **WHEN** the task has a due date without a time
- **THEN** the zone control is disabled and states that a time is needed to fix a zone

### Requirement: Fix a due to any zone
Choosing a zone from the zone control SHALL keep the wall-clock date and time currently entered and set that zone, so the due means that clock time in the chosen zone; choosing a different zone for an already zoned due SHALL likewise keep its wall-clock time. Before confirming, the control SHALL preview how the due reads in the viewer's zone. The change SHALL be one ordinary due edit, applied locally first, working offline and converging like any due edit.

#### Scenario: Meeting in another city
- **WHEN** a Berlin user with a floating due `15:00` on 2026-11-02 picks "America/New_York"
- **THEN** the due becomes `15:00 America/New_York`, the preview and the row show `21:00` for the Berlin user, and the hint names New York

#### Scenario: Offline zone change converges
- **WHEN** one device changes a due's zone offline while another edits its time, and both sync
- **THEN** both devices end with the due value written with the greater timestamp

#### Scenario: Recently used zone
- **WHEN** the user picked "Asia/Tokyo" on a previous task and opens the zone control of another task
- **THEN** "Tokyo" is listed right after the viewer's own zone
