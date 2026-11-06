## ADDED Requirements

### Requirement: Quick add field surface
The quick add in its `line` presentation SHALL draw its field on a filled surface that reads as an input in every theme: the raised token as its fill, the control radius, compact padding, the hover token as its hover tint and the focus ring (the one focus style) while its input has focus. The fill, tints and ring SHALL come from tokens, so the field follows the light, dark and system themes. In a theme whose surface and raised tokens are identical (high contrast, black), the field SHALL be drawn with the default border instead. The list pages' sticky quick add row SHALL have no divider under it and SHALL keep an opaque page surface behind the field, so rows scrolling under it never show through. The read-only quick add of a viewer SHALL use the same surface, dimmed, with its note beneath. The presentation SHALL change nothing about parsing, chips, suggestions, dictation, paste-to-tasks or shortcuts. The command bar and the phone sheet presentations SHALL be unchanged. The surface is device interface state: it writes no op and behaves the same offline and on every device.

#### Scenario: The field is recognisable in dark mode
- **WHEN** the Today view is shown in the dark theme
- **THEN** the quick add field has a fill distinct from the page surface, rounded corners and the `+` inside it, and the contrast gate on the story passes

#### Scenario: Hover and focus
- **WHEN** the pointer is over the field, and then the user presses `q` to focus it
- **THEN** the field shows the hover tint on hover and the focus ring while the input has focus, and typing and chips behave exactly as before

#### Scenario: Every line use matches
- **WHEN** the quick add appears on a project page, the Inbox catch in review and the first-run screen
- **THEN** each draws the same filled field, and the palette and phone sheet look as they did

#### Scenario: High-contrast theme
- **WHEN** the high-contrast theme is on
- **THEN** the field is bordered with the default border, since the fill cannot differ from the page

#### Scenario: Sticky row over scrolling rows
- **WHEN** a long list is scrolled at 1280 px
- **THEN** the field stays under the page header on an opaque surface with no divider, and no row shows through beside or behind it

#### Scenario: Viewer of a shared project
- **WHEN** a viewer opens a project they cannot edit
- **THEN** the disabled field has the same shape, dimmed, with the read-only note under it
