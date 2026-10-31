# sections-and-boards Specification

## Purpose
Defines sections as ordered containers inside a project, the task-to-section reference, how the list view groups by section, and the board view that shows sections as columns tasks move between.

## Requirements

### Requirement: Section entity
A section SHALL have a name, the id of the project it belongs to, a sort position, creation time and optional deletion time. It MAY also carry a colour from the palette and an icon from the icon catalogue (`design-system` "Icon catalogue"), both empty for a new section. Sections SHALL be created, edited and deleted as operations in the log, applied locally first so they work offline, and SHALL converge under per-field last-writer-wins like tasks and projects. A section's project reference SHALL not change after creation. A client that does not know the colour or icon fields SHALL ignore them and keep showing the section as before.

#### Scenario: Create a section offline
- **WHEN** the device is offline and the user adds a section "Doing" to a project
- **THEN** the section appears immediately in that project, survives a reload, and reaches other devices after the network returns

#### Scenario: Concurrent rename
- **WHEN** two devices rename the same section offline and both sync
- **THEN** every device shows the name written with the greater timestamp

#### Scenario: Colour and rename at the same time
- **WHEN** one device renames "Doing" to "In progress" while another, offline, gives "Doing" the blue colour, and both sync
- **THEN** every device shows a blue section named "In progress"

#### Scenario: Older client
- **WHEN** a client released before section colours reads a section with a colour and an icon
- **THEN** it shows the section with its name only and writes nothing to those fields

### Requirement: Task section reference
A task SHALL have an optional `section_id` naming a section of its project; it SHALL default to none and SHALL be stored and synced as an additive task field. Changing a task's project SHALL clear its section. A task whose section is deleted, belongs to a different project than the task, or has not yet been received SHALL be shown as having no section without any data being written.

#### Scenario: Default
- **WHEN** a task is created without choosing a section
- **THEN** it has no section and is listed under "No section" in its project

#### Scenario: Move to another project clears the section
- **WHEN** a task in section "Doing" of project "A" is moved to project "B"
- **THEN** the task has no section and is listed under "No section" in "B"

#### Scenario: Concurrent move and section deletion
- **WHEN** device A moves a task into section "Doing" offline while device B deletes "Doing" offline, and both sync
- **THEN** the section is deleted on both devices, the task keeps its reference to the deleted section in the data, is displayed under "No section", and is not lost

### Requirement: Sections in the list view
A project's list view SHALL group open tasks under section headings ordered by section position, with tasks that have no section listed first under a "No section" heading shown only when sections exist and that group has open tasks. Each heading SHALL use the shared group header with the count of open tasks beneath it, a collapse control and a quick-add action that creates tasks in that section.

#### Scenario: Grouped list
- **WHEN** a project has sections "Backlog" and "Doing" with 3 and 1 open tasks, and 2 tasks without a section
- **THEN** the view shows "No section 2", then "Backlog 3", then "Doing 1", each followed by its tasks

#### Scenario: No unsectioned tasks
- **WHEN** every open task of a project sits in a section
- **THEN** no "No section" heading is shown

#### Scenario: Quick add under a heading
- **WHEN** the user activates the quick-add action of "Doing", types a title and presses Enter
- **THEN** a task with that title appears under "Doing" immediately, with no network round trip

### Requirement: Empty and collapsed sections
A section with no open tasks SHALL show its header only, with "n completed" and a reveal control when it holds completed tasks. Sections SHALL be collapsible per device.

#### Scenario: Section with only completed tasks
- **WHEN** a section "Done" holds 4 completed tasks and no open task
- **THEN** the list shows the "Done" header only, with "4 completed" and a reveal control that shows them

#### Scenario: Collapse is per device
- **WHEN** the user collapses "Backlog" on one device
- **THEN** its tasks are hidden on that device and the section stays expanded on the user's other devices

