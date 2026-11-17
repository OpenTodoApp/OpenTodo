## ADDED Requirements

### Requirement: Labels fit the One line row column
When the One line layout displays labels, its chips SHALL stay on one line within the labels slot. The row SHALL show the longest ordered prefix of full chips that fits alongside a `+N` count for the remaining labels. If no full chip fits, the first label name SHALL end in an ellipsis, leaving room for the count if there are remaining labels. A cut name and the count SHALL each reveal their respective full names on pointer hover or keyboard focus and remain readable by assistive technology. The row SHALL update this presentation as its width or labels change.

#### Scenario: Many labels in a fixed column
- **WHEN** a One line row has four labels and its column can fit two full chips alongside the count
- **THEN** the first two names and `+2` are visible on one line, and hovering or focusing `+2` reveals the last two names

#### Scenario: Long first label
- **WHEN** the first label and the remaining-label count cannot both fit at full width
- **THEN** the row shows that label with an ellipsis alongside the whole count, and hovering or focusing the cut label reveals its full name

#### Scenario: Available space changes
- **WHEN** widening the list makes room for another full chip or removes the need for the count
- **THEN** the row updates the visible labels and count to match the new width

#### Scenario: Detailed rows
- **WHEN** the same task is displayed in Detailed
- **THEN** the labels continue to use the Detailed row's existing layout and overflow behavior
