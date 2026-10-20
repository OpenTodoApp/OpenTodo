# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