### Requirement: Board view
Every project SHALL offer a board view with one column per section ordered by section position, preceded by a "No section" column only when it has open tasks, each listing the section's open tasks as cards ordered by position with a per-column count and quick-add. Each column SHALL be drawn as one surface: a sunken band with the card radius that holds the column header and its cards and runs the full height of the board whatever the number of cards, so a column reads as a container on the page and not as cards floating on the canvas. The column header SHALL show, inside the surface, the section's icon or colour dot when it has one (OpenSpec `sections-and-boards` "Section colour and icon"), the title, the open-task count in the muted tone with tabular figures, and the column menu; on a board of filters it SHALL also show the rule mark in the muted tone (OpenSpec `custom-views`). In an editable project every column SHALL end its cards with an "Add a task" affordance inside the surface, and the row of columns SHALL end with an "Add a section" column: a dashed outline of the board's height with a plus icon that turns into the section name field. A card SHALL use the raised surface at the first elevation and lift to the second elevation on hover or focus; it SHALL show the title on at most two lines, then, only when the board's notes preview is on (see "Notes preview on cards"), up to two lines of the notes as plain text, and then one property row: the date with a calendar icon in its due tone, the estimate with a clock icon and the subtask progress with a check icon first, then the task's other facts and its label chips, and the assignee at the row's end. A column MAY be folded to a strip (see "Fold a board column"). The board SHALL be one of three project layouts (list, board, timeline per `project-timeline`), chosen with the view toggle or by cycling with `v`, remembered per project per device and not synced.

#### Scenario: Switch to board
- **WHEN** the user presses the view toggle or `v` in a project
- **THEN** the project is shown as columns, and the same project opens as a board on the next visit on that device only

#### Scenario: Cycle through the layouts
- **WHEN** the project is shown as a board and the user presses `v` twice
- **THEN** the timeline is shown after the first press and the list after the second, and the last choice is remembered for that project on that device

#### Scenario: Keyboard navigation across columns
- **WHEN** the board is shown and the user presses `l` or Right
- **THEN** the selection moves to the first task of the next column, and `j`/`k` continue to move within a column

#### Scenario: Tall column
- **WHEN** a column holds more cards than fit the screen height
- **THEN** that column scrolls inside itself and the page header stays in place

#### Scenario: Board on a phone
- **WHEN** a project with three sections opens as a board on a 390 px screen
- **THEN** the first column with open tasks fills most of the width, swiping snaps to the next column and the pager shows three dots

#### Scenario: Card content
- **WHEN** a task with a date, three labels, an estimate and two comments is shown as a card
- **THEN** the card shows the title, then one property row with the date and its calendar icon, the estimate and its clock icon, up to three chips and the comment count, and nothing else

#### Scenario: Assignee at the end of the card
- **WHEN** a task of a shared project with a date and an assignee is shown as a card
- **THEN** the assignee's avatar ends the card's property row, after the date

#### Scenario: Column surface
- **WHEN** a board with the columns "Backlog" (3 open tasks) and "Doing" (0 open tasks) is shown in light and in dark
- **THEN** each column is one sunken band with the card radius holding its header and cards, both bands reach the bottom of the board, "Backlog 3" has the count in the muted tone, and each column shows its "Add a task" affordance inside the surface after its cards

#### Scenario: Add a section from the board
- **WHEN** the user activates "Add a section" at the end of an editable board, types "Garden" and presses Enter
- **THEN** a "Garden" column appears before the "Add a section" column, and a read-only board shows no "Add a section" column

#### Scenario: Card lifts on hover
- **WHEN** the pointer rests on a card, or a card receives focus
- **THEN** the card is drawn at the second elevation, and returns to the first when the pointer leaves

#### Scenario: Card with the notes preview on
- **WHEN** the notes preview is on for the board and a card's task has a date and the notes "Waiting on the quote from Marco"
- **THEN** the card shows the title, then "Waiting on the quote from Marco" in the muted tone on at most two lines, then the property row with the date

### Requirement: Field badges on cards
Board cards SHALL show the task's non-empty custom field values as compact badges in definition order (OpenSpec `custom-fields`), at most three, with a count for the rest whose accessible name lists them.

#### Scenario: Field badges on a card
- **WHEN** a card's task holds Cost 120, Status "Ordered", a checked "Paid" box and an empty Client
- **THEN** the card shows badges "Cost 120", "Status Ordered" and "Paid", and nothing for Client

