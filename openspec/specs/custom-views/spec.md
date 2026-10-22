# custom-views Specification

## Purpose
Defines saved views: named filter queries with grouping and sort options that sync between devices, can be pinned to the sidebar, chosen as a device's start view, and composed into simple dashboards.

## Requirements

### Requirement: Saved view entity
A saved view SHALL have a name, a query string in the filter grammar, a kind (`list` or `dashboard`), a grouping, a sort field and direction, a pinned flag, a position, a colour, for dashboards an ordered list of panel view ids, for list views an optional on-drop rule (see "On-drop rule"), creation time and optional deletion time. Views SHALL be edited as operations applied locally first so they work offline and SHALL converge under per-field last-writer-wins; the on-drop rule is one field and converges as a whole. Unrecognised option values received by sync SHALL fall back to defaults without being rewritten, and a rule key a client does not know SHALL be kept in the row and ignored.

#### Scenario: Save offline, appears elsewhere after sync
- **WHEN** the device is offline and the user saves the query `@work & due <= tomorrow & p1` as "Work tomorrow"
- **THEN** the view is available immediately on this device and appears on other devices after the network returns

#### Scenario: Concurrent edits to different options
- **WHEN** device A changes a view's grouping offline while device B changes its sort offline, and both sync
- **THEN** every device shows the new grouping and the new sort

#### Scenario: Concurrent edits to one rule
- **WHEN** device A sets a column's rule to "priority 1" offline while device B sets the same column's rule to "add label errand" offline, and both sync
- **THEN** every device shows the rule written with the greater timestamp, whole, and the other rule is absent on every device

#### Scenario: Older client receives a rule
- **WHEN** a device running a client without on-drop rules syncs a view carrying one
- **THEN** it shows the view as before, keeps the field in its data, and a later edit of the view's name from that device does not remove the rule

### Requirement: Save and edit a view from the Filter view
The Filter view SHALL offer a "Save view" action (button and `s` shortcut when focus is in the result list) that asks for a name and creates a pinned view with the current query, grouping and sort. Opening a saved view SHALL show its query in an editable input; changing the query or options SHALL update the view after confirmation. A saved view whose query no longer parses SHALL show the parse error and no results.

#### Scenario: Save the current query
- **WHEN** the user runs a query in the Filter view, presses `s`, types "Work tomorrow" and confirms
- **THEN** "Work tomorrow" appears in the sidebar under "Views" and opening it shows the same results

#### Scenario: Edit a saved query
- **WHEN** the user opens "Work tomorrow", changes the query to add `& !@waiting` and confirms
- **THEN** the view's results update, and the changed query is shown on other devices after sync

### Requirement: Pinned views in the sidebar
Every saved filter SHALL be listed in a "Filters" group in the sidebar, in the sidebar's single scroller, ordered by position, and SHALL be reorderable from its menu. A sidebar filter row SHALL show no count; its open-task count, computed locally, SHALL be in the row's accessible name ("Waiting, 2 open tasks"), on the Filters overview opened with `g v` and the group's "All" action, and in the view's page header. A saved filter whose query no longer parses SHALL keep an error mark on its row with the message in its accessible name. The Filters group SHALL start closed on a device that has not stored a state for it, and SHALL be hidden until the user has a saved filter. A pinned saved filter SHALL also appear in the sidebar's Favourites group, where "Pin to sidebar" sets its pinned flag and its favourites entry together and unpinning clears both; the Favourites row shows no count either. The sidebar SHALL reflect pins, order and renames from other devices after sync, and counts in the accessible names SHALL update live from local data without a reload.

#### Scenario: Count and order
- **WHEN** the user has saved "Work tomorrow" (4 open matches) and "Waiting" (2) and moves "Waiting" first
- **THEN** the Filters group shows "Waiting" above "Work tomorrow" with no visible numbers, their accessible names read "Waiting, 2 open tasks" and "Work tomorrow, 4 open tasks", the Filters overview lists "Waiting 2" above "Work tomorrow 4", and the order is the same on other devices after sync

#### Scenario: Count in the header, not the row
- **WHEN** the user opens "Work tomorrow" from the sidebar
- **THEN** the page header's meta reads "4", the sidebar row stays without a number, and completing one match changes the header to "3" and the row's accessible name to "Work tomorrow, 3 open tasks" without a reload

#### Scenario: Pin to Favourites
- **WHEN** the user chooses "Pin to sidebar" on "Waiting"
- **THEN** "Waiting" appears in the Favourites group without a visible count, stays listed in the Filters group, and its pinned flag reads true through the API

#### Scenario: Unpin
- **WHEN** the user unpins "Waiting"
- **THEN** it leaves the Favourites group and is still listed in the Filters group and the Filters overview

