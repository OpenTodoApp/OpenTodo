# Spec Delta

## MODIFIED Requirements

### Requirement: Priority is never colour alone
A row of an open task with priority 1, 2 or 3 SHALL show a priority mark in the priority's colour and with a distinct shape per level: three bars for priority 1, two for priority 2, one for priority 3, drawn with the icon set; priority 4, the default, has none. On a one-line row the mark SHALL follow the title and be read as "Priority n"; on a detailed row it SHALL be followed by the text "P1", "P2" or "P3". The circle of an open priority-1 or priority-2 task SHALL have a border and fill in its priority colour. Priority 1 is filled more strongly than priority 2 so the levels differ in lightness as well as hue. An open priority-3 task SHALL have a blue outline using its priority colour and an empty centre at rest, including in the task panel. An open priority-4 row SHALL keep its neutral, empty circle. A completed task's circle SHALL keep its filled check without the priority fill.

#### Scenario: One-line row
- **WHEN** a list shows a priority-1 task and a priority-4 task on one-line rows
- **THEN** the first row shows three bars after its title, read as "Priority 1", and the second shows no mark

#### Scenario: Circles that read without colour
- **WHEN** a list shows a priority-1, a priority-2, a priority-3 and a priority-4 task and is seen through a deuteranopia or protanopia simulation, in light or dark
- **THEN** the priority-1 circle is a darker disc than the priority-2 circle, and the priority-3 and priority-4 circles are empty rings

#### Scenario: A low-priority task
- **WHEN** a priority-3 task is open in a list or in the task panel
- **THEN** its completion circle has the priority-3 blue outline and an empty centre at rest