#### Scenario: More than three values
- **WHEN** a card's task holds five non-empty values
- **THEN** the card shows the first three in definition order and a "+2" badge whose accessible name lists the rest

### Requirement: Board data and keyboard access
The board SHALL render from local data and SHALL be navigable by keyboard.

#### Scenario: Board offline
- **WHEN** the device is offline and the user opens a project as a board
- **THEN** the columns and their cards render from local data, and a card can be selected and opened with the keyboard alone

### Requirement: Board scrolling and phone layout
The board SHALL be the content column's own scroller: columns fill the available height and each column scrolls alone, the page does not. Below 640 px columns SHALL be 88 % of the screen width with snapping and a dot pager, and the current column's name SHALL be in the page bar.

#### Scenario: Page keeps still while a column scrolls
- **WHEN** the user scrolls a column that holds more cards than fit the screen height
- **THEN** only that column moves; the page, the header and the other columns stay in place

#### Scenario: Current column named on a phone
- **WHEN** the user swipes to the second column of a board on a 390 px screen
- **THEN** the column snaps into place at 88 % of the screen width, the page bar shows that column's name and the second pager dot is current

### Requirement: Move tasks between sections
The user SHALL be able to move a task to another section by dragging it onto a column or heading, by pressing Shift+Left or Shift+Right on the selected task in the board, and by choosing a section in the task detail panel. While a card is dragged over a column, that column SHALL show a dashed placeholder of the dragged card's height, with an edge that meets 3:1 against the column surface, at the end of the column where the card will land, and the dragged card's origin SHALL stay visible at reduced opacity until the drop. A move SHALL set the task's section and place it last in the target column, SHALL apply locally at once and work offline, and SHALL converge so two devices moving the same task resolve to the newer move.

#### Scenario: Drag between columns
- **WHEN** the user drags a task from "Backlog" and drops it on "Doing"
- **THEN** the task appears at the bottom of "Doing" immediately and other devices show the same after sync

#### Scenario: Placeholder while dragging
- **WHEN** the user drags a two-line card from "Backlog" over "Doing"
- **THEN** "Doing" shows a dashed placeholder of that card's height at its end, "Backlog" still shows the card at reduced opacity, and releasing outside any column removes the placeholder and writes nothing

#### Scenario: Keyboard move
- **WHEN** a task in "Backlog" is selected on the board and the user presses Shift+Right
- **THEN** the task moves to the next column and stays selected

#### Scenario: Concurrent moves of one task
- **WHEN** device A moves a task to "Doing" offline while device B moves it to "Done" offline, and both sync
- **THEN** every device shows the task in the column chosen by the move with the greater timestamp

### Requirement: Section lifecycle
Sections SHALL be renamable, reorderable among the sections of their project, and deletable from the heading or column menu and from the keyboard. Deleting a section SHALL require confirming a dialog stating how many open tasks move to "No section". It SHALL set its deletion time and clear the section of its open tasks, one operation per task. Deleted sections SHALL be hidden from all views and list endpoints and included in the export. These actions work offline and converge.

#### Scenario: Reorder
- **WHEN** the user moves "Doing" before "Backlog"
- **THEN** both the list headings and the board columns show "Doing" first on this device now and on other devices after sync

#### Scenario: Delete with tasks
- **WHEN** the user confirms deletion of "Doing", which holds two open tasks
- **THEN** the section disappears and the two tasks are listed under "No section"

#### Scenario: Confirmation states the impact
- **WHEN** the user chooses "Delete section" in the menu of "Doing", which holds two open tasks
- **THEN** a dialog says the two open tasks move to "No section", and Cancel leaves the section and its tasks untouched

### Requirement: Sections API
The API SHALL expose a `sections` collection under `/api/v1/sections` with list, get, create, patch and delete, following the collection conventions: authentication required, soft delete, write-through to the operation log, unknown fields rejected. Create SHALL require a name and an existing, non-deleted `project_id`. Create and patch SHALL accept an optional `color` (a `#rrggbb` hex string, or null to clear it) and an optional `icon` (a catalogue name, or null to clear it), and list and get SHALL return both, null when unset. Tasks SHALL accept `section_id` in create and patch.

