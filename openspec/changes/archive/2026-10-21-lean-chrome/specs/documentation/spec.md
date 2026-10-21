# Spec Delta

## MODIFIED Requirements

### Requirement: Contextual help
Every page header, the task panel menu, the share dialog and the import screen SHALL offer a Help action that opens the matching guide section beside the current screen (a sheet on phones) without closing it or discarding what the user entered. The quick add SHALL carry no help link of its own: in a task list the page header's Help action is the one help control, it opens the view's guide section, and that section SHALL link to the quick-add guide in its first paragraph, so the syntax is one activation away from any list. The Help landing's "Add a task with a date" entry SHALL open the same guide. Nothing about help use SHALL be stored on the device or the account. The in-app guide is local, so this works offline.

#### Scenario: Help while sharing
- **WHEN** a user has typed an email in the share dialog and selects Help
- **THEN** the sharing section opens beside the dialog, and closing it returns to the dialog with the email still there

#### Scenario: Help from the board
- **WHEN** the user activates Help in a project's page header while the board is shown
- **THEN** the sections and boards guide opens in the panel slot and the board stays as it was

#### Scenario: Quick-add syntax from the Inbox
- **WHEN** a user with "Call the dentist tomorrow" typed in the Inbox's quick add activates the header's Help action and then the quick-add link in the section that opens
- **THEN** the quick-add guide is shown in the Help panel and the typed line is still in the field

#### Scenario: No help under the field
- **WHEN** a new browser opens any task list
- **THEN** no help link is rendered under the quick add, on the first add or any later one

#### Scenario: Link kept in check
- **WHEN** a list view's guide section loses its link to the quick-add guide
- **THEN** the docs check fails and names the section
