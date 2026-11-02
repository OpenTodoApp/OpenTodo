## MODIFIED Requirements

### Requirement: Facet editors are popovers
Activating a part SHALL open its editor as a popover anchored to the part from 640 px and as a bottom sheet below, with the facet's name and icon as its title and a footer offering Clear (when the part has a value) and Close. The panel's content SHALL not move while a popover is open. Close, Escape or a committed single-value edit SHALL close the popover and return focus to the part; Clear SHALL remove the value and close it.

#### Scenario: Clear from the footer
- **WHEN** the user opens the deadline part and chooses Clear
- **THEN** the deadline is removed, the popover closes, the When line no longer reads a deadline, and no "×" control is rendered on any line

#### Scenario: Layout stays
- **WHEN** the user opens the Do on part on a 1280×800 screen
- **THEN** the subtasks and the tabs keep their position in the panel while the popover is open

#### Scenario: Phone sheet
- **WHEN** the user taps the labels part on a 390 px wide screen
- **THEN** the labels editor opens as a bottom sheet with the facet's title and Close, and closing it returns to the panel scrolled where it was
