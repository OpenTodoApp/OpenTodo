## ADDED Requirements

### Requirement: Drops across project groups in a view
In the List layout of a saved view or label page grouped by Project, a drop of a task into another project's group SHALL move the task, with its subtasks, to that project without a section and SHALL place it in the view's own order at the drop position, in one undoable batch named "Moved to <project>". With Nest subtasks on, a drop onto a task SHALL make the dragged task that task's last subtask, in the target's project. A drop target in a project the person may not edit SHALL show no drop line and refuse the drop. Other groupings and layouts SHALL keep drops within a group.

#### Scenario: Move by dropping into another group
- **WHEN** a view "This week" grouped by Project shows "Buy paint" under Home and the user drops it between two rows of the Work group
- **THEN** "Buy paint" moves to Work, appears between those two rows, and Undo puts it back in Home at its old place

#### Scenario: Nest onto a task
- **WHEN** Nest subtasks is on and the user drops "Book flights" onto "Trip to Lisbon" in another project's group
- **THEN** "Book flights" moves to that project as the last subtask of "Trip to Lisbon"

#### Scenario: Viewer's project
- **WHEN** the user drags a task over the group of a project shared with them as a viewer
- **THEN** no drop line shows there and releasing changes nothing

#### Scenario: Grouped by label
- **WHEN** a view is grouped by Label
- **THEN** a drop stays within the row's group, as before
