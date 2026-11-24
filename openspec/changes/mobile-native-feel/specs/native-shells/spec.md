## ADDED Requirements

### Requirement: Feel changes are checked on devices
Every change that alters how the shells or the web app feel on a phone or tablet (motion, gestures, presses, haptics, the keyboard, tablet layouts) SHALL add rows to the device check list in `mobile/AUDIT.md` and SHALL NOT be archived until those rows have passed on at least one iPhone and one Android phone, and on an iPad for a tablet change. A row that cannot be run SHALL be recorded as not run, with the reason. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: A step without a device check
- **WHEN** a feel change has ticked every task but its device check rows have not been run
- **THEN** it stays open, and its tasks name the rows still to run