#### Scenario: Closed on a new device
- **WHEN** a user with three saved filters signs in on a new device
- **THEN** the Filters group header reads "Filters 3" with no rows under it, opening it lists the three rows, and the choice is remembered on that device only

### Requirement: Saved filters and boards in the user interface
The user interface SHALL call saved views saved filters and dashboards boards of filters; routes and data keep their names.

#### Scenario: Group name
- **WHEN** the user looks at the sidebar
- **THEN** the group is titled "Filters" and its overview page is titled "Filters" with "Saved filters" and "Boards" as its sections

### Requirement: Grouping and sort options
A list view SHALL group its results by project, due date, priority, label or none, and sort within groups by due date, priority, position, created time or title, ascending or descending, as stored on the view. Defaults SHALL be grouping by project and sort by due date ascending with undated tasks last. Options SHALL be changeable from the view header with the keyboard.

#### Scenario: Group by due date
- **WHEN** the user sets grouping to due date on "Work tomorrow"
- **THEN** results are shown under "Overdue", "Today" and "Tomorrow" headings in that order

#### Scenario: Sort by priority descending within groups
- **WHEN** sort is set to priority with descending direction
- **THEN** within each group priority-1 tasks come first and priority-4 last

### Requirement: Start view per device
The user SHALL be able to choose any built-in or saved view, or a display route (OpenSpec `display-mode`: Today, Upcoming, a project or a saved view in display mode), as the start view that opens on launch. The choice SHALL be a per-device preference that persists across reloads and is not synced. If the chosen saved view or project is deleted, the device SHALL fall back to the Inbox.

#### Scenario: Open on a saved view
- **WHEN** the user sets "Work tomorrow" as the start view on their laptop and relaunches the app
- **THEN** "Work tomorrow" opens first on the laptop while the phone still opens on its own start view

#### Scenario: Deleted start view
- **WHEN** the start view is deleted on another device and this device syncs and relaunches
- **THEN** the Inbox opens and a notice explains the start view was removed

#### Scenario: Open in display mode
- **WHEN** the user chooses "Make this the start view on this device" on `/display/today?eink=1` and the tablet restarts
- **THEN** the app opens straight on that display with the same options, while other devices keep their own start view

#### Scenario: Display of a deleted project
- **WHEN** the start view is the display of a project that was deleted since
- **THEN** the Inbox opens with the notice that the start view was removed

### Requirement: Dashboards
A view of kind `dashboard` SHALL display up to six panels, each showing a chosen saved list view's name, open-task count and its first ten tasks with an "open view" action, laid out in a responsive grid that stacks on narrow screens. Panels SHALL be added, removed and reordered from the dashboard header, and Tab/Shift+Tab SHALL move between panels with `j`/`k` inside one. A panel whose view has an on-drop rule SHALL be a drop target for the cards of the other panels and SHALL show that it has a rule, with the rule's wording as its accessible description; a panel without a rule SHALL not accept drops. `Shift+→` and `Shift+←` SHALL move the selected card to the next or previous panel that has a rule, applying that rule (see "Dropping a card applies the rule"), and the card SHALL stay selected. A panel whose view was deleted SHALL show a placeholder instead of failing. The board SHALL render from local data offline; a drop SHALL work offline and converge like the field operations it writes.

#### Scenario: Morning review dashboard
- **WHEN** the user creates dashboard "Morning" with panels "Today p1", "Waiting" and "Errands"
- **THEN** three panels show the respective counts and first tasks, update live, and sync to other devices

#### Scenario: Panel view deleted
- **WHEN** "Errands" is deleted while it is a panel of "Morning"
- **THEN** the panel shows "View removed" with a remove action and the other panels work normally

#### Scenario: Panel without a rule is not a target
- **WHEN** the user drags a card over a panel whose filter has no on-drop rule
- **THEN** the panel does not light up as a target, and releasing the card there changes nothing

#### Scenario: Keyboard move between columns
- **WHEN** a card is selected in the first panel of a board whose second panel has the rule "priority 2", and the user presses `Shift+→`
- **THEN** the task's priority becomes 2, the card is shown selected in the second panel, and `Shift+←` back to a first panel without a rule does nothing

#### Scenario: Keyboard move skips panels without a rule
- **WHEN** a card is selected in the first of three panels, the second has no rule and the third has one, and the user presses `Shift+→`
- **THEN** the third panel's rule is applied and the card is selected there

