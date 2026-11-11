## MODIFIED Requirements

### Requirement: Form controls
Text inputs, text areas, selects, number inputs, checkboxes, radio groups and switches SHALL share one visual style, each with a visible label, an optional description, and an error state. The description and error are announced with the field. A binary setting that takes effect immediately SHALL be presented as a switch with switch semantics; a choice that is submitted with a form SHALL be a checkbox; one choice among two to six options that each need a word of explanation SHALL be a radio group. The switch SHALL be a 32 × 18 px track with the accent when on, with a hit area of at least 44 px on touch screens. A select SHALL draw its own chevron in the muted text colour instead of the platform's arrow. Screens SHALL NOT use a raw radio input or a number field without the shared style.

#### Scenario: Error is announced
- **WHEN** a field fails validation
- **THEN** it shows the error text below the field in the danger colour, is marked invalid, and assistive technology reads the error together with the label

#### Scenario: Immediate setting is a switch
- **WHEN** a screen reader user focuses a preference that applies immediately
- **THEN** it is announced as a switch with its on or off state

#### Scenario: Compact switch and select
- **WHEN** the form-controls story is shown at 1280 px in light and in dark
- **THEN** the switch is 32 × 18 px, the select shows the drawn chevron at its right in the muted colour, and the accessibility gate passes

#### Scenario: No raw radios
- **WHEN** a screen under `web/src/app` renders `<input type="radio">` directly
- **THEN** the UI lint fails naming the file and line

### Requirement: Settings section and row patterns
Settings content SHALL be built from sections and rows with a fixed anatomy. A section is a flat titled group with a one-line description and rows divided by hairlines; it has no help link of its own in its header and no action in its header. Its heading SHALL outrank its rows: at least the size and weight of a row label, in the strong text colour. A section MAY be shown without its heading when it is the only section of its page, its line then serving as the page's lead line. The description SHALL be one sentence of at most 90 characters in English and MAY end with an inline "Learn more" link that opens contextual help at the section's screen id; an option in a choice section SHALL have a label and at most 60 characters of description; anything longer belongs in Help. A row puts a label and its description beside the control from 640 px wide, stacks them below 640 px except when its only control is a switch, which stays at the end of the label's line, shows the current state as a status dot with its word beside the label before any action, and places a primary action as the control of its last row. Keyboard hints live in tooltips, never as paragraphs.

#### Scenario: Row stacks on phones
- **WHEN** a settings row with a select is shown 375 px wide
- **THEN** the label and description sit above the control, and nothing scrolls horizontally

#### Scenario: Switch row on phones
- **WHEN** a settings row with a switch is shown 375 px wide
- **THEN** the switch is at the end of the label's line, the description wraps below the label, and nothing scrolls horizontally

#### Scenario: Two-factor section anatomy
- **WHEN** a user with two-factor off opens Account
- **THEN** the Two-factor row shows a warning status dot with "Off" beside its label and "Set up" as its control, and the section header has no button or help link

#### Scenario: Heading outranks rows
- **WHEN** the settings-section story is shown at 1280 px in light and in dark
- **THEN** the section heading is at least as large and as heavy as the row labels, is drawn in the strong text colour, and the accessibility gate passes

#### Scenario: Learn more is part of the line
- **WHEN** the settings-section story is shown at 1280 px with a description and a Learn more link
- **THEN** the link sits at the end of the description line in the metadata size, is reachable with Tab after the heading and before the first control, is announced as "Learn more: <section title>", and the section header has no button

#### Scenario: Literal description in a story
- **WHEN** a story passes a literal 120-character sentence as a settings section's description instead of a copy-table entry
- **THEN** the settings copy lint in `npm test` fails naming the story file and line

## ADDED Requirements

### Requirement: Radio group
The design system SHALL offer a radio group: one labelled group of two to six options of which exactly one is chosen, each option with a label and an optional description of at most 60 characters. It SHALL come in two forms: cards, where each option is a bordered block with the chosen one marked in the accent and a check, for choices whose options need a sentence; and a compact list for short options. The group SHALL have radio group semantics: arrow keys move the choice and focus among options, Tab enters and leaves the group at the chosen option, Space chooses the focused option. A disabled option SHALL be skipped by the arrow keys and SHALL say why in its description. The radio mark SHALL use the accent, never the platform's colour.

#### Scenario: Keyboard
- **WHEN** a keyboard user tabs into a radio group of three options with the second chosen and presses the down arrow
- **THEN** focus and the choice move to the third option, and Tab leaves the group

#### Scenario: Read as a group
- **WHEN** a screen reader reaches the group
- **THEN** it reads the group's label, the chosen option's label and description, and its position ("2 of 3")

#### Scenario: Story in both themes
- **WHEN** the radio group story is shown in the card and the list form, in light and in dark, at 1280 and 375 px
- **THEN** the chosen option is marked by the accent and a check, a disabled option is visibly dimmed with its reason, and the accessibility gate passes

### Requirement: Number input
The design system SHALL offer a number input: a text field that accepts whole or decimal numbers within a range, with its unit shown after the value inside the field ("25 MB", "15 min", "4 sessions"), and an optional "No limit" choice beside it that clears and disables the field. A value outside the range SHALL show the field's error with the range ("Between 1 and 500 MB") and SHALL NOT be saved. On touch screens the field SHALL open the numeric keyboard and SHALL not zoom the screen. The arrow keys SHALL step the value by its step within the range.

#### Scenario: Unit after the value
- **WHEN** the owner opens Attachments
- **THEN** the maximum file size field reads "25" with "MB" after it inside the field, and no "MB" is needed in the label

#### Scenario: Out of range
- **WHEN** the user types 0 into a field whose range is 1 to 500
- **THEN** the field shows "Between 1 and 500 MB" as its error, is marked invalid, and Save stays disabled

#### Scenario: No limit
- **WHEN** the user checks "No limit" next to the per-account storage field
- **THEN** the field is cleared and disabled, and the saved value means no limit

#### Scenario: Story in both themes
- **WHEN** the number input story is shown in light and in dark at 1280 and 375 px
- **THEN** the unit, the range error and the No limit choice are visible and the accessibility gate passes
