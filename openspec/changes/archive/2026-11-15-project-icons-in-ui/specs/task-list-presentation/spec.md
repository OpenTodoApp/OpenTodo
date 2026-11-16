## MODIFIED Requirements

### Requirement: Project group headers take the project's colour
When Today, a label page or a saved view's list or board is grouped by project, a project's group header SHALL be tinted with the project's colour, as a coloured section's header is (the same tint and the same text tones), and the Inbox's header SHALL stay neutral. The rows SHALL keep their surface, and rows in a project group keep leaving out the project they share.

The header SHALL show the configured project icon beside its name when that icon can be rendered. The icon is decorative. A project with no available icon and the Inbox SHALL have no project marker in the header.

#### Scenario: A saved view grouped by project
- **WHEN** a saved view grouped by project shows a task of the green project Garden and a task of the Inbox
- **THEN** Garden's header is tinted green and the Inbox's header is the plain bar

#### Scenario: A project group header shows its configured icon
- **WHEN** a grouped list or board displays a project with a renderable icon
- **THEN** the header displays that icon alongside the project name and preserves its tint and accessible name

#### Scenario: A group has no available project icon
- **WHEN** a grouped list or board displays the Inbox or a project without a renderable icon
- **THEN** its header displays neither a project icon nor a colour dot
