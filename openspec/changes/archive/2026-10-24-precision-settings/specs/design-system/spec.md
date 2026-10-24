## MODIFIED Requirements

### Requirement: Form controls
Text inputs, text areas, selects, checkboxes and switches SHALL share one visual style, each with a visible label, an optional description, and an error state. The description and error are announced with the field. A binary setting that takes effect immediately SHALL be presented as a switch with switch semantics; a choice that is submitted with a form SHALL be a checkbox. The switch SHALL be a 32 × 18 px track with the accent when on, with a hit area of at least 44 px on touch screens. A select SHALL draw its own chevron in the muted text colour instead of the platform's arrow.

#### Scenario: Error is announced
- **WHEN** a field fails validation
- **THEN** it shows the error text below the field in the danger colour, is marked invalid, and assistive technology reads the error together with the label

#### Scenario: Immediate setting is a switch
- **WHEN** a screen reader user focuses a preference that applies immediately
- **THEN** it is announced as a switch with its on or off state

#### Scenario: Compact switch and select
- **WHEN** the form-controls story is shown at 1280 px in light and in dark
- **THEN** the switch is 32 × 18 px, the select shows the drawn chevron at its right in the muted colour, and the accessibility gate passes

### Requirement: Settings section and row patterns
Settings content SHALL be built from sections and rows with a fixed anatomy. A section is a flat titled group with a one-line description and rows divided by hairlines; it has no help link of its own in its header and no action in its header. The description SHALL be one sentence of at most 90 characters in English and MAY end with an inline "Learn more" link that opens contextual help at the section's screen id; an option in a choice section SHALL have a label and at most 60 characters of description; anything longer belongs in Help. A row puts a label and its description beside the control from 640 px wide, stacks them below 640 px, shows the current state as a status dot with its word beside the label before any action, and places a primary action as the control of its last row. Keyboard hints live in tooltips, never as paragraphs.

#### Scenario: Row stacks on phones
- **WHEN** a settings row is shown 375 px wide
- **THEN** the label and description sit above the control, and nothing scrolls horizontally

#### Scenario: Two-factor section anatomy
- **WHEN** a user with two-factor off opens Account
- **THEN** the Two-factor row shows an "Off" status dot beside its label and "Set up" as its control, and the section header has no button or help link

#### Scenario: Learn more is part of the line
- **WHEN** the settings-section story is shown at 1280 px with a description and a Learn more link
- **THEN** the link sits at the end of the description line in the metadata size, is reachable with Tab after the heading and before the first control, is announced as "Learn more: <section title>", and the section header has no button

#### Scenario: Literal description in a story
- **WHEN** a story passes a literal 120-character sentence as a settings section's description instead of a copy-table entry
- **THEN** the settings copy lint in `npm test` fails naming the story file and line

## ADDED Requirements

### Requirement: Status dot
The design system SHALL offer a status dot: a small round dot in one of five tones (ok, warning, danger, busy, off) followed by a word that states the status, so the meaning never rests on colour alone. The dot SHALL be hidden from assistive technology and the word SHALL be read. A busy dot MAY pulse, and SHALL NOT move when reduced motion is requested. State such as on or off, working or failing, configured or not SHALL use a status dot; a category such as a role or a token scope SHALL keep a badge.

#### Scenario: Read as a word
- **WHEN** a screen reader reaches a webhook whose last delivery failed
- **THEN** it reads "Failing" and nothing for the dot

#### Scenario: Reduced motion
- **WHEN** reduced motion is requested and a backup is running
- **THEN** the busy dot is shown without the pulse

#### Scenario: Story in both themes
- **WHEN** the status-dot story is shown in light and in dark
- **THEN** each of the five tones shows its dot and word, and every word meets the text contrast minimum
