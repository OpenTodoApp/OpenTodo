# Spec Delta

## MODIFIED Requirements

### Requirement: Pinned views in the sidebar
Every saved filter SHALL be listed in a "Filters" group in the sidebar, in the sidebar's single scroller, ordered by position, and SHALL be reorderable from its menu. A sidebar filter row SHALL show no count; its open-task count, computed locally, SHALL be in the row's accessible name ("Waiting, 2 open tasks"), on the Filters overview opened with `g v` and the group's "All" action, and in the view's page header. A saved filter whose query no longer parses SHALL keep an error mark on its row with the message in its accessible name. The Filters group SHALL start closed on a device that has not stored a state for it, and SHALL be hidden until the user has a saved filter. A pinned saved filter SHALL also appear in the sidebar's Favourites group, where "Pin to sidebar" sets its pinned flag and its favourites entry together and unpinning clears both; the Favourites row shows no count either. The sidebar SHALL reflect pins, order and renames from other devices after sync, and counts in the accessible names SHALL update live from local data without a reload.

#### Scenario: Count and order
- **WHEN** the user has saved "Work tomorrow" (4 open matches) and "Waiting" (2) and moves "Waiting" first
- **THEN** the Filters group shows "Waiting" above "Work tomorrow" with no visible numbers, their accessible names read "Waiting, 2 open tasks" and "Work tomorrow, 4 open tasks", the Filters overview lists "Waiting 2" above "Work tomorrow 4", and the order is the same on other devices after sync

#### Scenario: Count in the header, not the row
- **WHEN** the user opens "Work tomorrow" from the sidebar
- **THEN** the page header's meta reads "4", the sidebar row stays without a number, and completing one match changes the header to "3" and the row's accessible name to "Work tomorrow, 3 open tasks" without a reload

#### Scenario: Pin to Favourites
- **WHEN** the user chooses "Pin to sidebar" on "Waiting"
- **THEN** "Waiting" appears in the Favourites group without a visible count, stays listed in the Filters group, and its pinned flag reads true through the API

#### Scenario: Unpin
- **WHEN** the user unpins "Waiting"
- **THEN** it leaves the Favourites group and is still listed in the Filters group and the Filters overview

#### Scenario: Closed on a new device
- **WHEN** a user with three saved filters signs in on a new device
- **THEN** the Filters group header reads "Filters 3" with no rows under it, opening it lists the three rows, and the choice is remembered on that device only
