## MODIFIED Requirements

### Requirement: Revealed row actions
On a fine pointer from 768 px wide, a row SHALL hold four actions at its right edge, shown while the pointer is over the row or focus is inside it as one small floating cluster on the popover surface over the row's end, at every row width: over the end of the property column of a one-line row, and over the end of the title's first line of a narrower row, which keeps no room for them: Edit, which opens the inline editor on that row as `F2` does ("Inline title editing", "Edit and Open details from a row"), on a row the user may change in a list that offers inline editing, and in its place on any other row Show details, which shows the task's details under the row as → does (Hide details while they are shown, see "Expanded rows"); Schedule, which opens the same Do on popover as `s` anchored to the row; Priority, which opens the same priority choice as `1` to `4`; and More, which opens the row menu as `.` does. The actions SHALL be real buttons at all times, reachable by Tab from the row's open control and back with Shift+Tab, named with their key in their tooltips, with targets of at least 24 by 24 CSS pixels and 8 px apart (WCAG 2.2 2.5.8), and SHALL never be obscured by the sticky page header, the selection bar or a toast when focused (WCAG 2.2 2.4.11). `j` and `k` SHALL keep moving focus from open control to open control, skipping the actions. Revealing the actions SHALL NOT change the row's height, move the title or the properties, or hide the counts or the properties from assistive technology. On coarse pointers and below 768 px the actions SHALL NOT be rendered; the row menu stays reachable by `.`, the Menu key, and the selection bar's Actions after a long press ticks the row (`bulk-actions` "One ticked task on touch"); the details are shown by the row's disclosure button on a coarse pointer from 768 px, and by → at every width (see "Expanded rows"). Every action writes through the same path as its keyboard equivalent, so it works offline and converges per field. A viewer's row SHALL offer Show details only.

#### Scenario: Reveal on hover
- **WHEN** the pointer enters a row with two comments on a 1280 px screen
- **THEN** Edit, Schedule, Priority and More appear in a floating cluster at the row's right edge, the "2" beside the title stays, and the title does not move

#### Scenario: Edit from the row
- **WHEN** the user points at "Call the plumber" in a project on a 1280 px screen and activates Edit
- **THEN** the row's title becomes the inline editor with the caret at its end and the Date, Priority, Labels and Project bar under it, exactly as `F2` on that row would, and the task does not open

#### Scenario: A list without the inline editor
- **WHEN** the pointer enters a row of a saved view on a 1280 px screen
- **THEN** Show details, Schedule, Priority and More appear, and → still shows the details

#### Scenario: Reveal on focus
- **WHEN** the user presses `j` to focus a row's open control and then Tab
- **THEN** focus moves to Edit, the four actions are visible, Tab moves on to Schedule, Priority and More, Shift+Tab returns, and `j` from the open control skips them

#### Scenario: Schedule from the row
- **WHEN** the user activates Schedule on a row and picks Tomorrow
- **THEN** the task is due tomorrow, the row re-sorts or stays as the view requires, and a toast offers Undo, exactly as `s` then Tomorrow would

#### Scenario: Priority from the row
- **WHEN** the user activates Priority and chooses P1 while offline
- **THEN** the checkbox ring turns P1 at once and the change reaches other devices after the next sync

#### Scenario: Touch screen
- **WHEN** a row is shown on a coarse pointer at 1024 px
- **THEN** no action buttons are rendered, the counts stay, and a long press selects the row so its actions are in the phone bar (bulk-actions "Select with a pointer or on touch")

#### Scenario: Focus not obscured
- **WHEN** the focused More button of the last visible row sits under where a toast appears, and a toast appears
- **THEN** the list scrolls or the toast is placed so that the whole button stays visible

#### Scenario: Viewer of a shared project
- **WHEN** the user is a viewer and hovers a row
- **THEN** only Show details appears, because the row has no edits to offer

#### Scenario: Reveal on a narrow row
- **WHEN** the pointer enters a two-line row of a list 30 rem wide on a 1100 px screen
- **THEN** the cluster appears over the end of the title's first line, the title does not move or rewrap, and the row's height does not change

## ADDED Requirements

### Requirement: Edit and Open details from a row
In the lists that offer inline editing (the list layout of the Inbox, Today, Upcoming, Anytime, Someday, Completed, Assigned to me, projects, labels and places), the actions menu of one task (More, `.`, a right-click, a touch hold) SHALL hold, after Complete: **Edit**, named with `F2`, on a task the user may change; from 768 px wide, **Show details**, named with →, or **Hide details**, named with ←, while the details are shown under its row ("Expanded rows"); and **Open details**, named with Enter. A menu for several ticked tasks SHALL hold none of the three. Edit SHALL select the row and open the inline editor on it without opening the task: the editor of `F2` with a mouse, trackpad or pen on a fine pointer from 768 px, and otherwise the compact editor with visible Save and Cancel. Open details SHALL select the row and open the task as Enter on it does: in the side panel or the Inbox's split where they show (a task already shown there opens as its page), else as its page, following the account's "Open tasks" preference only.

While the side panel or the Inbox's split shows a task and the user starts an edit on another row (Edit, the menu, `F2`, a second click on a selected title) or opens that row's More, the row SHALL become the cursor and the shown task SHALL stay. It SHALL keep staying after the edit is saved or cancelled, until the cursor moves to another row, a row is clicked (a click on the selected row's empty area shows that row), or another task is opened there; closing the pane SHALL leave it closed until the cursor moves. Neither preference ("Click a task to", "Open tasks") nor a click on a title, `F2`, Enter, the double-click, → or `a` SHALL change. Nothing of this is stored or synced: edits made in the editor write through the same operations as before, so they work offline and converge per field.

#### Scenario: Edit B while A stays in the side panel
- **WHEN** the side panel shows "Order the tiles", the user activates Edit on "Call the plumber", sets its date to tomorrow and presses Enter
- **THEN** "Call the plumber" is due tomorrow and selected, and the panel still shows "Order the tiles"

#### Scenario: The next cursor move follows again
- **WHEN** after that edit the user presses `j`
- **THEN** the cursor moves to the next row and the panel shows its task

#### Scenario: A click shows the edited row
- **WHEN** after that edit the user clicks the empty area of "Call the plumber"
- **THEN** the panel shows "Call the plumber" and no editor opens

#### Scenario: The Inbox's split
- **WHEN** the Inbox's split shows "Order the tiles" and the user opens More on "Call the plumber" and chooses Edit
- **THEN** the editor opens on "Call the plumber" and the split still shows "Order the tiles" until the cursor moves

#### Scenario: Open details follows Open tasks
- **WHEN** a member with "Open tasks: As a page" chooses Open details in the menu of "Call the plumber" in a project
- **THEN** the task's page opens; with "In a side panel" the side panel shows it instead

#### Scenario: Show details from the menu
- **WHEN** the user chooses Show details in a row's menu, then opens the menu again
- **THEN** the details show under the row and the item reads Hide details, which hides them

#### Scenario: On a phone
- **WHEN** the user holds a writable row on a 390 px touch screen
- **THEN** the menu holds Edit and Open details, and Edit opens the compact editor with Save and Cancel in the row

#### Scenario: A viewer
- **WHEN** a viewer of a shared project opens a row's menu
- **THEN** it holds Show details and Open details and no Edit
