## ADDED Requirements

### Requirement: Display panel
A list view and the New view page SHALL offer a display panel, opened from the toolbar's display button, that changes how the results are shown and never which tasks match:
- **Layout:** List (rows under group bars) or Board (one column per group, the tasks as cards, the columns in the group order).
- **Group by** and **Order by:** the options of "Grouping and sort options".
- **Completed tasks:** Hide (default) or Show. Show lists completed matches too, as if the query were `(query) & (open | completed)`; a query that names a state itself (`completed`, `open` or a completion date) is unchanged. Sidebar and overview counts stay counts of open matches.
- **Show on rows:** one toggle per row property (date, project, labels, estimate, assignee, deadline, start, origin), all shown by default. A hidden property is left out of every row and card of the view, and the property column keeps no room for it; the task itself still shows every property.
- **More options:** folded by default, holding the sort direction.

On a saved view every change SHALL be written to the view at once, as operations that work offline and converge per field; on the New view page the choices are kept with the page and saved with the view. The panel SHALL be a popover from 640 px and a bottom sheet below it, reachable and operable by keyboard, with every target at least 44 by 44 px on a coarse pointer.

#### Scenario: Board layout
- **WHEN** the user opens the display panel on "Waiting for", grouped by project, and chooses Board
- **THEN** each project becomes a column of cards in the group order, the choice is stored on the view, and other devices show the board after sync

#### Scenario: Show completed
- **WHEN** the user sets Completed tasks to Show on `@errand`
- **THEN** completed errands are listed with their open ones, struck through, while the sidebar's accessible name still counts only the open ones

#### Scenario: Hide a property
- **WHEN** the user turns off Estimate and Project under "Show on rows"
- **THEN** no row of the view shows an estimate or a project and the column keeps no room for them, while opening a task shows both

#### Scenario: Offline
- **WHEN** the device is offline and the user switches a view to the board layout
- **THEN** the board is shown at once and the change reaches other devices after the network returns

### Requirement: Toolbar filter chips
Under the header of a list view and of the New view page, a toolbar SHALL show the query's conditions as chips on the left, followed by "Filter", and the filter and display buttons on the right. A query whose top level is "All of these" SHALL show one chip per condition or group, in words ("Label is waiting", "Due on or before tomorrow", "Any of 2 conditions"), each with its property's icon and "Not" when negated; any other query SHALL show one chip for the whole query. A chip SHALL open the filter panel; "Filter" SHALL open it and start adding a condition. The chips only read the query and SHALL follow every change of it, including changes from other devices after sync. The toolbar SHALL be one row of chrome, wrapping its chips on a narrow screen.

#### Scenario: Chips of a query
- **WHEN** the user opens a view whose query is `@waiting & !@someday & (#Work | #Home)`
- **THEN** the toolbar shows "Label is waiting", "Not Label is someday" and "Any of 2 conditions", then "Filter"

#### Scenario: Add a condition from the toolbar
- **WHEN** the user chooses "Filter" on a view with the filter panel closed
- **THEN** the filter panel opens and the condition editor is shown for a new condition in the top group

#### Scenario: Chips follow sync
- **WHEN** another device adds `& p1` to the view's query and this device syncs
- **THEN** a chip "Priority is P1" appears without a reload

## MODIFIED Requirements

### Requirement: Saved view entity
A saved view SHALL have a name, a query string in the filter grammar, a kind (`list` or `dashboard`), a grouping, a sort field and direction, a pinned flag, a position, a colour, for dashboards an ordered list of panel view ids, for list views an optional on-drop rule (see "On-drop rule") and display options (a layout, `list` or `board`; whether completed matches are listed; the row properties it hides; see "Display panel"), creation time, optional deletion time and an additive `workspace_id` (absent or null means the default workspace). Views SHALL be edited as operations applied locally first so they work offline and SHALL converge under per-field last-writer-wins; the on-drop rule is one field and converges as a whole. Unrecognised option values received by sync SHALL fall back to defaults without being rewritten (an unknown layout reads as `list`, an unknown hidden property is ignored), a view written before the display options existed SHALL read as the list layout with completed matches hidden and every property shown, and a rule key a client does not know SHALL be kept in the row and ignored. A view SHALL be listed, pinned and evaluated within its workspace only: its query matches the tasks of that workspace, and a dashboard's panels that name views of another workspace are shown as unavailable.

