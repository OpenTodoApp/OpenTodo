## ADDED Requirements

### Requirement: Links in quick add
In every quick add (the list's line, the phone's sheet, the capture screen, the command bar's Add mode and each line of a multi-line paste), an `http` or `https` URL in the line SHALL be recognised as a link token: tinted in the field, previewed as a dismissible chip reading its host without `www.`, and on save written as a link attachment of the new task and removed from the title. Trailing `.`, `,`, `;`, `:`, `!`, `?` and an unbalanced closing bracket SHALL not be part of the URL. Dismissal, double quotes and the per-device parsing switch SHALL apply as to every token. At most five links per line SHALL become attachments, and the others SHALL stay in the title. A line whose title would otherwise be empty SHALL keep the URL as its title with no chip. A link equal to the task's origin URL SHALL not be attached. The task and its link attachments SHALL be written as one local operation set, visible at once, uploaded together and converging like any attachment; one Undo SHALL remove them all. Title editing, routines and `ot time` SHALL not parse links. `POST /api/v1/quick-add/parse` SHALL report the links as `fields.links` (`{url, name}` in line order) with chips of kind `link`, and `ot add` SHALL attach them, matching the shared quick-add vectors.

#### Scenario: A link becomes an attachment
- **WHEN** the user enters `Review the mockup https://example.com/mockup tomorrow` in Today's quick add
- **THEN** a task "Review the mockup" due tomorrow is created with one link attachment to `https://example.com/mockup` named "mockup", and a chip read `example.com` before saving

#### Scenario: Dismissed link stays in the title
- **WHEN** the user dismisses the link chip, or presses Backspace twice with the caret at the end of `Read https://example.com/post`
- **THEN** the task is titled `Read https://example.com/post` and has no attachment

#### Scenario: Quoted link is text
- **WHEN** the user enters `Note "https://example.com" for later`
- **THEN** the title is `Note https://example.com for later` and no attachment is created

#### Scenario: Sentence punctuation
- **WHEN** the user enters `Read the spec at https://example.com/a(b).`
- **THEN** the attachment's URL is `https://example.com/a(b)` and the title is `Read the spec at.`, as the full stop stays in the title

#### Scenario: Offline
- **WHEN** the device is offline and the user enters `Book https://example.com/hotel #Trip`
- **THEN** the task appears in Trip with its link attachment at once, both survive a reload, and both upload in the next successful sync

#### Scenario: Only a link
- **WHEN** the user enters `https://example.com/article`
- **THEN** no chip is shown and the task is titled `https://example.com/article` with no attachment

#### Scenario: Other schemes
- **WHEN** the user enters `Open javascript:alert(1) ftp://example.com/f`
- **THEN** no link chip is shown and the whole line is the title
