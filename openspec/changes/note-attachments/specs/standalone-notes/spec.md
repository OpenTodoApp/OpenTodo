## MODIFIED Requirements

### Requirement: Writing a standalone note
The user SHALL create a note from the Notes page (New note) and edit it in the docked panel on a computer and as a page on a phone, with a title field, the rich-text note editor, a project chosen with the project picker and labels chosen with the label picker. The editor SHALL offer every formatting command of notes except mentions and making a subtask; images SHALL be offered and embed attachments of the same note (`attachments` "Attachments on standalone notes"). An empty title SHALL read "Untitled note". The note's address SHALL be `/notes/<id>`. Edits SHALL save on the device and sync as notes do, offline included.

#### Scenario: New note from the page
- **WHEN** the user presses `q` on the Notes page, types "Meeting with the architect", presses Tab and writes a bullet list
- **THEN** the note is listed first on the page with that title and a preview of the list, on every device after sync

#### Scenario: Project and labels
- **WHEN** the user picks the project "Renovation" and the label "reference" for a note
- **THEN** the note is listed under that project and label in the page's filters, and in the project's scope

#### Scenario: Unsupported commands
- **WHEN** the user opens the slash menu in a standalone note
- **THEN** it offers no mention or make-subtask entry

#### Scenario: Paste a photo into a note
- **WHEN** the user pastes a screenshot into the standalone note "Whiteboard", offline
- **THEN** the image shows in the note at once, an attachment of the note is queued, and after sync every device shows the image once the bytes are uploaded
