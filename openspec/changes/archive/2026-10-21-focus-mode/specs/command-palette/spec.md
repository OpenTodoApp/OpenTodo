# Spec Delta

## MODIFIED Requirements

### Requirement: Commands by name
The palette SHALL list every command the app offers by name, each with its keyboard shortcut when it has one, and only when it applies in the current context. A command SHALL run the same function as the button, key or menu item it stands for. The commands SHALL include "Go to Focus" (`g` then `Shift+F`) and, for the selected or open task, "Focus on this task" (OpenSpec change `focus-mode`).

#### Scenario: Command families
- **WHEN** the user opens the palette on any screen
- **THEN** the commands available are drawn from: going to each view, Focus, calendar, the Trash, Activity, Help and each Settings section; acting on the selected task, including focusing on it; every action-menu item of the current project, saved view or label; creating a task, project, label or dashboard; saving the current filter as a view; sync now; the keyboard shortcuts; Vim keybindings on or off; and searching Help for the typed text

#### Scenario: Navigate
- **WHEN** the user types `upco` and presses Enter on "Go to Upcoming"
- **THEN** the Upcoming view opens, exactly as `g` then `u` does

#### Scenario: Task command needs a selected task
- **WHEN** no task is selected and the user types `complete`
- **THEN** no "Complete task" command is listed, and when a task is selected the command is listed with the task's title and runs the same completion as `c`

#### Scenario: Menu action by name
- **WHEN** the user is in a saved view and types `pin`
- **THEN** "Pin to sidebar" for that view is listed and runs the same action as the view's menu item

#### Scenario: Context commands on an empty box
- **WHEN** the user opens the palette with a task selected and types nothing
- **THEN** the commands for that task and the current view are listed before recently picked entries

#### Scenario: Focus on the selected task
- **WHEN** the task "Write the report" is selected and the user types `focus`
- **THEN** "Focus on Write the report" is listed and runs the same action as the task panel's menu item, opening `/focus/<its id>`; with no task selected only "Go to Focus" is listed
