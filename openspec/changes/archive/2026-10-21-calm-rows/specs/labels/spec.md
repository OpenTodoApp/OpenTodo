# Spec Delta

## MODIFIED Requirements

### Requirement: Assign and unassign labels
A task's `labels` array SHALL hold label ids. The user SHALL add and remove labels from the task detail panel and from a picker opened with `L` on a selected task, with type-ahead that can create a missing label. Labels SHALL appear on task rows in every view: with Detailed rows as one chip per label; with Calm rows as one row of colour dots in the task's label order followed by the first label's name and "+n" for the rest, with every name read by assistive technology and shown in a tooltip on hover and keyboard focus, except the label whose own view is open. Ids referring to deleted or not yet received labels SHALL be kept in the data but not displayed. Changes apply locally at once and work offline.

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
- **WHEN** Calm rows are on, a task already carries "errand" and the user adds "call" from the picker
- **THEN** the row shows two dots, "errand" and "+1" at once, and a screen reader hears "Labels: errand, call"
