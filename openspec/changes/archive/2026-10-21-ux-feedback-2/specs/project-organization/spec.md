## MODIFIED Requirements

### Requirement: Project tree in the sidebar
The sidebar SHALL render non-archived projects as a tree ordered by position within each level, indenting each level 16 px beneath its parent, inside the sidebar's single scroller. Project rows SHALL be separated by at least 2 px; the open children of a project SHALL be joined to it by a thin vertical guide line in the border colour, running from below the parent's icon down the side of its last visible descendant, and an expanded top-level project's subtree SHALL be followed by 6 px of space before the next top-level project. The guide line is decoration: it is not read by assistive technology, which keeps the tree's levels. Each project SHALL show its icon in its colour, or a coloured dot when it has no icon. The tree SHALL be rendered from local data and SHALL reflect remote moves after sync without a reload.

#### Scenario: Three levels
- **WHEN** "Work" contains "Client A", which contains "Q4 launch"
- **THEN** the sidebar lists "Work", then "Client A" indented beneath it, then "Q4 launch" indented beneath that

#### Scenario: Remote move appears
- **WHEN** another device moves "Q4 launch" directly under "Work" and this device syncs
- **THEN** the sidebar shows "Q4 launch" as a sibling of "Client A" without a page reload

#### Scenario: Children read as children
- **WHEN** "Work" is expanded and contains "Client A" and "Hiring", and "Home" follows it
- **THEN** "Client A" and "Hiring" are indented 16 px under "Work" with a guide line beside them from "Work" down to "Hiring", and "Home" starts 6 px below "Hiring"

#### Scenario: Guide line on narrow screens
- **WHEN** the sidebar shows four levels on a 360 px screen where indentation is capped
- **THEN** the guide lines stop at the capped indentation and the full path is still in each row's tooltip

## ADDED Requirements

### Requirement: Drop a task on a project
A task dragged from a list or a board SHALL be droppable on a project row in the sidebar, on the Inbox entry and on a pinned project in Favourites. While the pointer is over a target the target SHALL show the drop ring and the list SHALL not show a drop line. Dropping SHALL move the task to that project (the Inbox: no project) exactly as the Move action does, with its sub-tasks, through the operation log, and a toast SHALL name the project with Undo. When the dragged task is part of the bulk selection, every selected task SHALL move as one batch. Dropping on the project the task is already in, on a project the user may not add tasks to, or pressing Escape SHALL change nothing. The move SHALL apply locally at once, work offline through the outbox and converge per field like any move; on touch the drag starts after the same long press as reordering. `m` remains the keyboard way to move.

#### Scenario: Drop on a project
- **WHEN** the user drags "Buy paint" from the Inbox and releases it over "Home renovation" in the sidebar
- **THEN** the task leaves the Inbox and is in "Home renovation", and the toast reads "Moved to Home renovation" with Undo

#### Scenario: Several selected tasks
- **WHEN** three tasks are selected and the user drags one of them onto "Work"
- **THEN** all three move to "Work" and one Undo moves all three back

#### Scenario: Viewer of a shared project
- **WHEN** the user drags a task over a project where they are a viewer
- **THEN** the project shows no drop ring and releasing there changes nothing

#### Scenario: Offline move converges
- **WHEN** the phone is offline, the user drops a task on "Work", and the laptop renames the same task meanwhile
- **THEN** after both sync every device shows the renamed task in "Work"
