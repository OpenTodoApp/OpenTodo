## ADDED Requirements

### Requirement: Indent and Outdent without a keyboard
The editor SHALL offer **Indent** and **Outdent** as commands in the formatting row's More menu and in the `/` menu, doing what Tab and Shift-Tab do in a list: Indent SHALL nest the line under the line above it, and Outdent SHALL move it one level out, out of the list from the top level. Indent SHALL be offered only on a list line with a line above it in the same list, and Outdent only on a list line.

#### Scenario: Nest and bring back
- **WHEN** the caret is in "paint", the second line of the bullet list "fence", "paint", and the user chooses Indent from More
- **THEN** the note reads `- fence` with `- paint` nested under it, and choosing Outdent brings it back to `- fence` and `- paint`

#### Scenario: Not offered where nothing would move
- **WHEN** the caret is in the first line of a list, or in a paragraph outside a list
- **THEN** Indent is not offered, and in the paragraph Outdent is not offered either
