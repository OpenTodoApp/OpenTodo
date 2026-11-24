# Spec Delta

## ADDED Requirements

### Requirement: Add task in the sidebar
From 768 px, the sidebar SHALL show an "Add task" item in the Tasks space, under the workspace row and the space switch and above the primary destinations, in the row's quiet tone with the phone add button's mark (a plus on the accent). With "Show shortcut hints" on, it SHALL print the quick add key (`q`) at its end; its tooltip SHALL name the key in every case, and it SHALL be a button named "Add task" that announces the key. In the icon rail it SHALL show the mark alone, its name in the tooltip. Activating it SHALL do exactly what the quick add key does on that screen outside a text field: on a list screen with a quick add, focus that quick add, whose task takes the view's defaults (the project of a project, today in Today, tomorrow in Upcoming, the label of a label, the location of a location, parked in Someday, assigned to the user in Assigned to me); elsewhere, open the command bar in Add mode, which takes the defaults of "Add mode". It SHALL NOT be shown in the phone drawer, where the add button is, nor in the Notes space. Adding works offline through the same local operation as every quick add.

#### Scenario: Today
- **WHEN** the user is in Today and clicks Add task
- **THEN** the list's quick add has focus, and a task typed there and added is due today

#### Scenario: A project
- **WHEN** the user is in the project Work and clicks Add task, types `Draft agenda` and presses Enter
- **THEN** the task is added to Work

#### Scenario: A screen without a quick add
- **WHEN** the user is in Trash and clicks Add task
- **THEN** the command bar opens in Add mode with its field focused, and a task added there goes to the Inbox

#### Scenario: Keyboard
- **WHEN** the user tabs to Add task and presses Enter
- **THEN** the same happens as on a click, and the button is announced as "Add task" with the key `q`

#### Scenario: Phone
- **WHEN** the screen is narrower than 768 px and the user opens the menu
- **THEN** the drawer has no Add task item and the floating add button stays the way to add
