# Spec Delta

## ADDED Requirements

### Requirement: View menu actions
Every saved view SHALL have one action menu, the same in the sidebar, the views overview, the view header and on dashboards, offering Rename, a checkable "Pinned to sidebar", a checkable "Start view on this device", Move up, Move down and Delete view. Deleting SHALL require confirming a dialog stating that tasks are not affected. Pin, order and rename are operations that work offline and converge; the start view stays a per-device preference.

#### Scenario: Same menu everywhere
- **WHEN** the user opens the menu of "Waiting" from the sidebar and then from the view header
- **THEN** both menus list the same items in the same order with the same checked states

#### Scenario: Start view is checked
- **WHEN** "Waiting" is the start view on this device and the user opens its menu
- **THEN** "Start view on this device" is checked; activating another view's item moves the check there and is not synced to other devices

#### Scenario: Delete needs confirmation
- **WHEN** the user chooses "Delete view" on "Waiting"
- **THEN** a dialog names the view and says its tasks are not affected, and the view is deleted only after "Delete view" is pressed, offline included
