# Spec Delta

## ADDED Requirements

### Requirement: Paste several subtasks
Pasting text with at least two non-empty lines into an empty "Add subtask" field SHALL offer "Add N subtasks" and "Paste as one line", with the same line cleanup, preview, Escape behaviour and limit of 100 lines as a paste into quick add (`natural-language-capture`). Confirming SHALL create one subtask per line under the task, in the pasted order, each inheriting the parent's project with priority 4 and no due date, without parsing the line. The subtasks SHALL be written as one batch applied locally first, so they appear at once offline, upload together and converge like subtasks added one by one, and one Undo SHALL remove them all. The field SHALL keep the focus afterwards.

#### Scenario: Paste a packing list
- **WHEN** the user pastes "1. Passport\n2. Charger\n3. Tickets" into the Add subtask field of "Plan trip" and confirms
- **THEN** "Passport", "Charger" and "Tickets" appear in that order under "Plan trip", the parent's progress counts three open subtasks, and the field stays focused

#### Scenario: Subtask lines are not parsed
- **WHEN** the user pastes "Pack tomorrow\nBook taxi p1" into the Add subtask field and confirms
- **THEN** two subtasks are created with the titles "Pack tomorrow" and "Book taxi p1", with no due date and priority 4

#### Scenario: Offline subtasks
- **WHEN** the device is offline and the user pastes and confirms three lines in the Add subtask field
- **THEN** the three subtasks are shown under the parent at once, survive a reload and upload together when the network returns
