## MODIFIED Requirements

### Requirement: Readable field changes
Expanding a version SHALL show each field change with the old value struck through and the new value emphasised, formatted the way the panel shows them for due dates, priorities, labels, projects, sections, parents and assignees. Changes that lost under last-writer-wins SHALL be marked "not applied" and remain restorable.

#### Scenario: Readable values
- **WHEN** the user expands a version that changed priority from 4 to 1 and the project from Inbox to "Work"
- **THEN** the changes read "Priority None → P1" and "Project Inbox → Work", not raw numbers or ids

#### Scenario: Lost change
- **WHEN** a version contains a change that lost under last-writer-wins
- **THEN** that change is shown muted with the label "not applied" and still offers "Restore this value", so the lost value can be recovered
