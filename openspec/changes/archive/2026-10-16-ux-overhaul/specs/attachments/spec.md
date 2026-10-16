# Spec Delta

## MODIFIED Requirements

### Requirement: Attachments in the task detail
The task detail SHALL offer Attach in its header menu and in the Add menu (file picker or link), accept paste and drag-and-drop anywhere on the panel, and SHALL show an Attachments list only when the task has attachments, each with name, type, size, state (uploading, available, waiting, missing) and, for images, a thumbnail, with actions to open, download, rename and remove. The drop zone SHALL appear while a file is dragged over the panel, not at rest. Task rows SHALL show a paperclip with the count. Everything SHALL be keyboard reachable and render from local data; opening a file needs a connection unless the bytes are on the device.

#### Scenario: Keyboard add and open
- **WHEN** the user opens the Add menu, activates Attach file, picks a file and later activates the file
- **THEN** the attachment is created and queued, and the available file opens in a new tab or is downloaded, without a mouse

#### Scenario: Paste a screenshot
- **WHEN** the user pastes an image from the clipboard while the task detail has focus
- **THEN** an attachment named with the date and `.png` is created

#### Scenario: Offline open
- **WHEN** the device is offline and the user activates an attachment whose bytes are not on the device
- **THEN** the row states that a connection is needed and nothing else changes

#### Scenario: Count on rows
- **WHEN** a task has two attachments
- **THEN** its row shows a paperclip with the number two

#### Scenario: No attachments at rest
- **WHEN** a task without attachments is opened
- **THEN** no Attachments heading, buttons or drop hint are rendered, and dragging a file over the panel shows the drop zone
