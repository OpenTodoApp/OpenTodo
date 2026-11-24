## MODIFIED Requirements

### Requirement: Unread tracking per project
Each shared project SHALL carry a per-user "seen until" time stored as an operation in the user's personal scope, so it syncs between the user's devices and is invisible to other members. Events by other actors newer than that time SHALL count as unread; the user's own events never SHALL. An event that only changes where a task or project sits (its order, its parent or its section) SHALL NOT count as unread; it stays in the feed and in the project's activity. Concurrent updates from two devices converge to the later time by last-writer-wins, which can only hide less, never more. Offline, the counts are computed from local events and seen times the same way.

#### Scenario: Unread after someone else's change
- **WHEN** Bob completes a task in a shared project and Alice's device syncs
- **THEN** the project shows one unread event for Alice and the feed total increases by one

#### Scenario: Own change is not unread
- **WHEN** Alice completes a task in a shared project
- **THEN** her unread count for that project does not change

#### Scenario: Rearranging is not unread
- **WHEN** Bob drags three tasks into a new order in a shared project, nests one under another and renames a fourth, and Alice's device syncs
- **THEN** the project has one unread event for Alice, the rename, and the feed still lists the drags

#### Scenario: Seen marker syncs across devices
- **WHEN** Alice opens the feed on her laptop, then opens the app on her phone after it syncs
- **THEN** the phone shows no unread events for that period

### Requirement: Marking as seen
Opening the feed SHALL mark every listed project seen up to the newest displayed event; opening a project's activity view SHALL mark that project seen. While a shared project's task list is on screen and the page is visible, that project SHALL be kept seen up to its newest event, including events that arrive while it is open; while the page is hidden (a background tab, a closed laptop) nothing SHALL be marked, and the project SHALL be marked again when the page becomes visible. Marking SHALL work offline as an ordinary operation and SHALL never advance a seen time backwards.

#### Scenario: Open the feed offline
- **WHEN** the user opens the feed without a network and later reconnects
- **THEN** the unread counts drop to zero immediately and stay zero on their other devices after sync

#### Scenario: Older device syncs later
- **WHEN** a device that last marked a project seen a week ago syncs after another device marked it seen today
- **THEN** the seen time is today on both devices

#### Scenario: Reading the list
- **WHEN** Alice opens a shared project with unread changes, and Bob adds a task to it while it is on her screen
- **THEN** the project has no unread changes for Alice, then or after Bob's task arrives, and another shared project keeps its own

#### Scenario: A list left open in a background tab
- **WHEN** Alice leaves a shared project open in a tab she switches away from, and Bob adds a task
- **THEN** the project shows the unread change until Alice returns to the tab, and then it is seen

### Requirement: Unread indicators in the sidebar
The sidebar SHALL show a dot, named "Unread changes", next to each shared project with unread changes, and the total count next to the Updates entry in the More group, updated live from local storage without a reload, and Updates SHALL be reachable with a `g`-prefixed keyboard shortcut. The More group's header carries no badge (app-shell "More is a labelled group"); the total stays on the Updates entry.

#### Scenario: Counts update on sync
- **WHEN** a sync delivers three events by other members in two shared projects
- **THEN** both projects show the dot and the Updates total updates without user action

#### Scenario: A dot, not a number
- **WHEN** a shared project with 20 open tasks has 2 unread changes
- **THEN** its row shows the open-task count and a dot, and no second number

#### Scenario: Keyboard navigation
- **WHEN** the user presses the Updates shortcut, then moves through entries with `j` and `k` and presses Enter
- **THEN** the selected entry's task opens in its project

#### Scenario: Collapsed More group
- **WHEN** the More group is collapsed and there are unread updates
- **THEN** the group header shows no badge, and opening the group shows the total on the Updates entry
