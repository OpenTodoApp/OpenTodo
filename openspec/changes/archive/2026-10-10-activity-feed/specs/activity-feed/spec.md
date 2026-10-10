# Spec Delta

## Purpose

Gives each user one live, cross-project view of what other members changed in shared projects, with unread markers that follow the user across their own devices.

## ADDED Requirements

### Requirement: Cross-project feed
The client SHALL offer a feed view listing activity events from every shared project the user is a member of, newest first, grouped by day, each entry naming the actor, the project and the change. It SHALL be rendered from the locally retained activity so it works offline, and SHALL load older history from the server when online and more exists.

#### Scenario: Feed offline
- **WHEN** the user opens the feed without a network
- **THEN** it lists the events retained locally across all shared projects, newest first, grouped by day

#### Scenario: Older history
- **WHEN** the user reaches the end of the local events while online
- **THEN** older events are fetched from the server and appended without duplicates

### Requirement: Unread tracking per project
Each shared project SHALL carry a per-user "seen until" time stored as an operation in the user's personal scope, so it syncs between the user's devices and is invisible to other members. Events by other actors newer than that time SHALL count as unread; the user's own events never SHALL. Concurrent updates from two devices converge to the later time by last-writer-wins, which can only hide less, never more.

#### Scenario: Unread after someone else's change
- **WHEN** Bob completes a task in a shared project and Alice's device syncs
- **THEN** the project shows one unread event for Alice and the feed total increases by one

#### Scenario: Own change is not unread
- **WHEN** Alice completes a task in a shared project
- **THEN** her unread count for that project does not change

#### Scenario: Seen marker syncs across devices
- **WHEN** Alice opens the feed on her laptop, then opens the app on her phone after it syncs
- **THEN** the phone shows no unread events for that period

### Requirement: Marking as seen
Opening the feed SHALL mark every listed project seen up to the newest displayed event; opening a project's activity view SHALL mark that project seen. Marking SHALL work offline as an ordinary operation and SHALL never advance a seen time backwards.

#### Scenario: Open the feed offline
- **WHEN** the user opens the feed without a network and later reconnects
- **THEN** the unread counts drop to zero immediately and stay zero on their other devices after sync

#### Scenario: Older device syncs later
- **WHEN** a device that last marked a project seen a week ago syncs after another device marked it seen today
- **THEN** the seen time is today on both devices

### Requirement: Unread indicators in the sidebar
The sidebar SHALL show an unread count next to each shared project and a total next to the feed entry, updated live from local storage without a reload, and the feed SHALL be reachable with a `g`-prefixed keyboard shortcut.

#### Scenario: Counts update on sync
- **WHEN** a sync delivers three events by other members in two shared projects
- **THEN** the per-project counts and the feed total update without user action

#### Scenario: Keyboard navigation
- **WHEN** the user presses the feed shortcut, then moves through entries with `j` and `k` and presses Enter
- **THEN** the selected entry's task opens in its project

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