### Requirement: Views API and export
The API SHALL expose `/api/v1/views` with list, get, create, patch and delete following the collection conventions: authentication required, soft delete, write-through to the operation log, unknown fields rejected. Create SHALL require a name and a query that parses; option values outside the allowed sets SHALL be rejected. `on_drop` SHALL be accepted on list views only, as `null` or an object whose keys and values are those of the on-drop rule, with label ids that exist and are not deleted and a section that belongs to the named project; it SHALL be replaced as a whole on patch. The export SHALL include a `views` array with deleted views, each view carrying `on_drop`.

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

### Requirement: View menu actions
Every saved view SHALL have one action menu, the same in the sidebar, the views overview, the view header and on dashboards, offering Rename, a checkable "Pin to sidebar", a checkable "Start view on this device", Move up, Move down and Delete view. Deleting SHALL require confirming a dialog stating that tasks are not affected. Pin, order and rename are operations that work offline and converge; the start view stays a per-device preference.

#### Scenario: Same menu everywhere
- **WHEN** the user opens the menu of "Waiting" from the sidebar and then from the view header
- **THEN** both menus list the same items in the same order with the same checked states

#### Scenario: Start view is checked
- **WHEN** "Waiting" is the start view on this device and the user opens its menu
- **THEN** "Start view on this device" is checked; activating another view's item moves the check there and is not synced to other devices

#### Scenario: Delete needs confirmation
- **WHEN** the user chooses "Delete view" on "Waiting"
- **THEN** a dialog names the view and says its tasks are not affected, and the view is deleted only after "Delete view" is pressed, offline included

#### Scenario: Move within Favourites
- **WHEN** "Waiting" is pinned and the user chooses Move up from its menu in the Favourites group
- **THEN** it moves up among the favourites, and its position among the saved filters is unchanged

### Requirement: On-drop rule
A list view SHALL carry an optional on-drop rule of at most one choice per kind: `add_labels` and `remove_labels` (label ids), `priority` (1 to 4), `due` (`today`, `tomorrow`, `next-week`, `clear`), `start` (`someday`, `clear`), `section` (a project id and one of its sections or none) and `state` (`complete`, `reopen`). It SHALL be edited on the board, synced as one view field that works offline and converges whole by last-writer-wins, and SHALL act only on a drop.

#### Scenario: Edit a column's rule
- **WHEN** the user opens Arrange on a board, chooses Rule on the panel "Errands" and sets "add label errand" and "due today"
- **THEN** the panel shows that it has a rule, its description reads "Adds errand, due today", and the rule is present on other devices after sync

#### Scenario: Rule set offline
- **WHEN** the device is offline and the user gives a column the rule "priority 1"
- **THEN** a card dropped into that column at once gets priority 1, and both the rule and the priority change reach other devices after the network returns

#### Scenario: Rule names a deleted label
- **WHEN** a rule adds the label "errand" and that label is deleted afterwards
- **THEN** the rule editor shows the label as removed, a drop adds nothing for it, and the other parts of the rule still apply

### Requirement: Dropping a card applies the rule
Dropping a card on a panel with a rule SHALL apply the rule to that task as one batch of ordinary field operations following the single-task rules (a completion rolls a recurring task forward and completes open subtasks; a date un-parks; a project change clears the section; labels are read just before being written and written whole), applied locally first, queued while offline, converging per field by last-writer-wins. A change the task already has SHALL not be written.

#### Scenario: Drop with several changes
- **WHEN** a task of priority 3 without a date is dropped on "Urgent and important", whose rule is priority 1 and due today
- **THEN** the task has priority 1 and today's date at once, and the task's history shows one change by this device

#### Scenario: Drop that completes a recurring task
- **WHEN** a weekly task is dropped on a column whose rule is "complete"
- **THEN** a completed occurrence is recorded and the task moves to next week, as pressing `c` on it would do

#### Scenario: Nothing to change
- **WHEN** a task that already has priority 1 and today's date is dropped on a column whose rule is priority 1 and due today
- **THEN** no operation is written, and the toast says the task already matched the rule

#### Scenario: Concurrent drop and edit
- **WHEN** a drop sets priority 1 on a task while another device changes its title offline, and both sync
- **THEN** every device shows the task with priority 1 and the new title

### Requirement: Drop feedback and undo
After a drop a toast SHALL name the column and the changes with an Undo control that restores the previous values as one new batch, offline-capable and convergent, skipping a field changed again since. When the task does not match the destination's filter after the rule, the destination SHALL keep showing the card, marked, until the user leaves the board or the task changes again, and the toast SHALL say so; nothing more is written. This held card is device interface state, never synced.

#### Scenario: Toast and undo
- **WHEN** a task is dropped on "Urgent and important" (priority 1, due today) and the user then presses `Ctrl`/`⌘`+`Z` while the toast "Moved to Urgent and important: priority 1, due today" is shown
- **THEN** the task has its previous priority and date (or none) on every device after sync, and a field changed again since is kept and named

