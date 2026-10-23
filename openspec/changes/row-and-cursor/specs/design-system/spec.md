## ADDED Requirements

### Requirement: Pointer on clickable elements
With a mouse or trackpad, every element that does something when clicked SHALL show the pointing-hand cursor: enabled buttons, elements with the button, menu item, tab or option role, disclosure summaries, labels of controls, links and task rows. The rule SHALL be one base style at zero specificity, so a component can still choose another cursor that means something (grab for a draggable block, text for an editable field, not-allowed for a disabled control, progress while busy). A disabled control SHALL NOT show the hand. The interface lint SHALL fail on a component that sets the default or auto cursor without a written reason on that line or the line above.

#### Scenario: A button shows the hand
- **WHEN** the pointer rests on an enabled button, a menu item, a sidebar entry or a tab
- **THEN** the cursor is the pointing hand

#### Scenario: A task row shows the hand
- **WHEN** the pointer rests on the empty area of a task row in a list
- **THEN** the cursor is the pointing hand, and a click there opens the task

#### Scenario: Disabled and draggable keep their own cursor
- **WHEN** the pointer rests on a disabled button, or on a calendar block that can be dragged
- **THEN** the cursor is not-allowed on the button and the grab hand on the block

#### Scenario: Default cursor without a reason
- **WHEN** a change adds `cursor-default` to a button in `web/src` without a reason on that line
- **THEN** the interface lint fails naming the file and line
