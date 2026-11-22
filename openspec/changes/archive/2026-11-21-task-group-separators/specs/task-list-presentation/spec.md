## ADDED Requirements

### Requirement: Separators between task groups

The main on-screen task lists in built-in views, projects, labels, and saved and ad hoc filters SHALL draw a decorative hairline in the theme's soft border colour between adjacent visible top-level task groups in One line and Detailed. Within each list section, a top-level task and its visible descendants SHALL form one group. The first group in a section, rows within a group, and rows on phones or in narrow panes SHALL have no separator. The hairline SHALL follow the actual task row width, add no space or focus target, and require no user setting.

#### Scenario: Adjacent tasks in a wide list
- **WHEN** a wide list section shows two top-level tasks in One line or Detailed
- **THEN** one hairline separates the two tasks and the section has no leading or trailing hairline

#### Scenario: An expanded parent and its descendants
- **WHEN** a top-level task shows its nested descendants before the next top-level task in the same section
- **THEN** one hairline appears after the last visible descendant and before the next top-level task, with no line between the parent and its descendants or between siblings

#### Scenario: A list changes while it is open
- **WHEN** the visible order changes because a user collapses a parent, changes a filter, or moves a task
- **THEN** the hairlines follow the current groups and the first task group of each visible section has no leading line

#### Scenario: A narrow pane on a wide screen
- **WHEN** the task details panel leaves less than 40 rem for a row, or the viewport uses the phone layout
- **THEN** no hairlines appear, regardless of the chosen row layout
