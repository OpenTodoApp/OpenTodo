# project-organization Specification

## Purpose
Defines projects as the containers tasks live in, the Inbox as the default container, and the views that organise tasks by project.

## Requirements

### Requirement: Project fields
A project SHALL have a name, a colour, a sort position, an archived flag, an optional parent project, creation time, optional deletion time, a note held as a Markdown `description` with its mergeable `notes_doc` document (see `project-notes`), and an additive `workspace_id` naming the workspace it belongs to (absent or null means the account's default workspace), written and synced as an ordinary operation that converges by last-writer-wins. A sub-project SHALL belong to the workspace of its parent; a parent in another workspace SHALL be treated as missing (the project shows at the top level of its own workspace).

#### Scenario: Create a project
- **WHEN** the user creates a project with a name
- **THEN** it appears in the sidebar immediately as a top-level project of the current workspace with an assigned colour and an empty note, and opens as the current view

#### Scenario: Project synced before the note existed
- **WHEN** a device holds a project row received before the note fields existed
- **THEN** the project reads as having an empty note, and no operation is written until someone edits it

#### Scenario: Project synced before workspaces existed
- **WHEN** a device holds a project row received before the `workspace_id` field existed
- **THEN** the project reads as belonging to the default workspace, and no operation is written

#### Scenario: Parent in another workspace
- **WHEN** a project's `parent_id` names a project of another workspace
- **THEN** the project is shown at the top level of its own workspace until the parent is in the same workspace, and no data is changed

### Requirement: Sub-projects through the parent reference
A project whose parent is unset SHALL be a top-level project; a project whose parent is set SHALL be a sub-project of that parent, to any depth. The parent reference SHALL be stored and synced as the existing `parent_id` field, so edits made offline are applied locally at once and converge under per-field last-writer-wins.

#### Scenario: Create a sub-project
- **WHEN** the user creates a project from within an existing project's view or chooses a parent in the create form
- **THEN** the new project appears nested under that parent in the sidebar, with the parent expanded so it is visible

#### Scenario: Parent referencing a missing project
- **WHEN** a project's parent refers to a project this device has not received, or that is deleted
- **THEN** the project is shown at the top level until the parent arrives or is restored, and no data is changed

### Requirement: Inbox is the default container
A task SHALL be an Inbox task while it is open, not deleted, has no project, is not scheduled, and no task above it (its parent, that parent's parent and so on) has a project or is scheduled: a subtask is part of its parent's plan and follows it out of the Inbox. Whether such a parent is open, completed or deleted SHALL NOT matter; a parent the device or server does not know ends the check. An Inbox task belongs to the Inbox of its workspace: the workspace its `workspace_id` names, or the default workspace when the field is absent. A task SHALL be scheduled when it has a do-on date (`due`), a start date (`start` set to a date) or is parked in Someday (`start` set to `someday`). A deadline, a reminder, a repeat rule without a do-on date, a label or an assignee SHALL NOT make a task scheduled. Membership SHALL be computed on every device from the task's own fields, with no operation written, so it works offline and changes exactly when those fields converge. Every place that lists or counts the Inbox (the Inbox view and its counts, the Process control and the triage queue, the weekly review, the Daily check, the Open Loops pulse, the command-line client, the assistant tools and resources) SHALL use this one rule. Every workspace SHALL have an Inbox that always exists and SHALL not be deletable or renamable. The Inbox view, its counts and the process flow SHALL show the current workspace's Inbox only.

#### Scenario: Task without project
- **WHEN** a task is created outside any project view or its project is cleared
- **THEN** it is listed in the Inbox of the current workspace, carrying that workspace's id

#### Scenario: Subtask of a scheduled parent
- **WHEN** a task without a project has a do-on date and two subtasks without a project or any date
- **THEN** neither the task nor its subtasks are in the Inbox or its count, and when the parent's date is removed all three are back in the Inbox

#### Scenario: Scheduling takes a task out of the Inbox
- **WHEN** an Inbox task without a project is given the do-on date Friday
- **THEN** it leaves the Inbox and its count on every device once the date syncs, it is listed in Upcoming under Friday, and no other field is written

#### Scenario: Clearing the date brings it back
- **WHEN** the user removes the do-on date of a task without a project and without a start
- **THEN** the task is listed in the Inbox again, at its manual position

#### Scenario: A deadline alone does not schedule
- **WHEN** a task without a project has only the deadline 2026-11-06
- **THEN** it stays in the Inbox, and it also appears in Today and Upcoming as the deadlines capability defines

#### Scenario: Concurrent edits converge
- **WHEN** device A gives an Inbox task the start next Monday while device B, offline, moves it into "Home", and both sync
- **THEN** every device shows the task in "Home" starting next Monday and not in the Inbox, because membership follows the converged fields

#### Scenario: Someday is a decision
- **WHEN** the user parks a task without a project in Someday
- **THEN** it leaves the Inbox and is listed in the Someday view

#### Scenario: Project cleared keeps the workspace
- **WHEN** a task in "Website" of "Work" has its project cleared from a device in Work
- **THEN** it is listed in Work's Inbox, not in the default workspace's

#### Scenario: Two Inboxes stay apart
- **WHEN** "Personal" has 3 Inbox tasks and "Work" has 5
- **THEN** the sidebar in Personal reads "Inbox 3", the switcher lists "Work · Inbox 5", and neither view lists the other's tasks

### Requirement: Rename and recolour
The user SHALL be able to rename a project and choose its colour from a palette.

#### Scenario: Rename
- **WHEN** the user edits the project title and confirms
- **THEN** the new name is shown everywhere the project is referenced, including task rows in other views

### Requirement: Archive a project
Archiving SHALL hide a project from the sidebar without deleting it or its tasks. Its tasks SHALL keep their project reference. Archiving a project SHALL also archive every descendant project, recorded as one archive operation per project so the result converges on every device. Unarchiving a project SHALL unarchive it alone; its descendants SHALL stay archived until unarchived individually. Archiving works offline.

#### Scenario: Archive
- **WHEN** the user archives a project
- **THEN** the project leaves the sidebar, the view returns to the Inbox, and the project's tasks are no longer shown in open views

#### Scenario: Archive cascades to sub-projects
- **WHEN** the user archives a project that has two sub-projects, one of which has its own sub-project
- **THEN** all four projects are archived and leave the sidebar together

#### Scenario: Concurrent archive and move
- **WHEN** device A archives a parent offline while device B moves one of its sub-projects to the top level offline, and both sync
- **THEN** every device shows the moved project archived at the top level if A's archive operation for it is newer, and unarchived at the top level otherwise, with identical results on all devices

### Requirement: Delete a project
Deleting a project SHALL soft-delete it. Its tasks SHALL keep their project reference and stay hidden from every view except the Trash until the project is restored. Its direct sub-projects SHALL move to the deleted project's parent, or to the top level when it had none. No task or project is lost. Deletion works offline and converges on every device.

#### Scenario: Delete with open tasks
- **WHEN** the user confirms deletion of a project with three open tasks
- **THEN** the project and its tasks disappear from Inbox, Today, Upcoming, project views and counts, the project is listed in the Trash, and the three tasks are not shown in the Inbox

#### Scenario: Delete with sub-projects
- **WHEN** the user confirms deletion of a sub-project "Garden" (under "Home") that has sub-projects "Lawn" and "Beds"
- **THEN** "Garden" is listed in the Trash and "Lawn" and "Beds" appear under "Home"

#### Scenario: Restore brings the tasks back
- **WHEN** the user restores the project from the Trash
- **THEN** the project and its three open tasks are visible again exactly as before deletion

### Requirement: Open task counts
The sidebar SHALL show the number of Inbox tasks (OpenSpec `project-organization`, "Inbox is the default container") and of open tasks for Today at all times, and for each project while its row is hovered or focused; on a coarse pointer, where there is no hover, a project's count SHALL be visible at all times. A project row's accessible name SHALL always carry its count ("Website launch, 5 open tasks"), so the number is read whether or not it is visible, and revealing it SHALL not change the row's height or move its label. For a collapsed project the count SHALL include the open tasks of all its non-archived, non-deleted descendants; for an expanded project it SHALL count only the project's own tasks. Counts SHALL be computed from local data so they are correct offline, and SHALL follow changes from other devices after sync; nothing is written for them.

#### Scenario: Counts update live
- **WHEN** a task in a project is completed
- **THEN** that project's count decreases without a page reload

#### Scenario: Rolled-up count when collapsed
- **WHEN** "Home" has 2 open tasks and its sub-project "Garden" has 3, and "Home" is collapsed
- **THEN** the sidebar shows 5 next to "Home"; expanding it shows 2 next to "Home" and 3 next to "Garden"

#### Scenario: Nothing visible at rest
- **WHEN** no project row is hovered or focused on a desktop with a mouse
- **THEN** no project row shows a number, and a screen reader moving down the tree still reads each project's count

#### Scenario: Touch screen
- **WHEN** the sidebar is shown on a tablet without a mouse
- **THEN** every project with open tasks shows its count at all times, as before this change

#### Scenario: Inbox count follows scheduling
- **WHEN** the Inbox count reads 5 and the user schedules one of its tasks for tomorrow
- **THEN** the count reads 4 at once, offline too, and the tab bar on a phone shows the same number

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

### Requirement: Deep nesting on narrow screens
Deeply nested levels SHALL stay readable on a 360 px wide screen by capping the visual indentation while keeping the nesting order, and a row's tooltip SHALL show its full path.

#### Scenario: Full path on hover
- **WHEN** the user hovers or focuses "Q4 launch" at the capped indentation
- **THEN** a tooltip reads "Work › Client A › Q4 launch"

### Requirement: Collapse and expand
Each project with sub-projects SHALL be collapsible in the sidebar. Collapse state SHALL be a per-device preference that persists across reloads and is not synced. On a device that has never stored a collapse state, every project with sub-projects SHALL start collapsed. It SHALL be toggled by pointer and by keyboard (Left collapses, Right expands, when a project row is focused), and the Projects header menu SHALL offer "Collapse all" and "Expand all". Navigating to a sub-project SHALL expand its ancestors so the current project is visible.

#### Scenario: Collapse persists locally
- **WHEN** the user collapses "Work" and reloads the app
- **THEN** "Work" is still collapsed on that device and remains expanded on other devices

#### Scenario: Keyboard toggle
- **WHEN** a project row with sub-projects has focus and the user presses Left, then Right
- **THEN** its sub-projects are hidden and then shown again

#### Scenario: Roots only on a new device
- **WHEN** the user signs in on a device for the first time with thirty projects in eleven top-level projects
- **THEN** the sidebar lists the eleven top-level projects, those with sub-projects collapsed with their subtree open-task counts, and a device that already stored a collapse state keeps it

#### Scenario: Collapse all
- **WHEN** the user chooses "Collapse all" from the Projects header menu while "Work" and "Home" are expanded
- **THEN** every project with sub-projects is collapsed on this device, "Expand all" opens them all again, and other devices are unaffected

#### Scenario: Navigation still reveals
- **WHEN** everything is collapsed and the user opens "Designer" from the command palette
- **THEN** "Work" and "Hiring" expand so "Designer" is visible and selected, and the other roots stay collapsed

### Requirement: Move a project
The user SHALL be able to move a project under another project or to the top level from the project header's "Move to" action, reachable by keyboard. The picker SHALL be searchable by name, show each candidate's parent path, and SHALL exclude the project itself, its descendants and archived or deleted projects. A move SHALL set the parent field, place the project last among its new siblings, and SHALL apply locally at once, work offline, and converge on other devices through the operation log.

#### Scenario: Move under another project
- **WHEN** the user opens "Move to" on "Q4 launch" and picks "Marketing"
- **THEN** "Q4 launch" appears as the last sub-project of "Marketing" and its tasks keep their project reference

#### Scenario: Descendants are not offered
- **WHEN** the user opens "Move to" on "Work", which contains "Client A"
- **THEN** "Client A" and "Work" are absent from the list of possible parents and "Top level" is offered

#### Scenario: Search the picker
- **WHEN** the user opens "Move to" on "Q4 launch" and types "mark"
- **THEN** only matching candidates are listed, each with its parent path such as "Work › Marketing", and Enter on the first one moves the project there

#### Scenario: Move offline
- **WHEN** the device is offline and the user moves a project
- **THEN** the sidebar reflects the move immediately and the move is uploaded when the network returns

### Requirement: Cycle prevention
The system SHALL never present a project as its own ancestor. The client SHALL refuse a move whose target is the project itself or one of its descendants. The REST API SHALL reject such a patch. When concurrent moves on different devices nevertheless form a cycle after sync, every device SHALL break the cycle identically: the member whose parent field carries the newest last-writer-wins clock is displayed as a top-level project, no automatic operation is written, and the user may move it again.

#### Scenario: API rejects a cycle
- **WHEN** an authenticated client patches project "Work" with `parent_id` equal to its descendant "Client A"
- **THEN** the response is 400 with code `invalid_input` and the project's parent is unchanged

#### Scenario: API requires authentication
- **WHEN** a request without credentials patches a project's `parent_id`
- **THEN** the response is 401 `unauthorized` and nothing changes

#### Scenario: Concurrent moves form a cycle
- **WHEN** device A moves "X" under "Y" offline while device B moves "Y" under "X" offline, and both sync
- **THEN** both devices show the project whose parent change has the newer clock at the top level and the other nested beneath it, both projects and all their tasks remain reachable, and no device shows a project nested inside itself

### Requirement: Sub-projects inside a project view
A project's view SHALL show a collapsible "Sub-projects" group at the top of its list, using the shared group header, naming each direct non-archived sub-project with its rolled-up open count, each opening that sub-project; the group SHALL be hidden when the project has no sub-projects. The project's own open tasks follow. Quick add in a project view SHALL add to that project only, not to its sub-projects.

#### Scenario: Sub-project list
- **WHEN** the user opens "Home", which has sub-projects "Garden" (3 open tasks, with a sub-project holding 1) and "Kitchen" (0)
- **THEN** above Home's tasks a "Sub-projects" group lists "Garden 4" and "Kitchen 0", and it stays collapsed on this device once collapsed

#### Scenario: Quick add stays in the parent
- **WHEN** the user quick-adds a task while viewing "Home"
- **THEN** the task belongs to "Home" and is not shown inside "Garden"

### Requirement: Archived projects list
The app SHALL list every archived, non-deleted project in the Archived tab of the All projects page, whose label carries their count, sorted by name, each with its parent project's name when it is a sub-project and its open task count; Settings → Data SHALL link to it. Selecting the tab SHALL set the address fragment to `#archived`, and opening the page with that fragment, or changing to it while the page is open, SHALL select the tab. The list SHALL be rendered from local data, so it is correct offline, and SHALL reflect archives and restores from other devices after sync without a reload.

#### Scenario: Listed with context
- **WHEN** "Garden" (a sub-project of "Home" with one open task) and "Trip 2026" are archived
- **THEN** the All projects page's Archived tab reads "2" and, selected, lists "Garden", "In Home · 1 open task", and "Trip 2026", "0 open tasks", in that order

#### Scenario: Nothing archived
- **WHEN** the user has no archived projects
- **THEN** the Archived tab reads "0" and, selected, says there are no archived projects

#### Scenario: Reached from Settings
- **WHEN** the user opens Settings → Data and activates the archived projects link
- **THEN** the All projects page opens with the Archived tab selected

### Requirement: Restore an archived project
Each listed project SHALL have a keyboard-reachable Restore action that sets its existing `archived` field to false through the operation log, restoring that project alone. Restoring SHALL apply locally at once, work offline, and converge on every device under per-field last-writer-wins. This device SHALL not archive a restored project automatically again. Restore SHALL be unavailable when the user's role cannot archive the project.

#### Scenario: Restore from the list
- **WHEN** the user opens Settings → Projects, where "Trip 2026" is listed under Archived projects, and activates its Restore button
- **THEN** "Trip 2026" leaves the list and appears in the sidebar with its tasks, and other devices show it restored after sync

#### Scenario: Restore offline
- **WHEN** the device is offline and the user restores "Trip 2026"
- **THEN** the project appears in the sidebar immediately and the change is uploaded when the network returns

#### Scenario: Concurrent restore and archive
- **WHEN** device A restores "Trip 2026" offline while device B archives it again offline, and both sync
- **THEN** every device shows the result of the newer of the two operations, identically

#### Scenario: Sub-projects stay archived
- **WHEN** the user restores "Home", which was archived together with its sub-project "Garden"
- **THEN** "Home" returns to the sidebar and "Garden" stays listed under Archived projects

#### Scenario: Not archived again automatically
- **WHEN** the user restores a project that has had no open task for 30 days and automatic archiving is on for this device
- **THEN** the next automatic archive pass on this device leaves it in the sidebar

#### Scenario: Role cannot archive
- **WHEN** the user is an editor of a shared, archived project
- **THEN** the project is listed but its Restore action is unavailable, with a note that only the owner or an admin can restore it

### Requirement: Project icon
A project MAY carry an icon from the icon catalogue (`design-system` "Icon catalogue"), stored as an additive `icon` field on the project and changed as an ordinary project operation (applied locally first, converging by last-writer-wins). The project menu SHALL open the searchable icon picker, with "No icon" first. The sidebar, the page header and the project chip SHALL show the icon in the project's colour; without one, or with a name the device does not know, they show a coloured dot.

#### Scenario: Pick an icon offline
- **WHEN** the device is offline and the user picks the "briefcase" icon for "Work" from the project menu
- **THEN** the sidebar shows it at once, and other devices show it after sync

#### Scenario: Pick from the whole catalogue
- **WHEN** the user opens the icon picker of "Garden", types "plant" and picks the sprout icon
- **THEN** the project shows the sprout icon in the sidebar, the header and its chips, on this device at once and on other devices after sync

#### Scenario: Concurrent icon changes
- **WHEN** two devices set different icons for the same project while offline and both sync
- **THEN** every device shows the icon written with the greater timestamp

#### Scenario: Clients that know no icon
- **WHEN** an older client or the CLI reads a project with an icon
- **THEN** the field is ignored and the project renders with its dot as before

### Requirement: Pin a project
Every project menu (the sidebar row, the project header, the All projects page) SHALL offer a checkable "Pin to sidebar" that adds the project to, or removes it from, the user's favourites. The project SHALL stay in the Projects tree either way. Pinning SHALL be a change to the user's own preference, never to the project, so members of a shared project do not see each other's pins.

#### Scenario: Pin from the header
- **WHEN** the user opens a project's header menu and checks "Pin to sidebar"
- **THEN** the project appears in the Favourites group with its count, the item reads as checked in every menu of that project, and the project is still listed in the tree

#### Scenario: Shared project pinned by one member
- **WHEN** Ada pins a project shared with Bob
- **THEN** Bob's sidebar is unchanged and no project operation is written

### Requirement: All projects page
The app SHALL offer an All projects page at `/projects`, reachable with `g Shift+P`, from the palette and from an "All" action on the Projects header, using the page template: Active and Archived tabs with their counts, a find field that narrows the tree keeping ancestors, New project and From a template as actions, and the projects as a table. The table SHALL keep the project tree (sub-projects indented under their parent, fold and unfold, Collapse all and Expand all in the page menu) and SHALL show for each project its name with icon and colour, its health (statistics "Project health") with its detail, its progress as a ring and a percentage, its open task count, its next due date in the danger colour when it is before today, the members of a shared project as avatars (up to three, then "+n"), when it last changed, and its menu; a click anywhere on a row SHALL open the project. A row's figures SHALL follow the sidebar's rule: a folded row includes its live, unarchived sub-projects, an expanded row only its own tasks. A note under the table SHALL say that health is worked out on the device. Every column but People SHALL sort by its header among siblings, so the tree stays a tree: the first activation in the column's natural direction (health from the most urgent, last change from the newest, the others ascending), the second reversed, the third back to the user's own order, with missing values last in both directions and the sorted column marked for assistive technology; the sort lasts while the page is open. The rows SHALL be reachable by keyboard: Up and Down (and `j`, `k`), Home and End move between rows, Left folds a row or moves to its parent, Right unfolds it, Enter opens the project, and Down from the find field enters the table. The table SHALL drop columns from its end as it narrows (Updated under 68 rem, People under 60 rem, Progress under 52 rem, Next due under 44 rem, Open and the health detail under 36 rem), so a phone shows the name and the health word without scrolling sideways. The page SHALL render from local data, work offline, and update live after sync.

#### Scenario: Find a project
- **WHEN** the user presses `g Shift+P` and types "des"
- **THEN** the page shows "Work › Hiring › Designer" and "Website launch › Design" with their ancestors and no other project, and Enter on the first opens it

#### Scenario: Every project is one click away
- **WHEN** the user's sidebar shows only Favourites and a collapsed Projects group
- **THEN** the "All" action on the Projects header opens the page listing all thirty projects

#### Scenario: Offline
- **WHEN** the device is offline
- **THEN** the page lists the projects with their health, progress, counts and dates, the archived projects, and the find field works

#### Scenario: A table that says where to look
- **WHEN** "Home renovation" has a task due two days ago, "Personal admin" has an open task "passport" whose deadline passed, "Reading" has had no change for nine days, and "Work" has one task completed and one open due next week
- **THEN** the table reads "Slipping · 1 late" for Home renovation with its next due date in the danger colour, "Late · passport" for Personal admin, "Quiet · 9 days" for Reading, and "On track" with "50%" for Work

#### Scenario: Sort by health
- **WHEN** the user activates the Health header, then again, then a third time
- **THEN** the projects are ordered from Late to On track with projects that have nothing open last, then reversed with those projects still last, then back in the user's own order, and sub-projects stay under their parent each time

#### Scenario: Keyboard through the table
- **WHEN** focus is on "Home", which has the sub-project "Garden", and the user presses `j`, Left, Left, Right and Enter
- **THEN** focus moves to Garden, back to Home, Home folds and hides Garden, unfolds again, and Home opens

#### Scenario: Folded row sums its sub-projects
- **WHEN** "Home" has 2 open tasks and "Garden" under it has 3, one of them due yesterday
- **THEN** expanded, Home reads 2 open and On track and Garden reads 3 and Slipping; folded, Home reads 5 and Slipping

#### Scenario: Phone width
- **WHEN** the page is opened at 360 px wide
- **THEN** each row shows the project's name and its health word, no column is cut and the page does not scroll sideways

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
