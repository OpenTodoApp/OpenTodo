# Spec Delta

## ADDED Requirements

### Requirement: Convert a column rule into an automation rule
A board column's Rule dialog and a saved filter's action menu SHALL offer "Make an automation rule" (OpenSpec `automation-rules`), opening the rule editor with the actions set to the column's on-drop rule and the condition built from the structural terms of the filter's query (`#project`, `##project`, `@label`, `no labels`, `no project`, `p1`–`p4`, `no date`, `overdue`, `today`, `due <= today`, `blocked`, `habit`, `origin: kind`); any other term SHALL be named in the editor as not carried over. The trigger defaults to "a task is created" and the user chooses before saving. The saved filter and the board SHALL be unchanged by the conversion.

#### Scenario: Convert a quadrant
- **WHEN** the user opens Arrange on the Eisenhower board, chooses Rule on "Urgent and important" and then "Make an automation rule"
- **THEN** the rule editor opens with the actions "priority 1, due today" and the condition "priority 1, due today or overdue", and saving creates a rule without changing the column

#### Scenario: Term not carried over
- **WHEN** the filter's query is `@errand & search: "oat milk"` and the user converts it
- **THEN** the editor has the condition "label errand" and a line reading `search: "oat milk" cannot be used in a rule`