#### Scenario: Create a section via the API
- **WHEN** a script POSTs `{"name":"Doing","project_id":"<project>"}` to `/api/v1/sections` with a bearer token
- **THEN** the response is 201 with the section including `id`, `position`, `created_at`, and `color` and `icon` both null, and devices receive it on their next sync

#### Scenario: Style a section via the API
- **WHEN** a script PATCHes `{"color":"#3b82f6","icon":"hourglass"}` to a section with a bearer token
- **THEN** the response is 200 with both values, and devices show the section blue with the hourglass after sync

#### Scenario: Unknown icon or malformed colour
- **WHEN** a create or patch body has `icon` set to a name that is not in the catalogue, or `color` that is not `#rrggbb`
- **THEN** the response is 400 with code `invalid_input` naming the field, and nothing is written

#### Scenario: Unauthenticated request
- **WHEN** a request without credentials lists or creates sections
- **THEN** the response is 401 `unauthorized`

#### Scenario: Invalid project
- **WHEN** a create body names a `project_id` that does not exist or is deleted
- **THEN** the response is 400 with code `invalid_input` and no section is created

### Requirement: Export includes sections
The JSON export SHALL include every section of the user, including soft-deleted ones, under a `sections` key alongside projects and tasks, and tasks SHALL carry their `section_id`.

#### Scenario: Export after creating sections
- **WHEN** the user downloads the export after creating two sections and deleting one
- **THEN** the document contains both sections, one with `deleted_at` set, and keeps `"format":"opentodo-export"` and `"version":1`

### Requirement: Section colour and icon
The section menu, in the list heading and on the board column, SHALL offer "Colour" with the project palette and "No colour", and "Icon" with the searchable icon picker and "No icon". A section's icon SHALL be shown immediately before its title, in the list heading and the board column header, drawn in the section's colour when it has one and in the heading's text colour otherwise. A section's colour without an icon SHALL be shown as a small dot of that colour before the title. A section with neither SHALL look as it does today. Colour and icon SHALL never replace the title or the open-task count, and SHALL add no row of chrome. The "No section" group SHALL never carry a colour or an icon. Editing works offline and converges like any section edit; viewers of a shared project see the style but cannot change it.

#### Scenario: Style a section offline
- **WHEN** the device is offline and the user picks the hourglass icon and the amber colour for "Waiting" from its heading menu
- **THEN** the heading shows an amber hourglass before "Waiting" at once, the board column shows the same, and other devices show it after sync

#### Scenario: Colour without icon
- **WHEN** a section has the green colour and no icon
- **THEN** its heading and column header show a small green dot before the title

#### Scenario: Default look
- **WHEN** the user creates a new section "Backlog"
- **THEN** its heading shows the title and count only, as before this change

#### Scenario: Keyboard
- **WHEN** a keyboard user opens the heading menu of "Doing", chooses "Icon", types "rocket" and presses Enter
- **THEN** the rocket icon is set and focus returns to the heading menu's trigger

#### Scenario: Viewer of a shared project
- **WHEN** a viewer opens the heading menu of a section in a shared project
- **THEN** the menu offers no Colour or Icon item, and the section's style is shown as the owner set it

### Requirement: Board surfaces in the workbench
The workbench SHALL show the board's column surface in these states, each in light and dark at 375 and 1280 px under the accessibility and visual-regression gates: a board with a filled, a styled (icon and colour) and an empty column; a card at rest and a card hovered; a drag in progress with the placeholder in the target column and the origin card at reduced opacity; a board of filters with a rule mark in a header; a board with a folded column, at rest and while a card is dragged over its strip; and cards with the notes preview on, with one, two and more lines of notes and with none.

#### Scenario: Drag state has a baseline
- **WHEN** a change alters the placeholder's edge or height
- **THEN** the "drag in progress" story's visual check fails with a diff image

#### Scenario: Placeholder contrast
- **WHEN** the accessibility gate runs the "drag in progress" story
- **THEN** the placeholder's edge measures at least 3:1 against the column surface in both themes

