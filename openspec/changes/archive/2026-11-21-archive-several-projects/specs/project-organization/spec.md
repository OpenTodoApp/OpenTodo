# Spec Delta

## ADDED Requirements

### Requirement: Archive several projects at once
The All projects table SHALL let the user tick several projects and archive them together. Ctrl or ⌘+click on a row SHALL tick it without opening it; Shift+click and Shift+↑/↓ SHALL extend from the last tick; Space or x on a row SHALL tick or untick it; while anything is ticked, Ctrl+A SHALL tick every listed row and Escape SHALL clear the selection. "Select projects" in the page's menu SHALL show the boxes without ticking anything, for touch screens. While the boxes show, each row's box SHALL stand where its colour mark is and a click on a row SHALL tick it. Only projects the user may archive from the Project menu SHALL be tickable. While projects are ticked, the selection bar SHALL show their count, Archive and Clear. Archive SHALL ask first, naming the count, and SHALL then archive every ticked project with its sub-projects in one batch with one Undo toast; a project already archived or listed twice through its parent SHALL be written once. The selection is device state, never synced, and archiving works offline.

#### Scenario: Archive three projects after an import
- **WHEN** the user Ctrl+clicks "Home", Shift+clicks "Work" (with "Garden" under "Home" between them) and chooses Archive in the bar, then confirms "Archive 3 projects?"
- **THEN** Home, Garden and Work are archived in one batch and leave the table, the other projects stay, and the toast offers Undo, which brings all three back

#### Scenario: A viewer's project
- **WHEN** a project is shared with the user as a viewer and the user presses Space on its row
- **THEN** nothing is ticked and the selection bar does not appear
