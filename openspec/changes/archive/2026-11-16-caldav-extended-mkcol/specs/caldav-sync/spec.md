## MODIFIED Requirements

### Requirement: Calendar management
MKCALENDAR SHALL create a project with the given display name and colour; an extended MKCOL (RFC 5689) whose resource type is a calendar SHALL do the same, by the same rules, and any other MKCOL SHALL be refused with 403 (`DAV:valid-resourcetype`); PROPPATCH of display name or colour SHALL rename or recolour the project (admin or owner role); DELETE of a project calendar SHALL soft-delete the project and move its open tasks to the Inbox (owner role; as copies for a shared project); the Inbox calendar SHALL refuse deletion and renaming. All of these SHALL be recorded as operations.

#### Scenario: Create a list from a client
- **WHEN** a client creates a new calendar named "Garden"
- **THEN** a project "Garden" appears in the sidebar of every device after sync

#### Scenario: Create a list with extended MKCOL
- **WHEN** iOS Reminders creates a new list "Garden" with an extended MKCOL whose resource type is a calendar
- **THEN** the response is 201 and a project "Garden" appears, exactly as with MKCALENDAR

#### Scenario: A collection that is not a calendar
- **WHEN** a client sends MKCOL without a body, or for a resource type other than a calendar
- **THEN** the response is 403 with the `DAV:valid-resourcetype` precondition and nothing changes

#### Scenario: Inbox is protected
- **WHEN** a client attempts to delete or rename the Inbox calendar
- **THEN** the response is 403 and nothing changes
