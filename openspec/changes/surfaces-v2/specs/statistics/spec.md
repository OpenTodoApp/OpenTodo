# Spec Delta

## ADDED Requirements

### Requirement: Tile and panel presentation
Each headline tile SHALL show its value at the display step of the type scale with tabular figures, its name in the muted tone above the value, and its comparison or reason line in the muted tone below it, with the direction of a change carried by an arrow icon and its words, never by colour alone. Tiles SHALL use the card surface at the first elevation. The chart panels below the tiles SHALL be flat: a heading, the chart or its one-line collapse, and the Show as table action, separated from the next panel by vertical space and one hairline, with no border and no shadow. In dark the tiles SHALL carry the translucent border of the card surface.

#### Scenario: Tile at the display size
- **WHEN** this week's Done tile reads 12 with "+3 vs last week"
- **THEN** the 12 is set at the display step with tabular figures, "Done" sits above it in the muted tone, and the comparison line below it carries an upward arrow icon and the text "+3 vs last week" in the muted tone

#### Scenario: Flat panels
- **WHEN** the dashboard shows "Keeping up" above "Where time goes" at 1280 px in light and in dark
- **THEN** neither panel has a border or shadow, a hairline and space separate them, and the tiles above them keep the card surface

#### Scenario: Phone
- **WHEN** Statistics is opened at 390 px wide
- **THEN** the tiles show two per row with their values at the display step without clipping, and the flat panels stack with the same hairline between them
