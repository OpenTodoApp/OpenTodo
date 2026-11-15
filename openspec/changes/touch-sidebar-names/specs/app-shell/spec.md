# Spec Delta

## ADDED Requirements

### Requirement: Sidebar rows on touch give the name the room
On a coarse pointer a sidebar row that has a menu (a project, a label, a saved view, a favourite, a pinned note) SHALL NOT paint its menu button and SHALL NOT keep room for it: the row's name takes the width up to the row's marks and count, which stay. Holding the row still for the touch hold time SHALL tint it, and releasing SHALL open the row's menu, the same menu the button opens, and SHALL NOT open the row; moving the finger before the hold SHALL scroll the list and open nothing, and on a row that can be dragged a move after the hold SHALL drag it as before. A tap SHALL open the row as before. The menu button SHALL remain in the Tab order and in the accessibility tree with its name ("Menu for project Home renovation") at the end of its row: while it has keyboard focus it SHALL show there, over the count, at least 44 by 44 CSS pixels, and Enter or Space SHALL open the menu; while it is not shown it SHALL take no taps. A group heading's own menu and the rows of the Labels and Views pages are not affected. With a fine pointer nothing SHALL change: the button shows on hover and focus as before. Nothing here changes what the menu's items do or write, so it is the same offline.

#### Scenario: A long project name on a tablet
- **WHEN** the project "Home renovation with a rather long project name", shared and with 7 open tasks, is shown in the 256 px sidebar at 768 px on a touch screen
- **THEN** its row shows no menu button, its name runs up to the members mark and the count, and at least six more characters of the name show than with the button

#### Scenario: Hold opens the menu
- **WHEN** the user holds a project's row in the phone drawer until it tints, and lifts the finger
- **THEN** the project's menu opens, the project is not opened and the drawer stays open

#### Scenario: Tap and scroll
- **WHEN** the user taps a project's row, and on another visit drags a finger over the rows
- **THEN** the tap opens the project and the drag scrolls the list, and neither opens a menu

#### Scenario: Keyboard on a touch device
- **WHEN** a user with a keyboard attached to a tablet presses Tab on a project's row
- **THEN** the row's menu button shows at the end of the row with the focus ring, and Enter opens the menu

#### Scenario: Screen reader on touch
- **WHEN** a screen reader user on a phone moves past a project's row in the drawer
- **THEN** the next item is the button "Menu for project", named after the project, and activating it opens the menu

#### Scenario: Mouse
- **WHEN** the same sidebar is shown at 1280 px with a mouse
- **THEN** every row looks and behaves as before: the menu button appears on hover and on focus

### Requirement: Sidebar footer on touch shows whole words
On a coarse pointer the account control in the sidebar footer SHALL show the person's name only where the whole name fits beside the avatar; where it does not, the control SHALL show the avatar alone, never part of the name with an ellipsis. The sync state SHALL always show its dot. While a sync runs the dot SHALL be the only sign, so the footer does not change with every sync; the words of the other states that show words ("Offline · 2 pending", "3 pending", "Locked") SHALL show only where they fit whole, and SHALL take their room before the name. The account control SHALL keep the person's name as its accessible name and the sync control its state as its accessible name, whatever is shown. Every control of the footer SHALL keep a target of at least 44 by 44 CSS pixels, none SHALL overlap another, and the row SHALL NOT be wider than the sidebar. A sync error SHALL keep its words and its detail as before. With a fine pointer the footer SHALL NOT change.

#### Scenario: Tablet sidebar
- **WHEN** Ada Lovelace's sidebar is 256 px wide on a touch screen, with the assistant launcher and notifications in the footer
- **THEN** the account control shows her avatar alone and is named "Ada Lovelace"

#### Scenario: Phone drawer
- **WHEN** the same account opens the drawer on a 360 px wide phone
- **THEN** the footer reads "Ada Lovelace" whole beside the avatar

#### Scenario: A sync runs
- **WHEN** a sync starts and ends while the drawer is open on a 360 px wide phone
- **THEN** the dot pulses and turns green again, the name stays "Ada Lovelace" throughout, and no words appear beside the dot

#### Scenario: Offline on a tablet
- **WHEN** the device goes offline with nothing pending and the sidebar is 256 px wide on a touch screen
- **THEN** the footer reads "Offline" whole beside the grey dot

#### Scenario: Words that do not fit
- **WHEN** the sync state's words are wider than the room left beside the footer's other controls
- **THEN** only the dot shows, the row is no wider than the sidebar, and the control's accessible name still carries the words
