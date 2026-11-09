## MODIFIED Requirements

### Requirement: Favourites group
The Favourites group SHALL list the user's pinned projects, labels, saved filters and standalone notes in the user's order, each project, label and filter with the icon or colour and the live open-task count its own group shows, and each note with the note icon, its title ("Untitled note" when empty) and no count, opening the same destination (a note docked or as a page). Items SHALL be reorderable from their menus and by keyboard, and unpinnable from their menus. The group SHALL reflect pins, order and renames from the user's other devices after sync, and SHALL render from local data so it is correct offline.

#### Scenario: Mixed kinds in order
- **WHEN** the user pins "Website launch" (project, 5 open), "Deep work" (filter, 4 matches) and "errand" (label, 3 open) and moves "Deep work" to the top
- **THEN** the group reads "Deep work 4", "Website launch 5", "errand 3" on this device now and on other devices after sync, and each row opens its view

#### Scenario: Pinned item removed
- **WHEN** a pinned project is archived or deleted on another device and this device syncs
- **THEN** it leaves the Favourites group without a reload and reappears if it is restored

#### Scenario: Pinned offline
- **WHEN** the device is offline and the user pins a label
- **THEN** it appears in Favourites at once, survives a reload, and reaches the user's other devices when the network returns

#### Scenario: Pinned note
- **WHEN** the user pins the note "Wi-Fi" and renames it "Home Wi-Fi" on another device
- **THEN** the group shows "Home Wi-Fi" with the note icon and no count after sync, and activating it opens the note
