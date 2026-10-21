# Spec Delta

## MODIFIED Requirements

### Requirement: Label views and counts
The sidebar SHALL show a collapsible "Labels" group at the same level as Projects, inside the sidebar's single scroller, closed on a device that has not stored a state for it and hidden until the user has a label, listing non-deleted labels by position, each opening a view of that label's open tasks across all projects grouped by project. A sidebar label row SHALL show no count; the label's open-task count SHALL be in the row's accessible name ("errand, 3 open tasks"), on the labels overview, and in the label view's page header. A pinned label SHALL also appear in the Favourites group, without a visible count. `g l` and the group's "All" action SHALL open the labels overview. Views and the counts in accessible names and on the overview SHALL be computed from local data and update live, so they are correct offline and follow other devices after sync.

#### Scenario: Open a label view
- **WHEN** the user selects "errand" in the sidebar
- **THEN** a view lists every open task carrying "errand", grouped by project, with the page header's count matching the row's accessible name

#### Scenario: Count updates live
- **WHEN** a task carrying "errand" is completed on another device and this device syncs
- **THEN** the "errand" count in the labels overview and in the sidebar row's accessible name decreases without a reload, and the sidebar row still shows no number

#### Scenario: Reachable under a long tree
- **WHEN** the user has forty projects
- **THEN** scrolling the sidebar's middle part reaches the Labels group, which does not scroll on its own

#### Scenario: Closed by default, pinned label visible
- **WHEN** the user has pinned "errand" and opens the app on a new device
- **THEN** "errand" is listed in Favourites without a number, and the Labels group header reads "Labels" with its item count and no rows until the user opens it

#### Scenario: Numbers on the overview
- **WHEN** the user opens the labels overview with "errand" (3 open tasks) and "home" (none)
- **THEN** "errand" shows 3 and "home" shows no number, as before this change

## ADDED Requirements

### Requirement: Pin a label
Every label menu (the sidebar row, the labels overview, the label view header) SHALL offer a checkable "Pin to sidebar" that adds the label to, or removes it from, the user's favourites, as a change to the user's preference and not to the label. The label SHALL stay in the Labels group either way.

#### Scenario: Pin from the overview
- **WHEN** the user opens the menu of "errand" on the labels overview and checks "Pin to sidebar"
- **THEN** "errand" appears in the Favourites group with its count, the item reads as checked in the sidebar row's menu too, and exactly one preference operation is queued

#### Scenario: Merged away
- **WHEN** a pinned label is merged into another label
- **THEN** it leaves the Favourites group and the surviving label is not pinned unless it already was
