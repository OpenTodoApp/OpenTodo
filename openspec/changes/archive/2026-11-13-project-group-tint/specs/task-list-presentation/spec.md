## ADDED Requirements

### Requirement: Project group headers take the project's colour
Wherever tasks are grouped by project (Today, a label page, a saved view's list and board), a project's group header SHALL be tinted with the project's colour, as a coloured section's header is (the same tint and the same text tones), and the Inbox's header SHALL stay neutral. The rows SHALL keep their surface, and rows in a project group keep leaving out the project they share.

#### Scenario: A saved view grouped by project
- **WHEN** a saved view grouped by project shows a task of the green project Garden and a task of the Inbox
- **THEN** Garden's header is tinted green and the Inbox's header is the plain bar
