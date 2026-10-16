# Spec Delta

## MODIFIED Requirements

### Requirement: Pinned views in the sidebar
Every saved filter SHALL be listed in a "Filters" group in the sidebar, in the sidebar's single scroller, ordered by position, each with a live open-task count computed locally, and SHALL be reorderable from its menu. A pinned saved filter SHALL also appear in the sidebar's Favourites group, where "Pin to sidebar" sets its pinned flag and its favourites entry together and unpinning clears both. The Filters overview opened with `g v` and the group's "All" action SHALL list every saved filter. The sidebar SHALL reflect pins, order and renames from other devices after sync.

#### Scenario: Count and order
- **WHEN** the user has saved "Work tomorrow" (4 open matches) and "Waiting" (2) and moves "Waiting" first
- **THEN** the Filters group shows "Waiting 2" above "Work tomorrow 4" on this device now and on others after sync

#### Scenario: Pin to Favourites
- **WHEN** the user chooses "Pin to sidebar" on "Waiting"
- **THEN** "Waiting" appears in the Favourites group with its count, stays listed in the Filters group, and its pinned flag reads true through the API

#### Scenario: Unpin
- **WHEN** the user unpins "Waiting"
- **THEN** it leaves the Favourites group and is still listed in the Filters group and the Filters overview

### Requirement: View menu actions
Every saved view SHALL have one action menu, the same in the sidebar, the views overview, the view header and on dashboards, offering Rename, a checkable "Pin to sidebar", a checkable "Start view on this device", Move up, Move down and Delete view. Deleting SHALL require confirming a dialog stating that tasks are not affected. Pin, order and rename are operations that work offline and converge; the start view stays a per-device preference.

#### Scenario: Same menu everywhere
- **WHEN** the user opens the menu of "Waiting" from the sidebar and then from the view header
- **THEN** both menus list the same items in the same order with the same checked states

#### Scenario: Start view is checked
- **WHEN** "Waiting" is the start view on this device and the user opens its menu
- **THEN** "Start view on this device" is checked; activating another view's item moves the check there and is not synced to other devices

#### Scenario: Delete needs confirmation
- **WHEN** the user chooses "Delete view" on "Waiting"
- **THEN** a dialog names the view and says its tasks are not affected, and the view is deleted only after "Delete view" is pressed, offline included

#### Scenario: Move within Favourites
- **WHEN** "Waiting" is pinned and the user chooses Move up from its menu in the Favourites group
- **THEN** it moves up among the favourites, and its position among the saved filters is unchanged
