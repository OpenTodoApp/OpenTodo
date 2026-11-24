# activity-feed Specification

## Purpose
Gives each user one live, cross-project view of what other members changed in shared projects, with unread markers that follow the user across their own devices.

## Requirements

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

### Requirement: Live refresh
While the app is open and connected, the feed and unread counts SHALL reflect another member's change within a few seconds of it reaching the server, using the server wake-up channel to trigger a sync. Without the channel they SHALL refresh on the regular sync triggers, so content is identical and only latency differs.

#### Scenario: Live update
- **WHEN** Bob completes a task while Alice has the feed open on a connected device
- **THEN** the event appears at the top of Alice's feed within a few seconds without any user action

#### Scenario: Channel unavailable
- **WHEN** the wake-up channel cannot connect
- **THEN** the feed still updates on the next periodic or triggered sync and shows no error

### Requirement: Filters
The feed SHALL be filterable by project, by actor and by event kind (completed, created, commented, assigned, rescheduled, other), with filters applied locally and reachable with the keyboard. Filters SHALL not affect unread counts.

#### Scenario: Filter by kind
- **WHEN** the user filters the feed to "commented"
- **THEN** only comment events are listed and the sidebar counts are unchanged

### Requirement: Feed route
`GET /api/v1/activity` SHALL return events across the caller's shared projects newest first with cursor pagination and optional project, actor and kind filters, derived from operations in scopes the caller is a member of. It SHALL require authentication and SHALL never include events from scopes the caller does not belong to.

#### Scenario: Anonymous request
- **WHEN** a request without credentials reaches the feed route
- **THEN** the response is a 401 `unauthorized` error

#### Scenario: Invalid cursor
- **WHEN** the request carries a cursor that is not one the server issued
- **THEN** the response is a 400 `invalid_input` error

#### Scenario: Scope isolation
- **WHEN** Alice requests the feed
- **THEN** no event from a project she is not a member of is included, even if filtered by that project's id

### Requirement: Feed pages read what they need
The feed route SHALL read the histories of the most recently changed entities first, stop once the page and whether another follows are certain, and never read encoded document fields. Every page, cursor and `more` flag SHALL equal what the whole history gives, with every filter. The route only reads; late ops from an offline device appear where their time places them, as before.

#### Scenario: First page of a long history
- **WHEN** a member opens the feed of a project with thousands of tasks and a long history
- **THEN** the first page is served from the histories of the recently changed tasks only, and holds the same events as before

#### Scenario: Paging with filters
- **WHEN** a client pages through the feed with any page size and any combination of project, actor and kind filters
- **THEN** every page and cursor equals the one computed from the whole history

#### Scenario: Bad cursor
- **WHEN** the cursor is not one this route returned
- **THEN** the response is 400 `invalid_input`, as before

### Requirement: Several kinds and time tracking in the feed
The feed's kind filter SHALL accept several kinds at once, an event being listed when it has any of them, in the Updates view and in `GET /api/v1/activity` (`kind` as a comma-separated list; a single kind keeps working as before). The categories SHALL gain `time` (time tracked or changed), listed after rescheduled. Filters SHALL still not affect unread counts.

#### Scenario: Two kinds in Updates
- **WHEN** the user chooses Completed and Commented in Updates
- **THEN** completions and comments are listed, and the sidebar counts are unchanged

#### Scenario: A single kind as before
- **WHEN** a client requests `GET /api/v1/activity?kind=commented`
- **THEN** the answer is the same as before this change
