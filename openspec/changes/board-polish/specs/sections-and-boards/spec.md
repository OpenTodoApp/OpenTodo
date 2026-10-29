## ADDED Requirements

### Requirement: Fold a board column
Every column of a board (a project board, a saved view in the Board layout and a board of filters) except the "Add a section" column SHALL be foldable from its column menu ("Fold column") and with `z`, into a strip of the column surface the board's full height that shows the column's icon or colour dot, its open-task count and its name written vertically. Activating the strip (pointer, Enter or Space, or `z`) SHALL unfold it. A column SHALL be folded exactly when its section or group is collapsed on this device: folding a project board's column collapses that section in the project's list on the same device and collapsing a section in the list folds its column, and a saved view's column follows the view's collapsed group the same way. The fold state SHALL be kept per device, SHALL survive a restart and SHALL write no operation. The strip SHALL be one control whose accessible name gives the name, the open-task count and the folded state. `h` and `l` SHALL skip folded columns.

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

## MODIFIED Requirements

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
