# Spec Delta

## ADDED Requirements

### Requirement: One ticked task on touch
On a touch screen, the long press that ticks a row SHALL give its haptic pulse only while the user's haptic feedback preference is on (`appearance-preferences` "Haptic feedback preference"). While exactly one task is ticked, the selection bar's Actions menu SHALL be that task's full actions menu: the items the row menu offers for one task, including Start tracking and Start focus where they apply. A long press on a coarse pointer SHALL keep ticking the row and SHALL NOT open the menu. Selection stays device state and writes nothing.

#### Scenario: Haptics off
- **WHEN** the user turned haptic feedback off and long-presses a row on an Android phone
- **THEN** the row is ticked and the selection bar appears, and the device does not vibrate

#### Scenario: Start focus from the phone bar
- **WHEN** a user on a phone long-presses "Write the report" and taps Actions in the selection bar
- **THEN** the menu lists Complete, Schedule…, Start tracking and Start focus at its top, and choosing Start focus opens the Focus screen on that task with a session running

#### Scenario: Two ticked tasks
- **WHEN** two rows are ticked on a phone and the user taps Actions
- **THEN** the menu offers the batch actions only, without Start tracking or Start focus
