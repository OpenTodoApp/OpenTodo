# Spec Delta

## Purpose

Defines saved views: named filter queries with grouping and sort options that sync between devices, can be pinned to the sidebar, chosen as a device's start view, and composed into simple dashboards.

## ADDED Requirements

### Requirement: Saved view entity
A saved view SHALL have a name, a query string in the filter grammar, a kind (`list` or `dashboard`), a grouping, a sort field and direction, a pinned flag, a position, a colour, for dashboards an ordered list of panel view ids, creation time and optional deletion time. Views SHALL be edited as operations applied locally first so they work offline and SHALL converge under per-field last-writer-wins. Unrecognised option values received by sync SHALL fall back to defaults without being rewritten.

#### Scenario: Save offline, appears elsewhere after sync
- **WHEN** the device is offline and the user saves the query `@work & due <= tomorrow & p1` as "Work tomorrow"
- **THEN** the view is available immediately on this device and appears on other devices after the network returns

#### Scenario: Concurrent edits to different options
- **WHEN** device A changes a view's grouping offline while device B changes its sort offline, and both sync
- **THEN** every device shows the new grouping and the new sort

### Requirement: Save and edit a view from the Filter view
The Filter view SHALL offer a "Save view" action (button and `s` shortcut when focus is in the result list) that asks for a name and creates a pinned view with the current query, grouping and sort. Opening a saved view SHALL show its query in an editable input; changing the query or options SHALL update the view after confirmation. A saved view whose query no longer parses SHALL show the parse error and no results.

#### Scenario: Save the current query
- **WHEN** the user runs a query in the Filter view, presses `s`, types "Work tomorrow" and confirms
- **THEN** "Work tomorrow" appears in the sidebar under "Views" and opening it shows the same results

#### Scenario: Edit a saved query
- **WHEN** the user opens "Work tomorrow", changes the query to add `& !@waiting` and confirms
- **THEN** the view's results update, and the changed query is shown on other devices after sync

### Requirement: Pinned views in the sidebar
Pinned views SHALL be listed in a "Views" group in the sidebar ordered by position, each with a live open-task count computed locally, and SHALL be reorderable and unpinnable from their menu. Unpinned views SHALL remain available from a views overview opened with `g v`. The sidebar SHALL reflect pins, order and renames from other devices after sync.

#### Scenario: Count and order
- **WHEN** the user has pinned "Work tomorrow" (4 open matches) and "Waiting" (2) and moves "Waiting" first
- **THEN** the sidebar shows "Waiting 2" above "Work tomorrow 4" on this device now and on others after sync

#### Scenario: Unpin
- **WHEN** the user unpins "Waiting"
- **THEN** it leaves the sidebar and is still listed in the views overview

### Requirement: Grouping and sort options
A list view SHALL group its results by project, due date, priority, label or none, and sort within groups by due date, priority, position, created time or title, ascending or descending, as stored on the view. Defaults SHALL be grouping by project and sort by due date ascending with undated tasks last. Options SHALL be changeable from the view header with the keyboard.

#### Scenario: Group by due date
- **WHEN** the user sets grouping to due date on "Work tomorrow"
- **THEN** results are shown under "Overdue", "Today" and "Tomorrow" headings in that order

#### Scenario: Sort by priority descending within groups
- **WHEN** sort is set to priority with descending direction
- **THEN** within each group priority-1 tasks come first and priority-4 last

### Requirement: Start view per device
The user SHALL be able to choose any built-in or saved view as the start view that opens on launch. The choice SHALL be a per-device preference that persists across reloads and is not synced. If the chosen saved view is deleted, the device SHALL fall back to the Inbox.

#### Scenario: Open on a saved view
- **WHEN** the user sets "Work tomorrow" as the start view on their laptop and relaunches the app
- **THEN** "Work tomorrow" opens first on the laptop while the phone still opens on its own start view

#### Scenario: Deleted start view
- **WHEN** the start view is deleted on another device and this device syncs and relaunches
- **THEN** the Inbox opens and a notice explains the start view was removed

### Requirement: Dashboards
A view of kind `dashboard` SHALL display up to six panels, each showing a chosen saved list view's name, open-task count and its first ten tasks with an "open view" action, laid out in a responsive grid that stacks on narrow screens. Panels SHALL be added, removed and reordered from the dashboard header, and Tab/Shift+Tab SHALL move between panels with `j`/`k` inside one. A panel whose view was deleted SHALL show a placeholder instead of failing.

#### Scenario: Morning review dashboard
- **WHEN** the user creates dashboard "Morning" with panels "Today p1", "Waiting" and "Errands"
- **THEN** three panels show the respective counts and first tasks, update live, and sync to other devices

#### Scenario: Panel view deleted
- **WHEN** "Errands" is deleted while it is a panel of "Morning"
- **THEN** the panel shows "View removed" with a remove action and the other panels work normally

### Requirement: Views API and export
The API SHALL expose `/api/v1/views` with list, get, create, patch and delete following the collection conventions: authentication required, soft delete, write-through to the operation log, unknown fields rejected. Create SHALL require a name and a query that parses; option values outside the allowed sets SHALL be rejected. The export SHALL include a `views` array with deleted views.

#### Scenario: Create a view via the API
- **WHEN** a script POSTs `{"name":"Waiting","query":"@waiting","pinned":true}` to `/api/v1/views` with a bearer token
- **THEN** the response is 201 with the view including `id`, `position`, defaults for grouping and sort, and devices show it after their next sync

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials lists or creates views
- **THEN** the response is 401 `unauthorized`

#### Scenario: Invalid option value
- **WHEN** a create body sets `group_by` to `"colour"`
- **THEN** the response is 400 `invalid_input` and no view is created
