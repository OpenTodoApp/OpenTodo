# Spec Delta

## ADDED Requirements

### Requirement: Pasting files into quick add
In every quick add that creates tasks except the capture screen, which lists shared files itself, a paste whose clipboard data holds one or more files or images SHALL put nothing into the title and SHALL list the files as pending files under the field, each with its name as text and a remove control named after the file, the list announced to screen readers. A paste without files SHALL behave as before: plain text, a pasted list (paste-to-tasks) and a pasted link (links in quick add) are unchanged. Adding the task SHALL write it and its pending files as attachments in one local operation set, with the same per-file limit, quota, encryption and messages as files added in the task panel, visible at once, uploaded after sync and converging like any attachment, and removed together by one Undo; a pasted list confirmed while files are pending SHALL give them to its first task. A file the server's limit or the quota refuses, and a paste while signed out, while attachments are turned off or on a demo instance, SHALL list nothing and SHALL show the reason under the field. No file type SHALL be refused or allowed beyond the attachment rules, and a file's content SHALL never be rendered. A line with pending files SHALL never reuse an item of a reusable list.

#### Scenario: A pasted screenshot is saved with the task
- **WHEN** the user types `Fix the header` in Today's quick add, pastes a screenshot and presses Enter
- **THEN** the field keeps `Fix the header`, a pending file named after the paste is listed under it before saving, and the task "Fix the header" is created with that file as its attachment

#### Scenario: Removed before saving
- **WHEN** the user pastes a file, activates its remove control and adds the task
- **THEN** the task is created without an attachment

#### Scenario: Text paste is unchanged
- **WHEN** the user pastes the text `Call Anna` into quick add
- **THEN** the field reads `Call Anna` and no pending file is listed

#### Scenario: Over the limit
- **WHEN** the server allows files of at most 10 MB and the user pastes a 12 MB file
- **THEN** no pending file is listed and the field shows that the file is 12 MB and files may be at most 10 MB on this server

#### Scenario: Offline
- **WHEN** the device is offline and the user adds a task with a pasted image
- **THEN** the task and its attachment appear at once, the image waits on the device, and it uploads after the next successful sync
