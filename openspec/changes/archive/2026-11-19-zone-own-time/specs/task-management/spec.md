# Spec Delta

## MODIFIED Requirements

### Requirement: Display in the viewer's zone
A zoned due SHALL be shown converted to the viewer's local time zone in every list, heading, sort order and date grouping. The date and time fields of the task's own Do on editor are the exception: they SHALL show and edit the due in its own zone, with the viewer's time under them as a hint (see "Fix a due to any zone"). When the task's zone differs from the viewer's, the original wall time and zone SHALL be shown as a hint. Conversion SHALL happen on the device from local data and SHALL not require the network.

#### Scenario: Viewed from another zone
- **WHEN** a task due `09:00 Europe/Berlin` on the 11th is viewed from Los Angeles
- **THEN** it is listed on the 11th at `00:00` with the hint `09:00 Berlin`, and sorts before a floating task due at `08:00` that day

#### Scenario: Crosses midnight
- **WHEN** a task due `02:00 Asia/Tokyo` on the 12th is viewed from Berlin
- **THEN** it appears under the 11th at `19:00` in Today or Upcoming, and the hint shows the 12th in Tokyo

#### Scenario: Same zone as the viewer
- **WHEN** the task's zone equals the viewer's zone
- **THEN** no hint is shown and the row looks like a floating timed task

### Requirement: Fix a due to any zone
Choosing a zone from the zone control SHALL keep the wall-clock date and time currently entered and set that zone, so the due means that clock time in the chosen zone; choosing a different zone for an already zoned due SHALL likewise keep its wall-clock time. Before confirming, the control SHALL preview how the due reads in the viewer's zone. While a due is fixed to a zone other than the viewer's, the Do on editor's date and time fields SHALL show and edit its wall-clock date and time in that zone, and under them a hint SHALL say how it reads in the viewer's zone ("20:00 in Mexico City = 02:00 (3 Nov) your time (Berlin)"); a time typed there SHALL keep the zone. With the viewer's own zone, or a floating due, the fields show the viewer's time and no hint. The change SHALL be one ordinary due edit, applied locally first, working offline and converging like any due edit.

#### Scenario: Meeting in another city
- **WHEN** a Berlin user with a floating due `15:00` on 2026-11-02 picks "America/New_York"
- **THEN** the due becomes `15:00 America/New_York`, the preview and the row show `21:00` for the Berlin user, and the hint names New York

#### Scenario: Offline zone change converges
- **WHEN** one device changes a due's zone offline while another edits its time, and both sync
- **THEN** both devices end with the due value written with the greater timestamp

#### Scenario: Recently used zone
- **WHEN** the user picked "Asia/Tokyo" on a previous task and opens the zone control of another task
- **THEN** "Tokyo" is listed right after the viewer's own zone

#### Scenario: Editing the time of a due in another zone
- **WHEN** a Berlin user's task is due `20:00 America/Mexico_City` and they open its Do on editor
- **THEN** the time field reads `20:00` with the hint "20:00 in Mexico City = 03:00 (3 Nov) your time (Berlin)", and typing `20:30` stores `20:30 America/Mexico_City`
