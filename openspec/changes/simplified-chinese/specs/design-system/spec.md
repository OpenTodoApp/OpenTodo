## ADDED Requirements

### Requirement: Glyphs outside the bundled typeface
Characters the bundled typeface does not cover SHALL render from the system font stack on the device. The app SHALL NOT download a font to cover them and SHALL NOT request a font from any host other than the user's own server. An installed app SHALL keep rendering those characters offline from fonts the device already has.

#### Scenario: Simplified Chinese on a fresh browser
- **WHEN** the interface language is Simplified Chinese and the app loads
- **THEN** Chinese glyphs are visible, no font request leaves the user's server, and the first load contains no Chinese font file

#### Scenario: Offline
- **WHEN** the installed app is opened with no network and the interface language is Simplified Chinese
- **THEN** Chinese glyphs still render from the device's own fonts

### Requirement: Line breaking follows the document language
Notes and multiline titles SHALL break lines by the document language's rules. A line SHALL NOT start with punctuation that the language keeps with the preceding character. A single-line title that does not fit SHALL end in an ellipsis, including a title with no spaces, and the full title SHALL remain available as the audited interface rules require for any truncated text.

#### Scenario: Punctuation stays with the previous character
- **WHEN** a note written in Simplified Chinese wraps, and a line would otherwise start with `。` or `，`
- **THEN** that punctuation stays on the previous line

#### Scenario: A title with no spaces
- **WHEN** a task title is Simplified Chinese, contains no spaces and is wider than its row
- **THEN** the row ends the title with an ellipsis and the full title is still available
