# Spec Delta

## MODIFIED Requirements

### Requirement: Cell contents
A day cell SHALL list timed tasks first in time order, then the others by priority and position, each showing its time when it has one, its title and its priority. Each task row in a cell SHALL be drawn as a soft fill of its project's palette hue with a 3 px solid hue edge on its leading side and the strong text tone, like a calendar block; rows in cells of days before today SHALL be dimmed to the faint tone with a lightened fill. When a cell holds more tasks than fit, it SHALL show the first ones and a "+N more" control that expands the cell. A cell whose tasks carry estimates SHALL show the planned total against the device's day length in the muted tone with tabular figures, marked in the danger tone when over capacity, like a Day column.

#### Scenario: Crowded day
- **WHEN** a day has seven open tasks and the cell fits three
- **THEN** the cell shows three tasks and "+4 more", and activating it shows all seven without leaving the grid

#### Scenario: Over capacity
- **WHEN** a day's open tasks total 9 hours of estimates with an 8-hour day length
- **THEN** the cell shows `9h / 8h` in the danger tone marked as over capacity

#### Scenario: Filled rows
- **WHEN** a cell holds a task of the orange project "Home" and a task without a project
- **THEN** the first row has the orange soft fill and edge and the second the Inbox hue's, both with the title in the strong tone

#### Scenario: Past days dimmed
- **WHEN** the month grid shows the 3rd and today is the 10th
- **THEN** the rows in the cell of the 3rd are in the faint tone with a lightened fill, and the rows of the 10th and later are not
