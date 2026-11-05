## ADDED Requirements

### Requirement: Make a rule from a section
A section's menu, on a list heading and on a board column, SHALL offer "Make an automation rule" (OpenSpec `automation-rules`) to the roles that get the section menu, while rules can be made on the server ("Where rules can be made"). Choosing it SHALL open the routine editor on a new, unsaved routine named after the section, with the trigger "a task is moved into" that section's project and that section, no condition and no action. The section and its tasks SHALL be unchanged until the user saves; saving writes the rule as operations and works offline like any rule. "No section" SHALL offer no such item.

#### Scenario: A column's behaviour from the column
- **WHEN** the user opens the menu of the "Doing" column on the "Work" board and chooses "Make an automation rule"
- **THEN** the routine editor opens with the name "Doing" and the trigger "a task is moved into Work › Doing", and after the user adds the action "add the label doing" and saves, the rule is listed on the Routines page

#### Scenario: Automations off
- **WHEN** the server owner has turned automations off and a user opens a section's menu
- **THEN** the menu has no "Make an automation rule" item

#### Scenario: Viewer
- **WHEN** a viewer of a shared project opens a board column's menu
- **THEN** the menu offers only Fold column
