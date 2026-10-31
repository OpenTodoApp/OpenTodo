## ADDED Requirements

### Requirement: Habit history across a split
For a habit whose series was split (OpenSpec `recurring-tasks`, "Pieces of one lineage"), the scheduled dates SHALL be, for each piece, the dates its rule produces within the piece's range, plus every date with a record of any piece of the lineage. The current and best streaks and the month history SHALL be computed over the lineage as over one series, on the device only, so every device with the same rows shows the same values. A piece SHALL inherit the habit flag at the split.

#### Scenario: Gym days change mid-month
- **WHEN** a habit `every mon, wed, fri` has done records for every scheduled day up to Monday the 19th, is split from Tuesday the 20th to `every tue, thu`, and the 20th is done
- **THEN** the streak counts the days before and after the split as one chain, and the month grid shows Mondays, Wednesdays and Fridays as scheduled up to the 19th and Tuesdays and Thursdays from the 20th

#### Scenario: Same streak on two devices
- **WHEN** two devices hold the same lineage and records
- **THEN** both show the same current and best streak