#### Scenario: Save offline, appears elsewhere after sync
- **WHEN** the device is offline and the user saves the query `@work & due <= tomorrow & p1` as "Work tomorrow"
- **THEN** the view is available immediately on this device in the current workspace and appears on other devices after the network returns

#### Scenario: Concurrent edits to different options
- **WHEN** device A changes a view's grouping offline while device B changes its sort offline, and both sync
- **THEN** every device shows the new grouping and the new sort

#### Scenario: Concurrent edits to one rule
- **WHEN** device A sets a column's rule to "priority 1" offline while device B sets the same column's rule to "add label errand" offline, and both sync
- **THEN** every device shows the rule written with the greater timestamp, whole, and the other rule is absent on every device

#### Scenario: Older client receives a rule
- **WHEN** a device running a client without on-drop rules syncs a view carrying one
- **THEN** it shows the view as before, keeps the field in its data, and a later edit of the view's name from that device does not remove the rule

#### Scenario: Evaluated in its workspace
- **WHEN** "Personal" and "Work" each have a task with priority 1 due tomorrow and the user opens the view "p1 & due <= tomorrow" saved in Work
- **THEN** only Work's task is listed

#### Scenario: Opened from another workspace
- **WHEN** the user is in "Personal" and opens a Work view from the palette
- **THEN** the device switches to Work and the view is shown with Work's tasks

#### Scenario: Display options converge
- **WHEN** device A switches "Waiting" to the board layout offline while device B hides the estimate on its rows offline, and both sync
- **THEN** every device shows "Waiting" as a board whose cards leave out the estimate

#### Scenario: View from before display options
- **WHEN** a device opens a view whose row has no layout, completed or hidden-properties field
- **THEN** it is shown as a list of open matches with every row property, and nothing is written to the view

### Requirement: Save and edit a view from the Filter view
The New view page (see `filter-queries` "Filter view") SHALL offer "Save as view" in its header (button, and `s` when focus is in the result list). It SHALL turn the header into a card in place, holding a name field with focus, Cancel and Save view, while the conditions, the display options and the results stay on screen; Enter saves, Esc cancels, and an empty name or a failed save shows its message under the name. Saving SHALL create a pinned view with the current query, grouping, order and display options and open it.

Opening a saved view SHALL show its conditions as chips in the toolbar (see "Toolbar filter chips"). The filter panel SHALL hold the same visual builder as the New view page and the query in an editable input; it is closed by default on a saved view and opened with the toolbar's filter button, a chip, "Filter" or `/`, and the choice is kept per device. Changing the query, in the input or in the builder, SHALL update the view after confirmation (Enter or Save); until then the panel's count shows how many tasks the changed query would match. A display option SHALL apply as soon as it is chosen. A saved view whose query no longer parses SHALL show the parse error and no results. The view stores only the query text, so a change made with the builder syncs and converges like a typed one; every edit is an operation that works offline.

#### Scenario: Save the current query
- **WHEN** the user runs a query on the New view page, presses `s`, types "Work tomorrow" in the card and presses Enter
- **THEN** "Work tomorrow" appears in the sidebar under "Views", it opens at `/views/<id>`, and it shows the same results with the same grouping and display options

#### Scenario: Cancel saving
- **WHEN** the user chooses "Save as view", types a name and presses Esc
- **THEN** the card closes, the header is back, no view is created and the query and results are unchanged

#### Scenario: Edit a saved query
- **WHEN** the user opens "Work tomorrow", opens the filter panel, changes the query to add `& !@waiting` and confirms
- **THEN** the view's results update, and the changed query is shown on other devices after sync

