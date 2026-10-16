# Spec Delta

## MODIFIED Requirements

### Requirement: Label views and counts
The sidebar SHALL show a collapsible "Labels" group at the same level as Projects, inside the sidebar's single scroller, listing non-deleted labels by position with their open-task counts, each opening a view of that label's open tasks across all projects grouped by project. `g l` and the group's "All" action SHALL open the labels overview. Views and counts SHALL be computed from local data and update live.

#### Scenario: Open a label view
- **WHEN** the user selects "errand" in the sidebar
- **THEN** a view lists every open task carrying "errand", grouped by project, with the count matching the sidebar

#### Scenario: Count updates live
- **WHEN** a task carrying "errand" is completed on another device and this device syncs
- **THEN** the "errand" count in the sidebar decreases without a reload

#### Scenario: Reachable under a long tree
- **WHEN** the user has forty projects
- **THEN** scrolling the sidebar's middle part reaches the Labels group, which does not scroll on its own
