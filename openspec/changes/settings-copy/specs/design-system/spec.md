# Spec Delta

## MODIFIED Requirements

### Requirement: Settings section and row patterns
Settings content SHALL be built from sections and rows with a fixed anatomy. A section is a titled card with a one-line description and rows; it has no help link of its own in its header and no action in its header. The description SHALL be one sentence of at most 90 characters in English and MAY end with an inline "Learn more" link that opens contextual help at the section's screen id; an option in a choice section SHALL have a label and at most 60 characters of description; anything longer belongs in Help. A row puts a label and its description beside the control from 640 px wide, stacks them below 640 px, shows the current state as a badge beside the label before any action, and places a primary action as the control of its last row. Keyboard hints live in tooltips, never as paragraphs.

#### Scenario: Row stacks on phones
- **WHEN** a settings row is shown 375 px wide
- **THEN** the label and description sit above the control, and nothing scrolls horizontally

#### Scenario: Two-factor section anatomy
- **WHEN** a user with two-factor off opens Account
- **THEN** the Two-factor row shows an "Off" badge beside its label and "Set up" as its control, and the section header has no button or help link

#### Scenario: Learn more is part of the line
- **WHEN** the settings-section story is shown at 1280 px with a description and a Learn more link
- **THEN** the link sits at the end of the description line in the metadata size, is reachable with Tab after the heading and before the first control, is announced as "Learn more: <section title>", and the card header has no button

#### Scenario: Literal description in a story
- **WHEN** a story passes a literal 120-character sentence as a settings section's description instead of a copy-table entry
- **THEN** the settings copy lint in `npm test` fails naming the story file and line
