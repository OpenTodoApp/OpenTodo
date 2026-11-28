## MODIFIED Requirements

### Requirement: Tracked time on rows and in Today
When a task has entries its row SHALL show the tracked total in the estimate chip as `tracked / estimate` (`35m / 1h`), or `35m tracked` without an estimate; a running entry SHALL count to the current minute. Today's page header SHALL show the day's tracked total (the user's entries that started on the local day, running ones to now) beside the planned total (the estimates of the open tasks listed), both computed on the device and both live; a total that is zero SHALL be left out, and with both zero the header shows neither. Nothing SHALL be stored or sent for these figures.

#### Scenario: Chip with tracked and estimate
- **WHEN** a task estimated at one hour has entries totalling 35 minutes
- **THEN** its row chip reads `35m / 1h` and its accessible name reads "35 minutes tracked of 1 hour estimated"

#### Scenario: Today totals
- **WHEN** Today lists open tasks estimated at 3 hours and the user tracked 1 hour 20 minutes since midnight
- **THEN** the header reads "3h planned · 1h 20m tracked" and the tracked figure grows as the running entry ticks

#### Scenario: Offline totals
- **WHEN** the device is offline
- **THEN** rows and Today show the same totals from local data with no request

#### Scenario: Nothing tracked yet
- **WHEN** Today lists open tasks estimated at 3 hours and the user has tracked nothing today
- **THEN** the header reads "3h planned", without "0m tracked"
