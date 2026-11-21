# Spec Delta

## ADDED Requirements

### Requirement: Icon and colour pickers on touch
On a touch screen (a coarse pointer) every icon of the icon picker, "No icon" included, and every colour swatch of the palette swatches and of the colour picker SHALL be a target of at least 44 × 44 px, and no two of them SHALL overlap. The icon grid SHALL hold as many columns of at least 44 px as its width allows, all the same width, and the palette swatches SHALL be laid out by the same rule, so swatches above an icon grid stand in its columns. The arrow keys SHALL move through the icon grid as it is drawn: Up and Down by one drawn row, whatever the number of columns. In a phone's sheet the picker's search field SHALL sit inside the sheet with the same inset on both sides, its left edge in line with the sheet's title, and the sheet SHALL NOT scroll sideways. The search field SHALL stay unfocused when the picker opens by touch, as "A sheet keeps the on-screen keyboard down until a field is asked for" requires. With a fine pointer the pickers SHALL keep their layout: 36 px icon cells in eight columns and 20 px palette swatches. This is presentation only: it reads and writes no data and behaves the same offline; what a pick writes is unchanged and converges as before.

#### Scenario: A new project's appearance on a small phone
- **WHEN** the user opens Appearance in the sidebar's new project form on a 360 px touch screen
- **THEN** the icons are seven to a row, each 44 × 44 px, the swatches stand in the same seven columns, and the "Search icons" field starts 16 px from the left edge and ends 16 px from the right

#### Scenario: A larger phone
- **WHEN** the same sheet is open on a 390 px touch screen
- **THEN** the icons are seven to a row, each at least 44 px wide and 44 px high, with the same gap between every two neighbours

#### Scenario: The icon step of a menu
- **WHEN** the user opens a project's menu on a 360 px touch screen and chooses Icon…
- **THEN** the field and the grid have the same edges as in the new project's sheet, and the field is not focused

#### Scenario: Arrow keys on a narrower grid
- **WHEN** the grid is drawn seven columns wide and the user presses Down in the search field on the first icon of a category
- **THEN** the active icon is the one drawn under it, the eighth of that category

#### Scenario: The theme editor's colour picker
- **WHEN** the user opens a colour of a theme on a 360 px touch screen
- **THEN** the swatches are six to a row and each is at least 44 × 44 px

#### Scenario: With a mouse
- **WHEN** the user opens Appearance in the new project form on a 1280 px screen with a mouse
- **THEN** the icons are 36 px cells in eight columns and the swatches 20 px, where they were before
