## ADDED Requirements

### Requirement: Tab rows scroll only sideways
A tab row SHALL scroll only sideways, and only when it is wider than its space, keeping the selected tab in view. It SHALL never scroll vertically nor show a vertical scrollbar, at any width, zoom or text size. The selected tab's underline SHALL be shown at its full thickness on the row's baseline. This holds for every tab row built from the shared tabs, wherever it is used.

#### Scenario: No vertical scrollbar on a tab row
- **WHEN** the task panel is open on a desktop browser with the Comments, Activity, History and Time tabs, and its tab row fits in the panel
- **THEN** the tab row shows no scrollbar, cannot be scrolled vertically by wheel or touch, and the selected tab's underline is drawn at its full thickness on the row's baseline

#### Scenario: A narrow tab row still scrolls sideways
- **WHEN** a tab row is wider than the screen at 360 px and the last tab is selected
- **THEN** the row scrolls sideways to show the selected tab, and still cannot be scrolled vertically

#### Scenario: Larger text
- **WHEN** the browser's text size is 24 px and the task panel is open
- **THEN** the tab row grows to fit its tabs and shows no vertical scrollbar
