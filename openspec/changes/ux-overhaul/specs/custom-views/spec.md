# Spec Delta

## MODIFIED Requirements

### Requirement: Pinned views in the sidebar
Pinned saved filters SHALL be listed in a "Filters" group in the sidebar, in the sidebar's single scroller, ordered by position, each with a live open-task count computed locally, and SHALL be reorderable and unpinnable from their menu. Unpinned saved filters SHALL remain available from the Filters overview opened with `g v` and from the group's "All" action. The user interface SHALL call them saved filters and dashboards boards of filters; routes and data keep their names. The sidebar SHALL reflect pins, order and renames from other devices after sync.

#### Scenario: Count and order
- **WHEN** the user has pinned "Work tomorrow" (4 open matches) and "Waiting" (2) and moves "Waiting" first
- **THEN** the sidebar shows "Waiting 2" above "Work tomorrow 4" on this device now and on others after sync

#### Scenario: Unpin
- **WHEN** the user unpins "Waiting"
- **THEN** it leaves the sidebar and is still listed in the Filters overview

#### Scenario: Group name
- **WHEN** the user looks at the sidebar
- **THEN** the group is titled "Filters" and its overview page is titled "Filters" with "Saved filters" and "Boards" as its sections
