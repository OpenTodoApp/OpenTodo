## MODIFIED Requirements

### Requirement: Page template
Every view SHALL render a page header with the title in one size, optional meta text beside it, at most two visible actions, an overflow menu for the rest and the Help action; below it a content column whose width is fixed per page type: lists and feeds 48 rem, settings and forms 42 rem, boards, timelines and calendars the whole frame. Every page type SHALL share one page frame: centred in the column, at most 80 rem wide, with the same side padding. The header, and any footer line a page shows below its content, SHALL span the whole frame, so at a given window width the title starts and the last header action ends at the same place on every page; the content SHALL start at the frame's left edge and wide content SHALL scroll inside the frame rather than widen it. Switching a project between list, board and timeline SHALL not move its title or actions. The header SHALL stay visible while the content scrolls.

#### Scenario: Same left edge
- **WHEN** the user moves between Inbox, a project, Labels, Trash and the Filter view on a 1280 px screen
- **THEN** the title and the content start at the same horizontal position in all five, and the header's last action ends at the same position in all five

#### Scenario: Actions in the header
- **WHEN** a project has Share, Rename, Move, Archive, Activity and History actions
- **THEN** the header shows the List/Board control and Share, and the remaining actions are in the overflow menu

#### Scenario: List, board and timeline keep the header still
- **WHEN** the user switches "Q4 launch" from List to Board to Timeline on a 1440 px screen
- **THEN** the project title and the List/Board/Timeline control stay at the same position in all three, and only the content below changes width

#### Scenario: Wide board inside the frame
- **WHEN** a board has eight columns on a 1280 px screen
- **THEN** the board scrolls sideways inside the frame and the header keeps its width and position
