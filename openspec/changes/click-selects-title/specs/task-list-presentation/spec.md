## MODIFIED Requirements

### Requirement: Inline title editing
In the list layout of the Inbox, Today, Upcoming, Anytime, Someday, Completed, Assigned to me, projects, labels and places, on a fine pointer from 768 px wide, a click on the title of the row that was already selected when the press began SHALL turn its title into a text field in place, with the caret where the user clicked ("A click selects the row, a second click edits its title"). This SHALL hold with the task page preference, beside the side panel and in the Inbox's split alike. `F2` on a selected row SHALL do the same with the caret at the end. Enter or a click outside the row SHALL save the title, Esc SHALL discard the title change and leave the row selected, and `Shift+Enter` SHALL save and open the task. Only one row SHALL be edited inline at a time, and that row SHALL not start a drag, so pressing and moving in its field selects text; the other rows stay draggable. Edits SHALL apply locally at once, work offline and converge per field like any title edit, also while the side panel shows the same task. Viewers SHALL never get the inline editor. On a coarse pointer or below 768 px no click SHALL start the inline editor. The row's controls keep their own actions and the keyboard behaviour is unchanged.

#### Scenario: Fix a typo in place
- **WHEN** "Renew pasport" is the selected row and the user clicks inside its title between "pas" and "port", types `s` and presses Enter
- **THEN** the title is "Renew passport", no panel or page opened, and the row stays selected

#### Scenario: Cancel
- **WHEN** the user is editing a title inline and presses Esc
- **THEN** the title is unchanged, the editor closes and the row is still selected

#### Scenario: Keyboard start
- **WHEN** a row is selected with `j` and the user presses `F2`
- **THEN** the row's title becomes editable with the caret at the end

#### Scenario: Open the details from the editor
- **WHEN** the user is editing inline and presses `Shift+Enter`
- **THEN** the title is saved and the task opens on that task

#### Scenario: Edit beside the side panel
- **WHEN** the side panel shows "Order the tiles", its row is selected, and the user clicks its title in the list, types " and grout" and presses Enter
- **THEN** the row's title is edited in place, the panel's title reads "Order the tiles and grout", and the panel stays open on it

#### Scenario: Panel open means switch
- **WHEN** the panel shows one task and the user clicks another task's title
- **THEN** the panel shows the clicked task and no inline editor opens

#### Scenario: Phone
- **WHEN** the user taps a task's title on a 390 px wide touch screen
- **THEN** the task opens as its page as before, and no title field opens

#### Scenario: Viewer
- **WHEN** a viewer of a shared project clicks the title of the selected row
- **THEN** no title field opens and the row stays selected

#### Scenario: Preference to open details
- **WHEN** a device had stored "Click a task to: Open details" before this change, and the user clicks the title of a row that is not selected with the task page preference
- **THEN** the row is selected and no page opens, as on every other device

#### Scenario: Selecting text does not drag
- **WHEN** the user is editing a title inline in a manually ordered list and drags across the words in its field
- **THEN** the words are selected, the row does not move, and every other row can still be dragged

#### Scenario: Empty area opens the panel
- **WHEN** a user with the side panel clicks a row in the space between its title and its project name
- **THEN** the row is selected and the task shows in the panel, and no inline editor opens

#### Scenario: Empty area with "Open details"
- **WHEN** a device had stored "Click a task to: Open details", and the user clicks a row's left padding with the task page preference
- **THEN** the row is selected and no page opens

#### Scenario: Controls keep their actions
- **WHEN** the user clicks a row's checkbox, its chevron or its revealed More action
- **THEN** the task completes, its subtasks fold, or the row menu opens, and no title field opens

#### Scenario: A drag does not open
- **WHEN** the user presses a row's empty area, drags it to another place in a manually ordered list and releases
- **THEN** the task moves and the panel does not open

## REMOVED Requirements

### Requirement: "Click a task to" and double-click
**Reason**: The device preference could not say what a click does: the result also depended on the pointer, the width, the task opening preference and the list (GitHub issue 1405). One rule replaces its three choices ("A click selects the row, a second click edits its title"), and its double-click moves there unchanged.
**Migration**: None for data: the choice lived only in the device's browser storage, was never synced, and is no longer read. "Edit in place": a click selects and a second click (or `F2`) edits. "Open details": a click selects; Enter, a double-click or Open task opens. "Expand the row": a click selects; → or Show details expands.

## ADDED Requirements

