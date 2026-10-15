# Spec Delta

## MODIFIED Requirements

### Requirement: Cross-project feed
The client SHALL offer a view named "Updates" listing activity events from every shared project the user is a member of, newest first, grouped by day, each entry naming the actor, the project and the change. It SHALL be rendered from the locally retained activity so it works offline, and SHALL load older history from the server when online and more exists. Its address SHALL be `/updates`; `/activity` SHALL redirect to it.

#### Scenario: Feed offline
- **WHEN** the user opens Updates without a network
- **THEN** it lists the events retained locally across all shared projects, newest first, grouped by day

#### Scenario: Older history
- **WHEN** the user reaches the end of the local events while online
- **THEN** older events are fetched from the server and appended without duplicates

#### Scenario: Old address
- **WHEN** the user opens a bookmark to `/activity`
- **THEN** Updates opens and the address reads `/updates`

### Requirement: Unread indicators in the sidebar
The sidebar SHALL show an unread count next to each shared project and a total next to the Updates entry in the More group, updated live from local storage without a reload, and Updates SHALL be reachable with a `g`-prefixed keyboard shortcut. While the total is above zero the Updates entry SHALL also be visible as a badge on the More group's header when the group is collapsed.

#### Scenario: Counts update on sync
- **WHEN** a sync delivers three events by other members in two shared projects
- **THEN** the per-project counts and the Updates total update without user action

#### Scenario: Keyboard navigation
- **WHEN** the user presses the Updates shortcut, then moves through entries with `j` and `k` and presses Enter
- **THEN** the selected entry's task opens in its project

#### Scenario: Collapsed More group
- **WHEN** the More group is collapsed and there are unread updates
- **THEN** the group header shows the unread badge
