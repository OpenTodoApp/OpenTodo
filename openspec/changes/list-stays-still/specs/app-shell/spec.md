## MODIFIED Requirements

### Requirement: Page template
Every view SHALL render a page header with the title in the page title size, an optional lead line under the title (the page's meta: a date, totals, members and role, a count, a read-only note) in the muted tone at the metadata size, at most two visible actions, an overflow menu for the rest and the Help action; below it a content column whose width is fixed per page type: lists and feeds 48 rem, settings and forms 42 rem, a list with field columns and a project's list layout 72 rem, boards, timelines and calendars the whole frame. The header SHALL stay visible while the content scrolls. Below 768 px the shell's bar SHALL carry the title and show the lead line as its subtitle on one line, cut at the bar's edge, so a lead line that arrives with the data does not grow the bar; on a project the subtitle is plain text, and members and public links open from Share.

There SHALL be two page frames, both with the same side padding and both starting at the content column's left edge, so every page's title starts at the same horizontal position:

- A **standalone page**, one that offers no layout switch (Inbox, Today, Upcoming, Anytime, Someday, Next, Waiting, Assigned to me, Completed, a label, Filter, a saved filter, Trash, Updates, settings, Import, Ask, Help, the review screens), SHALL have a frame as wide as its content width plus the padding, with the header and the content inside it, so the title and the content start at the same left edge.
- A **layout page**, one that offers a layout switch (a project, a saved view that offers a board or a timeline, the calendars), SHALL have one frame of at most 80 rem, shared by every layout: the header and any footer line span the frame, the content starts at the frame's left edge, wide content scrolls inside the frame rather than widening it, and switching a project between list, board and timeline SHALL not move its title or actions.

When the panel opens as a column, the content column SHALL narrow by the panel's width and the panel SHALL open into the space to the right of the frame: no frame SHALL move horizontally when the panel opens or closes, and a frame wider than the narrowed column SHALL narrow from its right side, its left edge staying where it was. Nothing SHALL slide. This is presentation only, reads nothing from the server and behaves the same offline.

#### Scenario: Same left edge
- **WHEN** the user moves between Inbox, Today, Labels, Trash, the Filter view and a project on a 1280 px screen
- **THEN** the title and the first row start at the same horizontal position in all six, at the content column's left edge plus the page padding

#### Scenario: A lead line under the title
- **WHEN** Today is opened on a 1280 px screen with 5 h 15 m planned and 40 m tracked
- **THEN** the title "Today" is on its own line and "Wednesday 21 October · 5 h 15 m planned · 40 m tracked" is a muted line under it, and the two header actions and Help are on the title's line

#### Scenario: Centred on a wide screen
- **WHEN** Today is open with the panel closed on a 2560 px screen with the sidebar at its default width
- **THEN** the frame is no longer centred: it is 48 rem plus its padding wide and starts at the content column's left edge, at the same position as a project's title, and the space to its right is left for the panel

#### Scenario: The panel docks
- **WHEN** Today is open on a 1920 px screen and the user opens a task
- **THEN** the panel is a 30 rem column at the right, the title and every row keep their horizontal position within 1 px, and the list keeps its 48 rem width

#### Scenario: No room to move
- **WHEN** Today is open on a 1024 px screen and the user opens a task
- **THEN** the frame narrows with the column from its right side and the title does not move horizontally

#### Scenario: Opening and closing a task moves no row
- **WHEN** the user opens a task and closes it again on Today and on a project, at 1280, 1440 and 1920 px
- **THEN** the first row and the title are at the same horizontal position, within 1 px, before, while and after the panel is open

#### Scenario: Reduced motion
- **WHEN** the system asks for reduced motion and a task is opened on a 1920 px screen
- **THEN** the list does not move at all, and the panel appears without sliding in

#### Scenario: List, board and timeline keep the header still
- **WHEN** the user switches "Q4 launch" from List to Board to Timeline on a 1440 px screen
- **THEN** the project title and the List/Board/Timeline control stay at the same position in all three, and only the content below changes width

#### Scenario: A project list fills its frame
- **WHEN** a project is shown as a list on a 1440 px screen with the panel closed
- **THEN** its rows span the 72 rem content width from the frame's left edge, and the title starts at the same place as on the board

#### Scenario: Wide board inside the frame
- **WHEN** a board has eight columns on a 1280 px screen
- **THEN** the board scrolls sideways inside the frame and the header keeps its width and position

#### Scenario: Actions in the header
- **WHEN** a project has Share, Rename, Move, Archive, Activity and History actions
- **THEN** the header shows the List/Board control and Share, and the remaining actions are in the overflow menu

#### Scenario: Phone bar carries the lead line
- **WHEN** Today is open on a 390 px screen
- **THEN** the shell's bar shows "Today" with the date line under it as its subtitle, and the page header row shows no second title

#### Scenario: Long lead line on a phone
- **WHEN** a shared project with a public link opens at 360 px and "2 · owner · Public" is wider than the space beside the title
- **THEN** the subtitle stays one line, cut at the bar's edge with its full text reachable, and the bar keeps its height
