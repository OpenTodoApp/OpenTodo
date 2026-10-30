# Spec Delta

## ADDED Requirements

### Requirement: Start focus from a task's menu
When the task Actions menu targets exactly one open task the user can edit, it SHALL offer "Start focus", in the same group as Start tracking. This applies however the menu is opened: `.`, the row's More button, a right-click, a touch hold on a fine pointer, or the selection bar with one task ticked. The item starts focus as `focus-mode` "Visible ways into Focus" describes. It SHALL NOT be offered for several tasks, a completed or trashed task, or a viewer's task. The command palette SHALL list it for the selected task.

#### Scenario: From the keyboard
- **WHEN** the cursor is on "Write the report" and the user presses `.` and chooses "Start focus"
- **THEN** the Focus screen opens on "Write the report" with a session running

#### Scenario: Several tasks
- **WHEN** three rows are ticked and the user opens the Actions menu
- **THEN** "Start focus" is not listed

#### Scenario: From the palette
- **WHEN** a task is selected and the user types "focus" in Search and commands
- **THEN** "Start focus" is listed for that task and choosing it does the same as the menu item
