## ADDED Requirements

### Requirement: Templates on the Notes page
A template's row SHALL carry the quiet word "Template" after its title on the row's title track, and an open template SHALL show **Use template** as its first action and the same word in its header. The search field SHALL accept the token `template`, which keeps only templates and combines with the other tokens of `notes-page` "Search tokens" as they combine with each other; it SHALL work on the device, offline and with encryption. New note SHALL be a split button whose second part, From template…, is also reached with `Shift+Q` on the page, registered in the shortcut registry without a conflict.

#### Scenario: Only templates
- **WHEN** the user types `template ` in the search field and has three templates among 200 notes
- **THEN** the chip `template` is shown and the list holds the three templates

#### Scenario: Use from the open template
- **WHEN** the user opens the template "1:1" and chooses Use template
- **THEN** a new note is created from it and opens, and the template stays as it was

#### Scenario: Keyboard
- **WHEN** the user presses `Shift+Q` on the Notes page while no text field has focus
- **THEN** From template… opens with its Combobox focused