#### Scenario: Folded strip has a baseline
- **WHEN** a change alters the folded strip's width, text direction or count
- **THEN** the "folded column" story's visual check fails with a diff image, and the accessibility gate checks the strip's accessible name and its 3:1 focus edge in both themes

### Requirement: Colour by on boards
Boards (a project's Board layout and board views) SHALL offer Colour by with Project (default), Label and Priority, in a board view's display panel and in a project board's overflow menu, stored once per device for every board and never synced. With Label or Priority, each card SHALL show a 3 px leading edge in the hue chosen as for calendar blocks (first coloured label in the user's label order, or the priority hue; the neutral hue otherwise); with Project, cards SHALL look as before. The edge SHALL meet 3:1 against the card in light and dark, and the card's accessible text SHALL be unchanged.

#### Scenario: Cards by label
- **WHEN** the user chooses Colour by Label on a board and a card carries the label "urgent" (red)
- **THEN** the card has a red leading edge, and a card without labels has the neutral edge

#### Scenario: Project unchanged
- **WHEN** Colour by is Project
- **THEN** every board renders exactly as before

#### Scenario: Remembered on the device
- **WHEN** the user colours a board view by priority and opens a project's board after a reload
- **THEN** the project board is coloured by priority too, and other devices are unaffected

### Requirement: Fold a board column
Every column of a board (a project board, a saved view in the Board layout and a board of filters) except the "Add a section" column SHALL be foldable from its column menu ("Fold column") and with `z`, into a strip of the column surface the board's full height that shows the column's icon or colour dot, its open-task count and its name written vertically. Activating the strip (pointer, Enter or Space, or `z`) SHALL unfold it. A column SHALL be folded exactly when its section or group is collapsed on this device: folding a project board's column collapses that section in the project's list on the same device and collapsing a section in the list folds its column, and a saved view's column follows the view's collapsed group the same way. The fold state SHALL be kept per device, SHALL survive a restart and SHALL write no operation. The strip SHALL be one control whose accessible name gives the name, the open-task count and the folded state. On a board of filters, whose panels sit in a grid rather than a row, a folded panel SHALL keep only its header line (mark, name and count) as that one control, folded and unfolded with its fold button or `z`, and SHALL stay a drop target. `h` and `l` SHALL skip folded columns.

#### Scenario: Fold Done
- **WHEN** the user opens the menu of the "Done" column and chooses Fold column
- **THEN** "Done" becomes a narrow strip reading its name vertically with its count, the other columns take the freed width, and nothing is uploaded on the next sync

#### Scenario: Shared with the list on this device
- **WHEN** the user folds "Later" on the board of "Home" and switches the project to the list layout
- **THEN** the "Later" section is collapsed in the list on that device, and on the user's phone the column is unfolded

#### Scenario: Keyboard fold and unfold
- **WHEN** a card in "Review" is selected and the user presses `z`, then tabs to the "Review" strip and presses Enter
- **THEN** the column folds and the selection moves to the first card of the next unfolded column, then the column unfolds again

#### Scenario: Screen reader
- **WHEN** a screen reader user reaches the folded "Done" column holding 12 open tasks
- **THEN** it is announced as "Done, 12 open tasks, folded" with a collapsed state, and activating it unfolds the column

#### Scenario: Offline
- **WHEN** the device is offline and the user folds a column
- **THEN** the column folds at once and stays folded after the app restarts

