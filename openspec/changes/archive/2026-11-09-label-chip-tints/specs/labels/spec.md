## MODIFIED Requirements

### Requirement: Assign and unassign labels
A task's `labels` array SHALL hold label ids. The user SHALL add and remove labels from the task detail panel and from a picker opened with `L` on a selected task, with type-ahead that can create a missing label. A shared label chip SHALL show the label name with a soft fill in the label hue and no separate colour dot. Editable chips SHALL keep the labelled remove control. In task rows, labels SHALL follow the order, overflow and accessible name behaviour of the active layout in task-list-presentation and row-layouts, omitting the label whose own view is open. Ids referring to deleted or not yet received labels SHALL be kept in the data but not displayed. Changes apply locally at once and work offline. After sync, devices render their shared label data through the active theme.

#### Scenario: Assign from the picker
- **WHEN** the user presses `L` on a selected task, types "err" and presses Enter
- **THEN** label "errand" is attached, its chip shows on the row immediately, and the picker stays open for further labels

#### Scenario: Create while assigning
- **WHEN** the user types a name that matches no label in the picker and presses Enter
- **THEN** a label with that name is created and attached in one step

#### Scenario: Unknown id is hidden, not dropped
- **WHEN** a task arrives with a label id this device has not received yet
- **THEN** no chip is shown for it, the id stays in the task's array, and the chip appears once the label arrives

#### Scenario: Second label in Calm rows
- **WHEN** a One line row already carries "errand" and the user adds "call" from the picker
- **THEN** the row shows tinted chips for "errand" and "call" at once, and a screen reader hears "Labels: errand, call"

#### Scenario: Removing a label from a task
- **WHEN** an editable chip shows the "errand" label in the task detail panel
- **THEN** it shows the label name on a soft fill in its hue, and its remove button keeps the accessible name "Remove label errand"
