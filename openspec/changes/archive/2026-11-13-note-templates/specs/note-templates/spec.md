## ADDED Requirements

### Requirement: A note can be a template
A standalone note SHALL carry an additive boolean field `template`, default false, that is not content. **Use as template** in a standalone note's menu SHALL set it and **Stop using as template** SHALL clear it, each as one operation applied locally first, so it works offline and converges by last-writer-wins. A template SHALL otherwise be a note in every way: synced, shared through its project, encrypted on an encrypted account, edited in the same editor, moved to the Trash and restored. Viewers of a template's project SHALL be offered neither entry. A client that does not know the field SHALL keep it unchanged.

#### Scenario: Mark offline
- **WHEN** the device is offline and the user chooses Use as template on the note "Meeting"
- **THEN** the note is a template at once on this device, and on every device after sync

#### Scenario: Concurrent marking
- **WHEN** device A marks "Meeting" as a template and device B, offline, clears the mark later, and both sync
- **THEN** every device shows the value written with the greater timestamp

#### Scenario: Viewer
- **WHEN** a viewer of a shared project opens a template in it
- **THEN** the note's menu offers neither Use as template nor Stop using as template, and an operation from the viewer changing the field is refused as forbidden

### Requirement: Creating a note from a template
**From template…**, the split part of New note on the Notes page (and `Shift+Q` there), SHALL open a Combobox listing the user's templates first, by title, then the built-in note templates of the library. Choosing one SHALL create a new standalone note with the template's title, text, project and labels and its placeholders filled in, with `template` false, in one batch with one Undo, and SHALL open it with the caret at the end of its first empty line. A viewer of the template's project SHALL get the copy in their personal scope without a project. The copy SHALL keep no reference to the template: later edits of the template SHALL not change it. It SHALL work offline, with the template's decrypted copy on an encrypted account, and sync like any new note.

#### Scenario: A meeting note
- **WHEN** the user has the template "Meeting {{date}}" in the project Work with the label meeting and the text "## Attendees\n\n## Notes\n\n## Actions\n- [ ] ", and on 2026-11-12 chooses it from From template…
- **THEN** a note "Meeting 12/11/2026" (in the user's date format) is created in Work with the label meeting and that text, it opens, and the template is unchanged

#### Scenario: Offline and undo
- **WHEN** the device is offline and the user creates a note from a template and then chooses Undo
- **THEN** the note is gone, and nothing about it reaches the server on the next sync

#### Scenario: Template edited later
- **WHEN** the user creates a note from "Meeting" and then adds a heading to the template
- **THEN** the created note does not get the heading

#### Scenario: Viewer uses a template
- **WHEN** a viewer of the shared project Team creates a note from its template "Retro"
- **THEN** the copy is created in the viewer's personal scope without a project, with the template's text and labels

### Requirement: Placeholders
When a note is created from a template, the device SHALL replace `{{date}}` with the day in the user's date format, `{{weekday}}` with the weekday's name in the interface language, `{{time}}` with the time in the user's time format and `{{title}}` with the new note's title after its own placeholders, in the title and the text, using the user's day start for the day. A placeholder SHALL be matched only as `{{`, its name and `}}` without spaces; any other text in braces SHALL be kept as written. The web app and the server SHALL fill placeholders identically, pinned by shared vectors.

#### Scenario: Day start
- **WHEN** a user whose day starts at 04:00 creates a note from "Journal {{date}}" at 01:30 on 2026-11-13
- **THEN** the title carries the date 2026-11-12 in the user's date format

#### Scenario: Other braces kept
- **WHEN** a template's text holds "{{ date }}", "{{name}}" and a code block with "{{#each}}"
- **THEN** all three are kept exactly as written in the new note

#### Scenario: Vectors agree
- **WHEN** the shared placeholder vectors are run in the web app and in Go
- **THEN** every vector gives the same title and text on both sides

### Requirement: Built-in note templates
The library SHALL offer note templates that are never written to an account until used, listed after the user's own in From template…, in the interface language where a translation exists and in English otherwise, available offline. Choosing one SHALL create a note from it as from a user template, in the user's personal scope without a project, or in the project of an `in:` chip of the search field when there is one.

#### Scenario: Built-in offline
- **WHEN** the device is offline and the user chooses the built-in "Weekly review" from From template…
- **THEN** a note "Weekly review" with its headings is created and opens, and no request is made

#### Scenario: Translated
- **WHEN** an Italian user opens From template…
- **THEN** the built-in templates are listed with their Italian titles, and a created note carries the Italian text