#### Scenario: Still not matching after the rule
- **WHEN** a task with a deadline tomorrow is dropped on "Important, not urgent", whose filter excludes tasks with a deadline by tomorrow and whose rule is priority 2 and due next week
- **THEN** the rule is applied, the card stays shown in that panel marked as not matching until the user leaves the board or the task changes again, and the toast adds that the task does not match the column's filter

#### Scenario: Held card is local
- **WHEN** a held card is shown on one device and the user opens the same board on another device
- **THEN** the other device shows the task only where its filters match it

### Requirement: New board chooser
The **New board** action on Filters → Boards SHALL offer a choice between an empty board and the built-in board templates, each with a one-line description, before asking for a name. Creating from a template SHALL write its saved filters and the board as ordinary view operations in one batch, applied locally first and working offline, so every part can be renamed, edited, unpinned or deleted afterwards.

#### Scenario: Empty board as before
- **WHEN** the user chooses New board, then "Empty board", and names it "Morning"
- **THEN** an empty board "Morning" opens, as the New board action did before

#### Scenario: Template offline
- **WHEN** the device is offline and the user creates a board from a template
- **THEN** the board and its filters are usable at once on this device and appear on the user's other devices after the network returns

### Requirement: Eisenhower matrix template
The Eisenhower matrix template SHALL create four unpinned saved filters over priority and date, each with its rule, and one pinned board of the four in matrix order: Urgent and important, Important, not urgent, Urgent, not important, Neither. Important SHALL mean priority 1 or 2 and urgent a due date or deadline by tomorrow; the two not-urgent quadrants SHALL leave out parked tasks. Each query SHALL parse under the published grammar on the client and the server.

#### Scenario: The four quadrants
- **WHEN** the template is created
- **THEN** the filters are **Urgent and important** `(p1 | p2) & (due <= tomorrow | deadline <= tomorrow)` with the rule priority 1, due today; **Important, not urgent** `(p1 | p2) & !(due <= tomorrow | deadline <= tomorrow) & !someday` with priority 2, due next week; **Urgent, not important** `!(p1 | p2) & (due <= tomorrow | deadline <= tomorrow)` with priority 3, due today; **Neither** `!(p1 | p2) & !(due <= tomorrow | deadline <= tomorrow) & !someday` with priority 4, due cleared

#### Scenario: Create the matrix
- **WHEN** the user chooses New board, then "Eisenhower matrix", keeps the name "Eisenhower" and confirms
- **THEN** the board opens with the four panels in matrix order, the four filters are listed under Saved filters unpinned, and the board is pinned to the sidebar

#### Scenario: Quadrants are exclusive
- **WHEN** the user has an open priority-1 task due today, a priority-2 task with no date, a priority-4 task due yesterday and a parked priority-3 task
- **THEN** the first three tasks each appear in exactly one quadrant (Urgent and important, Important, not urgent, Urgent, not important) and the parked task appears in none

#### Scenario: Re-plan by dragging
- **WHEN** the user drags the priority-4 task from "Urgent, not important" onto "Urgent and important"
- **THEN** the task gets priority 1 and today's date, leaves the source quadrant and shows in the destination, and Undo returns it

#### Scenario: Template parses on the server
- **WHEN** the four template queries are sent to `/api/v1/views` as list views
- **THEN** every one is accepted with 201

### Requirement: Convert a column rule into an automation rule
A board column's Rule dialog and a saved filter's action menu SHALL offer "Make an automation rule" (OpenSpec `automation-rules`), opening the rule editor with the actions set to the column's on-drop rule and the condition built from the structural terms of the filter's query (`#project`, `##project`, `@label`, `no labels`, `no project`, `p1`–`p4`, `no date`, `overdue`, `today`, `due <= today`, `blocked`, `habit`, `origin: kind`); any other term SHALL be named in the editor as not carried over. The trigger defaults to "a task is created" and the user chooses before saving. The saved filter and the board SHALL be unchanged by the conversion.

#### Scenario: Convert a quadrant
- **WHEN** the user opens Arrange on the Eisenhower board, chooses Rule on "Urgent and important" and then "Make an automation rule"
- **THEN** the rule editor opens with the actions "priority 1, due today" and the condition "priority 1, due today or overdue", and saving creates a rule without changing the column

#### Scenario: Term not carried over
- **WHEN** the filter's query is `@errand & search: "oat milk"` and the user converts it
- **THEN** the editor has the condition "label errand" and a line reading `search: "oat milk" cannot be used in a rule`
