# Spec Delta

## MODIFIED Requirements

### Requirement: Label views and counts
The sidebar SHALL show a collapsible "Labels" group at the same level as Projects, inside the sidebar's single scroller, closed on a device that has not stored a state for it, listing non-deleted labels by position with their open-task counts, each opening a view of that label's open tasks across all projects grouped by project; a pinned label SHALL also appear in the Favourites group. `g l` and the group's "All" action SHALL open the labels overview. Views and counts SHALL be computed from local data and update live.

#### Scenario: Open a label view
- **WHEN** the user selects "errand" in the sidebar
- **THEN** a view lists every open task carrying "errand", grouped by project, with the count matching the sidebar

#### Scenario: Count updates live
- **WHEN** a task carrying "errand" is completed on another device and this device syncs
- **THEN** the "errand" count in the sidebar decreases without a reload

#### Scenario: Reachable under a long tree
- **WHEN** the user has forty projects
- **THEN** scrolling the sidebar's middle part reaches the Labels group, which does not scroll on its own

#### Scenario: Closed by default, pinned label visible
- **WHEN** the user has pinned "errand" and opens the app on a new device
- **THEN** "errand" is listed in Favourites with its count, and the Labels group header reads "Labels" with its count and no rows until the user opens it

## ADDED Requirements

### Requirement: Pin a label
Every label menu (the sidebar row, the labels overview, the label view header) SHALL offer a checkable "Pin to sidebar" that adds the label to, or removes it from, the user's favourites, as a change to the user's preference and not to the label. The label SHALL stay in the Labels group either way.

#### Scenario: Pin from the overview
- **WHEN** the user opens the menu of "errand" on the labels overview and checks "Pin to sidebar"
- **THEN** "errand" appears in the Favourites group with its count, the item reads as checked in the sidebar row's menu too, and exactly one preference operation is queued

#### Scenario: Merged away
- **WHEN** a pinned label is merged into another label
- **THEN** it leaves the Favourites group and the surviving label is not pinned unless it already was
