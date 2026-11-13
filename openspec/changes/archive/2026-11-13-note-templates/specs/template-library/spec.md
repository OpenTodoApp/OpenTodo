## ADDED Requirements

### Requirement: Note templates in the library
The library SHALL hold note templates in `templates/notes/<slug>/note.yaml`, in English, with optional translation files `<language>.yaml` that hold only the translated `title`, `summary` and `body`. A note template SHALL carry a `title` (at most 60 characters, placeholders allowed), a `summary` (one sentence, at most 160 characters), an `icon` from the catalogue, `author`, `reviewed` (a date) and a `body` (Markdown, at most 8 KB, placeholders of `note-templates` "Placeholders" allowed). `make templates` SHALL compile them into the same compiled library the app and `internal/templatelib` read, under `notes`. The library SHALL ship at least Meeting, 1:1, Trip, Weekly review and Daily. `templates/README.md` SHALL document the format with a complete example.

#### Scenario: A contributed note template
- **WHEN** a contributor adds `templates/notes/book-notes/note.yaml` with a title, summary, icon and a body with three headings, and opens a pull request
- **THEN** CI validates it, and once merged the next release lists "Book notes" in From template…

#### Scenario: Translation overlay
- **WHEN** `templates/notes/meeting/de.yaml` translates the title and body
- **THEN** a German user's note created from Meeting carries the German title and text

### Requirement: Note template validation
CI SHALL fail, naming the template, the file and the path, when a note template breaks the format: a missing or too long field, an icon not in the catalogue, a body over 8 KB, a placeholder that is not one of `{{date}}`, `{{weekday}}`, `{{time}}` and `{{title}}`, a translation file with a key the English file does not have or that drops a placeholder the English text uses, an email address, phone number or URL other than an `https` link, or an English title another note template already has. Every note template SHALL be filled by an automated test on a fixed date and time with the Go placeholder function, and the result SHALL equal the web app's for the same inputs.

#### Scenario: Unknown placeholder
- **WHEN** `templates/notes/trip/note.yaml` uses `{{destination}}`
- **THEN** the check fails with "notes/trip/note.yaml: body: unknown placeholder {{destination}}"

#### Scenario: A translation drops a placeholder
- **WHEN** the French title of Meeting leaves out `{{date}}`
- **THEN** the check fails naming `notes/meeting/fr.yaml` and `title`