#### Scenario: Edit a saved query with the builder
- **WHEN** the user opens "Work tomorrow", opens the filter panel, adds the condition "Label is waiting" with Not set, and confirms with Save
- **THEN** the stored query ends with `& !@waiting`, the results update, and another device shows the same query text after sync

#### Scenario: Count before saving
- **WHEN** the user changes a saved view's query in the builder without confirming
- **THEN** the filter panel shows how many tasks the changed query matches, while the list still shows the saved query's results

### Requirement: Pinned views in the sidebar
Every saved view SHALL be listed in a "Views" group in the sidebar, in the sidebar's single scroller, ordered by position, and SHALL be reorderable from its menu. A sidebar view row SHALL show no count; its open-task count, computed locally, SHALL be in the row's accessible name ("Waiting, 2 open tasks"), on the Views overview opened with `g v` and the group's "All" action, and in the view's page header. A saved view whose query no longer parses SHALL keep an error mark on its row with the message in its accessible name. The Views group SHALL start closed on a device that has not stored a state for it, and SHALL be hidden until the user has a saved view. A pinned saved view SHALL also appear in the sidebar's Favourites group, where "Pin to sidebar" sets its pinned flag and its favourites entry together and unpinning clears both; the Favourites row shows no count either. The sidebar SHALL reflect pins, order and renames from other devices after sync, and counts in the accessible names SHALL update live from local data without a reload.

#### Scenario: Count and order
- **WHEN** the user has saved "Work tomorrow" (4 open matches) and "Waiting" (2) and moves "Waiting" first
- **THEN** the Views group shows "Waiting" above "Work tomorrow" with no visible numbers, their accessible names read "Waiting, 2 open tasks" and "Work tomorrow, 4 open tasks", the Views overview lists "Waiting 2" above "Work tomorrow 4", and the order is the same on other devices after sync

#### Scenario: Count in the header, not the row
- **WHEN** the user opens "Work tomorrow" from the sidebar
- **THEN** the page header's meta reads "4", the sidebar row stays without a number, and completing one match changes the header to "3" and the row's accessible name to "Work tomorrow, 3 open tasks" without a reload

#### Scenario: Pin to Favourites
- **WHEN** the user chooses "Pin to sidebar" on "Waiting"
- **THEN** "Waiting" appears in the Favourites group without a visible count, stays listed in the Views group, and its pinned flag reads true through the API

#### Scenario: Unpin
- **WHEN** the user unpins "Waiting"
- **THEN** it leaves the Favourites group and is still listed in the Views group and the Views overview

#### Scenario: Closed on a new device
- **WHEN** a user with three saved views signs in on a new device
- **THEN** the Views group header reads "Views 3" with no rows under it, opening it lists the three rows, and the choice is remembered on that device only

### Requirement: Saved filters and boards in the user interface
The user interface SHALL call saved views "views" and dashboards "boards": the sidebar group and the overview are "Views", the overview's sections are "Saved views" and "Boards", the page that builds a new query is "New view", and a view's header reads "Views › <name>", where "Views" opens the overview. The addresses SHALL be `/views` (the overview), `/views/new` (the New view page, with an optional `?q=` query) and `/views/<id>` (a view or a board). The earlier addresses `/filter` and `/view/<id>` SHALL keep working and SHALL be replaced in place by the new ones without adding a history entry. Data, operations, the API and the export keep their names (`view`, `/api/v1/views`); the query language stays "filter queries", and the conditions of a view are its filter.

#### Scenario: Group name
- **WHEN** the user looks at the sidebar
- **THEN** the group is titled "Views" and its overview page is titled "Views" with "Saved views" and "Boards" as its sections

#### Scenario: View header
- **WHEN** the user opens "Waiting for"
- **THEN** the header reads "Views › Waiting for", and choosing "Views" opens the overview

