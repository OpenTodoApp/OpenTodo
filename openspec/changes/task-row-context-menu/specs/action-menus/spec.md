# Spec Delta

## ADDED Requirements

### Requirement: Open a task's action menu with a right-click
A right-click on a task row (a list row, a board card, a timeline row, or a row of the filter, saved-view and method lists) SHALL open that row's actions menu — the same menu the keyboard opens, with the same items, pickers, review step and Undo — positioned at the pointer, and SHALL suppress the browser's own context menu over the row. The menu's target SHALL be every ticked task when the right-clicked row is ticked, otherwise only the right-clicked row's task, and a right-click SHALL NOT change the current selection. While a row drag is lifted, the right-click SHALL do nothing and the drag SHALL proceed. On a viewport below 640 px the menu SHALL appear as the standard bottom sheet, ignoring the pointer position.

#### Scenario: Right-click a single task
- **WHEN** the user right-clicks an unticked row in Today
- **THEN** the Actions menu opens next to the pointer with "Actions for 1 task", the browser menu does not appear, and the row's selection state is unchanged

#### Scenario: Right-click a ticked row acts on the selection
- **WHEN** three rows are ticked and the user right-clicks one of them
- **THEN** the menu opens for all three tasks ("Actions for 3 tasks"), exactly as the Selection bar's menu would

#### Scenario: Right-click a row outside the selection
- **WHEN** two rows are ticked and the user right-clicks a third, unticked row
- **THEN** the menu opens for that row's task only, and the two ticked rows stay ticked

#### Scenario: A lifted drag wins
- **WHEN** the user long-presses a row to drag it and the context gesture fires before release
- **THEN** no menu opens and the drop completes on release as it does today

#### Scenario: Escape closes without residue
- **WHEN** the right-click menu is open and the user presses Escape
- **THEN** the menu closes, focus returns to the page, and the next right-click opens it again at the new pointer position
