## MODIFIED Requirements

### Requirement: Selected row indicator
The selected row SHALL be marked by a 2 px accent bar at its leading edge and a faint accent tint, with no border or ring around the row and no full-strength background. Hovering a row SHALL only give it a neutral tint lighter than the selected row's tint: no border, ring, shadow, size change or newly shown control. Hovering the selected row SHALL add nothing to its selection marks, and the row's metadata line SHALL keep its colours while hovered. The indicator SHALL meet 3:1 non-text contrast against the list background in the light and dark themes, SHALL differ from hover and from ticked rows, and SHALL not change the row's size or the position of its content. Keyboard focus SHALL keep its focus outline.

#### Scenario: Selected and hovered rows differ
- **WHEN** one row is selected and the pointer hovers another
- **THEN** the selected row shows the leading accent bar and tint, the hovered row only a neutral tint lighter than the selection's, and neither has a ring

#### Scenario: Contrast in dark mode
- **WHEN** the theme is dark and a row is selected
- **THEN** the leading bar has at least 3:1 contrast against the list background

#### Scenario: Hover over a two-line row
- **WHEN** the pointer moves over a row with a title and a metadata line
- **THEN** only a light neutral tint appears behind it, nothing in the row moves or changes size, and the metadata keeps its colours

#### Scenario: Hover over the selected row
- **WHEN** the pointer moves over the selected row
- **THEN** the row looks the same as when the pointer is elsewhere