#### Scenario: Old address
- **WHEN** the user opens a bookmark to `/view/<id>` or `/filter`
- **THEN** the view or the New view page opens and the address bar shows `/views/<id>` or `/views/new`, and Back leaves the app as before

### Requirement: Grouping and sort options
A list view SHALL group its results by project, due date, priority, label or none, and sort within groups by due date, priority, position, created time or title, ascending or descending, as stored on the view. Defaults SHALL be grouping by project and sort by due date ascending with undated tasks last. Options SHALL be changeable from the view's display panel (see "Display panel") with the keyboard; the sort direction is under its "More options". The New view page SHALL group and sort the same way, so a saved view shows what was seen before saving.

#### Scenario: Group by due date
- **WHEN** the user sets grouping to due date on "Work tomorrow"
- **THEN** results are shown under "Earlier", "Today" and "Tomorrow" headings in that order

#### Scenario: Sort by priority descending within groups
- **WHEN** sort is set to priority with descending direction
- **THEN** within each group priority-1 tasks come first and priority-4 last

#### Scenario: Same order before and after saving
- **WHEN** the user groups the New view page's results by priority and orders them by title, then saves the view
- **THEN** the saved view shows the same groups in the same order

### Requirement: Views API and export
The API SHALL expose `/api/v1/views` with list, get, create, patch and delete following the collection conventions: authentication required, soft delete, write-through to the operation log, unknown fields rejected. Create SHALL require a name and a query that parses; option values outside the allowed sets SHALL be rejected. `layout` SHALL be `list` or `board`, `show_completed` a boolean and `hidden_props` a list of row properties (`date`, `project`, `labels`, `estimate`, `assignee`, `deadline`, `start`, `origin`); a view created without them reads as the list layout with completed matches hidden and every property shown. `on_drop` SHALL be accepted on list views only, as `null` or an object whose keys and values are those of the on-drop rule, with label ids that exist and are not deleted and a section that belongs to the named project; it SHALL be replaced as a whole on patch. The export SHALL include a `views` array with deleted views, each view carrying `on_drop`.

#### Scenario: Create a view via the API
- **WHEN** a script POSTs `{"name":"Waiting","query":"@waiting","pinned":true}` to `/api/v1/views` with a bearer token
- **THEN** the response is 201 with the view including `id`, `position`, defaults for grouping and sort, `on_drop` null, and devices show it after their next sync

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials lists or creates views
- **THEN** the response is 401 `unauthorized`

#### Scenario: Invalid option value
- **WHEN** a create body sets `group_by` to `"colour"`
- **THEN** the response is 400 `invalid_input` and no view is created

#### Scenario: Set a rule via the API
- **WHEN** a script PATCHes `{"on_drop":{"priority":1,"due":"today"}}` on a list view with a bearer token
- **THEN** the response is 200 with the view carrying that rule, and a card dropped into a panel showing the view on any device after sync gets priority 1 and today's date

#### Scenario: Invalid rule
- **WHEN** a patch body sets `on_drop` to `{"priority":5}`, to `{"due":"friday"}`, to `{"add_labels":["<unknown id>"]}`, to `{"colour":"red"}`, or sets any rule on a view of kind `dashboard`
- **THEN** the response is 400 `invalid_input` naming the field and nothing is written

#### Scenario: Export carries rules
- **WHEN** the user downloads the export after giving a saved filter a rule
- **THEN** the view appears in `views` with its `on_drop` object, and views without a rule carry `"on_drop": null`

#### Scenario: Display options via the API
- **WHEN** a script PATCHes `{"layout":"board","hidden_props":["estimate"]}` on a list view with a bearer token
- **THEN** the response is 200 with the view carrying both values, and devices show the view as a board without estimates after their next sync

#### Scenario: Invalid display option
- **WHEN** a patch body sets `layout` to `"grid"` or `hidden_props` to `["colour"]`
- **THEN** the response is 400 `invalid_input` naming the field and nothing is written
