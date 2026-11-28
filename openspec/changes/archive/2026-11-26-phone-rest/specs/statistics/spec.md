## ADDED Requirements

### Requirement: Sideways regions show that they continue
A region of the Statistics page that scrolls sideways inside itself (the heatmap, the weekday and hour grid, and a chart's table) SHALL fade out at an edge while content is hidden past that edge, and SHALL show no fade at an edge with nothing past it, so a region that fits shows none. The heatmap SHALL still open on the current week, with its fade on the side of the earlier weeks. Each region SHALL scroll with a finger, and the page itself SHALL never scroll sideways. "Show as table" SHALL open and close a chart's table on a phone as elsewhere. The fade is drawn on the device from the region's own size: it reads no data, needs no connection and writes nothing.

#### Scenario: The heatmap on a phone
- **WHEN** Statistics is open at 360 px
- **THEN** the heatmap shows the current week at its right edge and fades out at its left edge, where the earlier weeks are

#### Scenario: Scrolled part way
- **WHEN** the user drags the weekday and hour grid sideways by half its width
- **THEN** both of its edges fade, and the page has not moved sideways

#### Scenario: At the end
- **WHEN** the user scrolls the weekday and hour grid to its last hour
- **THEN** only its left edge fades

#### Scenario: A wide table
- **WHEN** the user taps "Show as table" on the heatmap at 390 px
- **THEN** the table opens under the chart, scrolls sideways inside itself, fades at its right edge, and the control reads "Hide table"

#### Scenario: A region that fits
- **WHEN** Statistics is open at 1280 px and every chart fits its panel
- **THEN** no region shows a fade