### Requirement: A click selects the row, a second click edits its title
On a fine pointer from 768 px wide, a pointer click (a mouse, trackpad or pen press on the row, then its click) on a task row's title or empty area whose row was not the selected row when the press began SHALL select that row and do nothing else: it SHALL NOT edit the title and SHALL NOT open the task's page. Where a task shows beside the list (the side panel of `web-app` "Task details in a side panel", the Inbox's split of `inbox-triage` "Inbox list and detail") the selected task SHALL show there, as for any cursor move. A click on the title of the row that was the selected row when the press began SHALL edit it in place ("Inline title editing") where the list has the inline editor; a click on the empty area of the selected row SHALL change nothing. A row counts as selected however it was selected: a click, `j`/`k`, the arrow keys, returning from the task page, or a task opened from the panel.

This SHALL apply to the list layout of the Inbox, Today, Upcoming, Anytime, Someday, Completed, Assigned to me, projects, labels and places. Board cards, the Filter view, saved views, Next and Waiting SHALL select on a first click in the same way; a second click there SHALL change nothing. The calendar's Day, Week, Month and Plan, the timeline, dashboards, the review screens and Close the day keep their own clicks.

A double-click on a task row of those lists or a board card SHALL open the task's page, including when the side panel or the Inbox's split is shown. The second click of a double-click SHALL do nothing of its own, so a double-click on a row that was not selected never shows a title field; a double-click on the selected row whose first click turned the title into a field SHALL open the page and close the field with nothing changed. A double-click on a row's controls (the checkbox, the chevron, the selection box, the revealed actions, the disclosure, the edit bar) SHALL keep their own meaning, and a double-click inside a title already being edited SHALL select a word and open nothing.

Shift or Ctrl/⌘ clicks and Select mode SHALL keep ticking rows, a press that moves into a drag or a swipe SHALL not select or edit on release, and a row's controls keep their actions. Enter or Space on the row's open control, an assistive technology's activation of it, and any click that did not start with a pointer press on the row SHALL open the task as Enter does, never select only or edit. A tap on a coarse pointer, and a click below 768 px, SHALL open the task as before: its page, or the side panel or the Inbox's split where they show. The keyboard SHALL be unchanged: Enter opens the task, `F2` edits the title, → shows the details and `a` adds a subtask. No setting changes this rule. This is presentation only; nothing about the task changes, and it behaves the same offline.

#### Scenario: First click selects in Today
- **WHEN** Today is shown with the task page preference on a 1280 px screen with a mouse, and the user clicks the title of "Pay rent", which is not selected
- **THEN** "Pay rent" is the selected row with focus on its open control, no title field opens and no page opens

#### Scenario: Second click edits
- **WHEN** "Pay rent" is selected and, a moment later, the user clicks inside its title
- **THEN** the title becomes a text field with the caret where the user clicked

#### Scenario: Same rule beside the side panel
- **WHEN** a user with the side panel open clicks the title of "Call the bank" in a project, then clicks it again a moment later
- **THEN** the first click selects the row and shows "Call the bank" in the panel, and the second turns its title in the list into a text field

#### Scenario: Same rule in the Inbox split
- **WHEN** the Inbox shows its split on a 1440 px screen with the task page preference and the user clicks the title of "Book the dentist" twice, a moment apart
- **THEN** the first click shows it in the pane beside the list, and the second edits its title in place

#### Scenario: Selected with the keyboard
- **WHEN** the user selects "Pay rent" with `j` and then clicks its title
- **THEN** the title becomes a text field at once

#### Scenario: Double-click opens the page
- **WHEN** the user double-clicks the title of "Pay rent", which is not selected, in a project
- **THEN** the task's page opens at `/task/<id>`, and no title field was shown

#### Scenario: Double-click on the selected row
- **WHEN** "Pay rent" is selected and the user double-clicks its title
- **THEN** the task's page opens, and the title is unchanged

#### Scenario: Selecting a word while editing
- **WHEN** a title is already being edited in place and the user double-clicks a word in its field
- **THEN** the word is selected and no page opens

#### Scenario: Empty area
- **WHEN** the user clicks a row in the space between its title and its project name, then clicks the same place again
- **THEN** the first click selects the row, the second changes nothing, and no title field or page opens

#### Scenario: A drag from the selected row
- **WHEN** "Pay rent" is selected in a manually ordered project and the user presses its title, drags it two rows down and releases
- **THEN** the task moves, and no title field opens

#### Scenario: Ticking is unchanged
- **WHEN** "Pay rent" is selected and the user Ctrl+clicks its title
- **THEN** the row is ticked, and no title field opens

#### Scenario: Board card
- **WHEN** the user clicks a card on a project's board with the task page preference, then clicks it again
- **THEN** the card is selected and no page opens; Enter or a double-click opens its page

#### Scenario: Filter view
- **WHEN** the user clicks a result in the Filter view with the task page preference
- **THEN** the result is selected and no page opens

#### Scenario: Screen reader activation
- **WHEN** a screen reader user moves to the row of "Pay rent" and activates its open control
- **THEN** the task opens as with Enter, and no title field opens

#### Scenario: Tap on a phone
- **WHEN** the user taps the title of "Pay rent" on a 390 px wide touch screen
- **THEN** the task's page opens as before

#### Scenario: Enter still opens
- **WHEN** a row is selected with a click and the user presses Enter
- **THEN** the task opens: its page, or the side panel or the Inbox's split where they show

#### Scenario: No setting
- **WHEN** the user opens Settings → General → Keyboard
- **THEN** there is no "Click a task to" setting, and a device that had stored "Open details" or "Expand the row" follows this rule
