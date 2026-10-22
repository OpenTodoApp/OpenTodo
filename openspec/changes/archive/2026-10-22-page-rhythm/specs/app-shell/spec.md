## MODIFIED Requirements

### Requirement: Page template
Every view SHALL render a page header with the title in the page title size, an optional lead line under the title (the page's meta: a date, totals, members and role, a count, a read-only note) in the muted tone at the metadata size, at most two visible actions, an overflow menu for the rest and the Help action; below it a content column whose width is fixed per page type: lists and feeds 48 rem, settings and forms 42 rem, a list with field columns and a project's list layout 72 rem, boards, timelines and calendars the whole frame. The header SHALL stay visible while the content scrolls. Below 768 px the shell's bar SHALL carry the title and show the lead line as its subtitle.

There SHALL be two page frames, both with the same side padding and both inside the content column:

- A **standalone page**, one that offers no layout switch (Inbox, Today, Upcoming, Anytime, Someday, Next, Waiting, Assigned to me, Completed, a label, Filter, a saved filter, Trash, Updates, settings, Import, Ask, Help, the review screens), SHALL have a frame as wide as its content width plus the padding, centred in the content column, with the header and the content inside it, so the title and the content start at the same left edge and no page is left-aligned in a wider column.
- A **layout page**, one that offers a layout switch (a project, a saved view that offers a board or a timeline, the calendars), SHALL have one frame of at most 80 rem centred in the column, shared by every layout: the header and any footer line span the frame, the content starts at the frame's left edge, wide content scrolls inside the frame rather than widening it, and switching a project between list, board and timeline SHALL not move its title or actions.

When the panel opens as a column, the content column SHALL narrow by the panel's width and a standalone frame SHALL re-centre in the remaining width, moving with the emphasis duration and the calm easing, or at once under reduced motion; where the column is already no wider than the frame, nothing SHALL move. This is presentation only, reads nothing from the server and behaves the same offline.

#### Scenario: Same left edge
- **WHEN** the user moves between Inbox, Today, Labels, Trash and the Filter view on a 1280 px screen
- **THEN** the title and the first row start at the same horizontal position in all five, and the frame is centred in the content column

#### Scenario: A lead line under the title
- **WHEN** Today is opened on a 1280 px screen with 5 h 15 m planned and 40 m tracked
- **THEN** the title "Today" is on its own line and "Wednesday 21 October · 5 h 15 m planned · 40 m tracked" is a muted line under it, and the two header actions and Help are on the title's line

#### Scenario: Centred on a wide screen
- **WHEN** Today is open with the panel closed on a 1536 px screen with the sidebar at its default width
- **THEN** the frame is 52 rem wide and the space on its left equals the space on its right, within 1 px

#### Scenario: The panel docks
- **WHEN** Today is open on a 1920 px screen and the user opens a task
- **THEN** the panel is a 30 rem column at the right, the frame re-centres in the remaining column within the emphasis duration, and the list keeps its 48 rem width

#### Scenario: No room to move
- **WHEN** Today is open on a 1280 px screen and the user opens a task
- **THEN** the frame fills the narrowed column and the title does not move horizontally

#### Scenario: Reduced motion
- **WHEN** the system asks for reduced motion and a task is opened on a 1920 px screen
- **THEN** the frame is at its new place at once, with no slide

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