### Requirement: Moving a task into a folded column
A folded column SHALL stay a drop target and a keyboard move target. Dropping a card on a strip, or pressing Shift+Left or Shift+Right into a folded column, SHALL move the task last into that section or group exactly as a move into an unfolded column (one operation, applied locally at once, offline, converging to the move with the greater timestamp; on a saved view following the view's drop rule), SHALL leave the column folded and SHALL update the strip's count. While a card is dragged over a strip, the strip SHALL show the placeholder's dashed edge along its length. After a keyboard move into a folded column the selection SHALL move to the next card of the origin column, or the previous one when it was the last, and the move SHALL be announced. A column that refuses drops when unfolded SHALL refuse them folded, and a viewer SHALL not be able to drop anywhere.

#### Scenario: Throw a card on Done
- **WHEN** "Done" is folded with 12 open tasks and the user drags a card from "Doing" onto its strip
- **THEN** the task is in "Done", the strip reads 13, the column stays folded, and other devices show the task in "Done" after sync

#### Scenario: Keyboard move into a folded column
- **WHEN** the last card of "Doing" is selected, "Done" to its right is folded, and the user presses Shift+Right
- **THEN** the task moves to "Done", the previous card of "Doing" becomes selected, and "Moved to Done" is announced

#### Scenario: Viewer
- **WHEN** a viewer of a shared project drags a card over a folded strip
- **THEN** no placeholder appears and nothing is written, and the viewer can still fold and unfold columns on their own device

### Requirement: Folded columns on a phone
Below 640 px a folded column SHALL be a strip 48 px wide in the swiping row with its own snap point, the pager SHALL show one dot per unfolded column, and the page bar's column name SHALL name only unfolded columns. Tapping a strip SHALL unfold it and scroll it into view. Nothing SHALL overflow vertically or need a second scroll region.

#### Scenario: Swipe past a folded column
- **WHEN** a board on a 390 px screen has "Backlog", a folded "Later" and "Doing", and the user swipes left from "Backlog"
- **THEN** the row snaps so that the "Later" strip and the start of "Doing" are in view, the pager shows two dots, and the page bar reads "Doing"

#### Scenario: Tap to unfold
- **WHEN** the user taps the "Later" strip on the phone
- **THEN** "Later" unfolds at 88 % of the screen width, snaps into view, and the pager shows three dots

### Requirement: Notes preview on cards
A board SHALL offer an opt-in notes preview, off by default. On a project board it SHALL be turned on and off with the checkable item "Show notes on cards" in the board's page menu and stored as the user's personal preference of that project (`card_notes` of the project preferences), so each member of a shared project, viewers included, chooses for themselves; on a saved view it is the "Notes on cards" switch of the display panel (OpenSpec `custom-views`). The choice SHALL be an operation written locally first, working offline, following the user to their devices and converging by last writer wins; a missing or unknown stored value SHALL read as off. When on, each card whose task has notes SHALL show them between the title and the property row as plain text on at most two lines, cut with an ellipsis, at the metadata size in the muted tone: Markdown marks removed, links reduced to their text, images, attachments, embeds and tables left out, list and checklist items joined with " · ". A card without notes SHALL show no empty line. The preview SHALL be part of the card's accessible name after the title. It SHALL be computed on the device from the task's notes, offline and on encrypted accounts alike; notes this device cannot decrypt SHALL show no preview and never ciphertext; the server SHALL never compute or serve it.

#### Scenario: Turn it on for one project
- **WHEN** the user chooses "Show notes on cards" in the menu of the board of "Renovation"
- **THEN** every card of "Renovation" with notes shows two lines of them, the boards of other projects are unchanged, and the user's phone shows the previews after sync

#### Scenario: Personal on a shared project
- **WHEN** Ana turns on the preview on the shared project "Launch"
- **THEN** Ben, a member, still sees "Launch" cards without previews until he turns it on himself

#### Scenario: Markdown becomes plain text
- **WHEN** a card's notes are a heading "Plan", an open checklist item "call **Marco** about the [quote](https://example.com)", a done item "measure the wall" and an image
- **THEN** the preview reads "Plan · call Marco about the quote · measure the wall" and shows no image

#### Scenario: Encrypted account offline
- **WHEN** an encrypted account's device is offline with its key unlocked and the preview is on
- **THEN** the cards show their notes previews from the decrypted local notes, and no request is made

#### Scenario: Notes not decryptable here
- **WHEN** a card's notes are still ciphertext on this device
- **THEN** the card shows no preview line and no ciphertext

#### Scenario: Concurrent choices
- **WHEN** the user turns the preview on on the laptop and off on the phone, both offline, and both sync
- **THEN** both devices end with the value written with the greater timestamp
