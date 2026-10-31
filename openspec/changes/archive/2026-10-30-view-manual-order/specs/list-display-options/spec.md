## MODIFIED Requirements

### Requirement: Moving a task switches to manual order
On a project or label page shown in another order than manual ascending, dropping a dragged task among its rows, or moving it with Alt+Up, Alt+Down, Alt+Shift+Up or Alt+Shift+Down, SHALL first set the page's order to Manual order (ascending) and then apply the move as in manual order; the grouping SHALL stay. On a label page the move SHALL change the label page's own manual order (OpenSpec `manual-ordering`, "Manual order of a label page or saved view"), never the tasks' project positions. A drop on a section heading or a sidebar target SHALL leave the order unchanged.

#### Scenario: Drag under a priority order
- **WHEN** a project is ordered by priority and the user drags "Buy bulbs" below "Call plumber"
- **THEN** the project's order becomes Manual order and "Buy bulbs" is placed after "Call plumber" in the manual order

#### Scenario: Keyboard move under a title order
- **WHEN** a project is ordered by title and the user presses Alt+Down on its first task
- **THEN** the order becomes Manual order and the task moves one place down in it

#### Scenario: Label page under a deadline order
- **WHEN** the label page "errand" is ordered by deadline and the user presses Alt+Up on its second task
- **THEN** the label page's order becomes Manual order, the task is first on the page, and its project is unchanged
