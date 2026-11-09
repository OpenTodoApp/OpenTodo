## MODIFIED Requirements

### Requirement: Inline title editing
On a fine pointer from 768 px wide, with the panel closed and the device preference "Click a task to" set to "Edit in place" (the default), clicking a task's title in a list SHALL select the row and turn its title into a text field in place, with the caret where the user clicked. `F2` on a selected row SHALL do the same with the caret at the end. Enter or a click outside the row SHALL save the title, Esc SHALL discard the title change and leave the row selected, and `Shift+Enter` SHALL save and open the task panel. Only one row SHALL be edited inline at a time, and that row SHALL not start a drag, so pressing and moving in its field selects text; the other rows stay draggable. Edits SHALL apply locally at once, work offline and converge per field like any title edit. Viewers SHALL never get the inline editor. With the preference set to "Open details", on a coarse pointer, below 768 px, or while the panel is open, a click SHALL open the task in the panel as before; with "Expand the row" a click SHALL show or hide the row's details instead ("Click a task to" and double-click). A click on a row's or a board card's empty area (anything that is not the title, the checkbox, the chevron, the selection box, a link or a revealed action: the padding, the gaps, the leading slot, the trailing space) SHALL select the task and open it in the panel under "Edit in place" and "Open details" and on any pointer (under "Expand the row" it expands the row), Shift or Ctrl/⌘ on it SHALL tick the row as on the title, and a drag or a swipe that ends on it SHALL not open anything. The row's controls keep their own actions and the keyboard behaviour is unchanged.

#### Scenario: Fix a typo in place
- **WHEN** the panel is closed and the user clicks inside the title "Renew pasport" between "pas" and "port", types `s` and presses Enter
- **THEN** the title is "Renew passport", no panel opened, and the row stays selected

#### Scenario: Cancel
- **WHEN** the user is editing a title inline and presses Esc
- **THEN** the title is unchanged, the editor closes and the row is still selected

#### Scenario: Keyboard start
- **WHEN** a row is selected with `j` and the user presses `F2`
- **THEN** the row's title becomes editable with the caret at the end

#### Scenario: Open the details from the editor
- **WHEN** the user is editing inline and presses `Shift+Enter`
- **THEN** the title is saved and the task panel opens on that task

#### Scenario: Panel open means switch
- **WHEN** the panel shows one task and the user clicks another task's title
- **THEN** the panel shows the clicked task and no inline editor opens

#### Scenario: Phone
- **WHEN** the user taps a task's title on a 390 px wide touch screen
- **THEN** the task opens in the panel sheet as before

#### Scenario: Preference to open details
- **WHEN** the user sets "Click a task to" to "Open details" on this device and clicks a title
- **THEN** the panel opens, and on another device the default is still "Edit in place"

#### Scenario: Selecting text does not drag
- **WHEN** the user is editing a title inline in a manually ordered list and drags across the words in its field
- **THEN** the words are selected, the row does not move, and every other row can still be dragged

#### Scenario: Empty area opens the panel
- **WHEN** "Click a task to" is "Edit in place", the panel is closed, and the user clicks a row in the space between its title and its project name
- **THEN** the row is selected and the task opens in the panel, and no inline editor opens

#### Scenario: Empty area with "Open details"
- **WHEN** "Click a task to" is "Open details" and the user clicks a row's left padding
- **THEN** the task opens in the panel

#### Scenario: Controls keep their actions
- **WHEN** the user clicks a row's checkbox, its chevron or its revealed More action
- **THEN** the task completes, its subtasks fold, or the row menu opens, and the panel does not open

#### Scenario: A drag does not open
- **WHEN** the user presses a row's empty area, drags it to another place in a manually ordered list and releases
- **THEN** the task moves and the panel does not open

## ADDED Requirements

### Requirement: "Click a task to" and double-click
The device preference "Click a task to" SHALL offer three choices: "Edit in place" (the default), "Open details" and "Expand the row". It SHALL be kept on the device only, never synced, and a change in one tab SHALL apply in the others. With "Expand the row", a pointer click on a list row's title or empty area SHALL select the row and show its details under it, or hide them when they are shown, exactly as Show details does (`Expanded rows`), on any pointer and at any width; this SHALL apply wherever rows expand (the list layout of the Inbox, Today, Upcoming, Anytime, Someday, Completed, Assigned to me, projects, labels, places, the Filter view and saved views). Where rows do not expand (board cards, Next, Waiting), a click SHALL open the task as under "Open details". Shift or Ctrl/⌘ clicks and Select mode SHALL keep ticking rows under every choice.

A double-click on a task row of those lists, board cards, Next and Waiting SHALL open the task's page under every choice, including when the side panel or the Inbox's split is shown. The second click of a double-click SHALL do nothing of its own, so a double-click never expands and hides a row or opens two things. A double-click on a row's controls (the checkbox, the chevron, the selection box, the revealed actions, the disclosure, the edit bar) SHALL keep their own meaning. A double-click inside a title that was already being edited in place SHALL select a word, as in any text field, and open nothing; a double-click whose first click turned the title into a field SHALL still open the page.

The keyboard SHALL be unchanged under every choice: Enter opens the task (its page, or the side panel or the Inbox's split where they are shown), Shift+Enter opens the page from the inline editor, → shows the details and F2 edits the title. This is presentation only; nothing about the task changes, and it behaves the same offline.

#### Scenario: Expand with a click
- **WHEN** "Click a task to" is "Expand the row" and the user clicks the title of "Pay rent" in Today
- **THEN** the row is selected, its details show under it, its open control is announced as expanded, no title field opens and no page opens

#### Scenario: A second click hides the details
- **WHEN** the details of "Pay rent" are shown under "Expand the row" and the user clicks its title again a moment later
- **THEN** the details are hidden and the row stays selected

#### Scenario: Enter still opens
- **WHEN** "Click a task to" is "Expand the row", a row is selected and the user presses Enter
- **THEN** the task's page opens

#### Scenario: Board cards open
- **WHEN** "Click a task to" is "Expand the row" and the user clicks a card on a project's board
- **THEN** the task opens as under "Open details"

#### Scenario: Double-click opens the page
- **WHEN** under any of the three choices the user double-clicks the title of "Pay rent" in a project
- **THEN** the task's page opens at `/task/<id>`, and no details stay expanded and no title field stays open

#### Scenario: Double-click beside the side panel
- **WHEN** the side panel shows "Pay rent" and the user double-clicks the row of "Call the bank"
- **THEN** the page of "Call the bank" opens

#### Scenario: Selecting a word while editing
- **WHEN** a title is already being edited in place and the user double-clicks a word in its field
- **THEN** the word is selected and no page opens

#### Scenario: The checkbox keeps its meaning
- **WHEN** the user double-clicks a row's checkbox
- **THEN** the task is completed and reopened as by two clicks, and no page opens

#### Scenario: Another device
- **WHEN** the user chooses "Expand the row" on a laptop
- **THEN** the laptop's other tabs follow at once, and a phone signed in to the same account still uses "Edit in place"
