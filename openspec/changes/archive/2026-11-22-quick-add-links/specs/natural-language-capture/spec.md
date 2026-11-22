## ADDED Requirements

### Requirement: Links in quick add
In every quick add (the list's line, the phone's sheet, the capture screen, the command bar's Add mode and each line of a multi-line paste), a whitespace-separated token that starts with `http://` or `https://` and names a host SHALL be recognised as a link token, on by default: tinted in the field, previewed as a dismissible chip reading its host without `www.`, and on save written as a link attachment of the new task, named after its host, and removed from the title. Trailing `.`, `,`, `;`, `:`, `!`, `?` and an unbalanced closing bracket SHALL not be part of the URL and SHALL leave the title with it. Dismissal, double quotes and the per-device parsing switch SHALL apply as to every token. At most five links per line SHALL become attachments, and the others SHALL stay in the title. A line whose title would otherwise be empty SHALL keep the URL as its title with no chip. A link equal to the task's origin URL, or one the task already has, SHALL not be attached again, and the links SHALL be listed in the order typed. A line with a link SHALL never reuse an item of a reusable list. On a device with no signed-in account yet, links SHALL not be read, so they stay in the title where they were typed. The task and its link attachments SHALL be written as one local operation set, visible at once, uploaded together and converging like any attachment; one Undo SHALL remove them all. The task panel's title field and the inline title editor SHALL read links typed during the current edit the same way and, on commit, attach them to the edited task in the same undoable change; text that was in the title when the edit began SHALL never be read. Routines SHALL not parse links. `POST /api/v1/quick-add/parse` SHALL report the links as `fields.links` (the URLs in line order) with chips of kind `link` reading the host, and `ot add` SHALL attach them like the app (named after the host, compared with the scheme and host case, a default port and an empty path normalised), matching the shared quick-add vectors; with an agent token, which may not attach, `ot add` SHALL keep them in the title.

#### Scenario: A link becomes an attachment
- **WHEN** the user enters `Review the mockup https://example.com/mockup tomorrow` in Today's quick add
- **THEN** a task "Review the mockup" due tomorrow is created with one link attachment to `https://example.com/mockup` named "example.com", and a chip read `example.com` before saving

#### Scenario: Dismissed link stays in the title
- **WHEN** the user dismisses the link chip, or presses Backspace twice with the caret at the end of `Read https://example.com/post`
- **THEN** the task is titled `Read https://example.com/post` and has no attachment

#### Scenario: Quoted link is text
- **WHEN** the user enters `Note "https://example.com" for later`
- **THEN** the title is `Note https://example.com for later` and no attachment is created

#### Scenario: Sentence punctuation
- **WHEN** the user enters `Read the spec at https://example.com/a(b).`
- **THEN** the attachment's URL is `https://example.com/a(b)` and the title is `Read the spec at`

#### Scenario: Offline
- **WHEN** the device is offline and the user enters `Book https://example.com/hotel #Trip`
- **THEN** the task appears in Trip with its link attachment at once, both survive a reload, and both upload in the next successful sync

#### Scenario: Only a link
- **WHEN** the user enters `https://example.com/article`
- **THEN** no chip is shown and the task is titled `https://example.com/article` with no attachment

#### Scenario: Other schemes
- **WHEN** the user enters `Open javascript:alert(1) ftp://example.com/f`
- **THEN** no link chip is shown and the whole line is the title

#### Scenario: A link typed while editing a title
- **WHEN** a task is titled "Call the bank" and the user appends ` https://bank.example/contact` in the panel title and presses Enter
- **THEN** the title is "Call the bank", the task has a link attachment to `https://bank.example/contact`, and one Undo removes both changes

#### Scenario: A link already in the title stays
- **WHEN** a task is titled "Read https://example.com/post" and the user appends ` today` in the panel title and commits
- **THEN** the title is "Read https://example.com/post", the task is due today and has no new attachment

#### Scenario: A routine keeps its URL
- **WHEN** a routine creates a task from the line `Pay https://bank.example/bill`
- **THEN** the task is titled `Pay https://bank.example/bill` and has no attachment
