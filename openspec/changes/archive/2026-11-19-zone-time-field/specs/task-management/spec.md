## MODIFIED Requirements

### Requirement: Fix a due to any zone
Choosing a zone from the zone control SHALL keep the wall-clock date and time currently entered and set that zone, so the due means that clock time in the chosen zone; choosing a different zone for an already zoned due SHALL likewise keep its wall-clock time. Before confirming, the control SHALL preview how the due reads in the viewer's zone. While a due is fixed to a zone other than the viewer's, the Do on segment of the task panel SHALL show and edit the due's date and time in that zone (its stored wall-clock date and time), and the time line SHALL show the same moment in the viewer's zone as a hint ("03:00 your time", with the date when it differs); a typed date or time there SHALL mean that zone's clock. Lists, headings and the panel's summary SHALL keep showing the viewer's time ("Display in the viewer's zone"). For a floating due, or one fixed to the viewer's own zone, the fields SHALL read as before and show no hint. The change SHALL be one ordinary due edit, applied locally first, working offline and converging like any due edit.

#### Scenario: Meeting in another city
- **WHEN** a Berlin user with a floating due `15:00` on 2026-11-02 picks "America/New_York"
- **THEN** the due becomes `15:00 America/New_York`, the preview and the row show `21:00` for the Berlin user, and the hint names New York

#### Scenario: Offline zone change converges
- **WHEN** one device changes a due's zone offline while another edits its time, and both sync
- **THEN** both devices end with the due value written with the greater timestamp

#### Scenario: Recently used zone
- **WHEN** the user picked "Asia/Tokyo" on a previous task and opens the zone control of another task
- **THEN** "Tokyo" is listed right after the viewer's own zone

#### Scenario: Edit the time in the task's zone
- **WHEN** a Madrid user has a due `20:00 America/Mexico_City` on 2026-11-20 and opens the Do on segment
- **THEN** the time field reads `20:00`, the date reads 2026-11-20 and the hint reads `03:00 (21 Nov) your time`; typing `21:00` stores `21:00 America/Mexico_City`

#### Scenario: Zone first, time second
- **WHEN** a Madrid user fixes a floating `09:00` due to "America/Mexico_City" and then types `20:00` in the time field
- **THEN** the due becomes `20:00 America/Mexico_City`, and the row shows `03:00` the next day for the Madrid user

