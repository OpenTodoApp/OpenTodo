# Spec Delta

## Purpose

Defines how contextual action menus (the "⋯" menus on views, labels, sections and projects) present their actions and behave, so every menu in the app is scannable, keyboard-operable and safe for destructive actions.

## ADDED Requirements

### Requirement: Every action menu uses the shared menu behaviour
The view, label, section and project menus SHALL each be a design-system menu, with its keyboard navigation, item anatomy and overlay behaviour, so a user who learns one menu can operate them all. Each menu item SHALL show an icon and a label of at most four words; no action menu SHALL contain a native select or a row of side-by-side buttons.

#### Scenario: View menu layout
- **WHEN** the user opens the menu of a saved view
- **THEN** the items appear in groups (rename; pinned and start view; move up and move down; delete), each with an icon, and "Delete view" is last, separated and in the danger colour

#### Scenario: Disabled with reason
- **WHEN** the user opens the menu of the first section of a project
- **THEN** "Move up" is shown disabled and its description says it is already first

#### Scenario: Screen reader announcement
- **WHEN** a screen reader user opens a label menu
- **THEN** the panel is announced as a menu named after the label, and each item as a menu item with its checked or disabled state

### Requirement: Stateful items show their state
An action that toggles a state SHALL be a checkable item with a fixed label whose checked state reflects the current value, instead of a label that changes wording. Activating it SHALL toggle the state and SHALL keep the label unchanged.

#### Scenario: Pin a view
- **WHEN** the user opens the menu of an unpinned view, sees "Pinned to sidebar" unchecked and activates it
- **THEN** the view is pinned and the next time the menu opens the same item is shown checked

### Requirement: Discoverable menu triggers
A menu trigger SHALL be an icon button with an accessible name naming its object (for example "Menu for label errand"). It SHALL be visible on the active or selected row, while any control in its row has keyboard focus, while its menu is open, and at all times on devices without hover. Elsewhere it MAY appear only on hover.

#### Scenario: Touch device
- **WHEN** a user on a phone opens the labels overview
- **THEN** every label row shows its menu trigger without any hover and the trigger is at least 44×44 px

#### Scenario: Keyboard focus reveals
- **WHEN** a keyboard user tabs onto a label row in the sidebar on a desktop
- **THEN** that row's menu trigger becomes visible and is the next tab stop

### Requirement: Open the menu of the selected item from the keyboard
When a label, view or section row is focused or selected, pressing `.` or Shift+F10 or the context-menu key SHALL open that row's action menu, outside text fields. The shortcut SHALL be listed in the `?` keyboard help.

#### Scenario: Open by shortcut
- **WHEN** a label row in the labels overview has focus and the user presses `.`
- **THEN** that label's menu opens with focus on its first item

### Requirement: Picking a target inside a menu
An action that needs a target from a list (moving a project, merging a label) SHALL open the design-system smart picker within the same overlay, listing only valid targets and offering a way back to the menu. Invalid targets SHALL never be listed or accepted.

#### Scenario: Search a target
- **WHEN** the user chooses "Merge into…" on "Errand", types "err" and presses Enter on "errand"
- **THEN** the merge confirmation for "Errand" into "errand" is shown

#### Scenario: Back to the menu
- **WHEN** the target picker is open and the user presses Escape once
- **THEN** the picker closes back to the menu's items, and a second Escape closes the menu

### Requirement: Confirm destructive menu actions with their impact
Deleting a view, label, section or project, and merging labels, SHALL ask for confirmation in an in-app alert dialog that names the object, states the impact in numbers computed from local data, labels the confirm button with the action verb, and puts initial focus on Cancel. A tap outside SHALL NOT dismiss it; Escape and Cancel SHALL abort without any change.

#### Scenario: Delete a label with usages
- **WHEN** the user chooses "Delete" on the label "errand", which 12 non-deleted tasks carry
- **THEN** a dialog says "errand" will be removed from 12 tasks, the buttons read "Cancel" and "Delete label", and Cancel has focus

#### Scenario: Abort
- **WHEN** the confirmation is open and the user presses Escape
- **THEN** the dialog closes, no operation is queued and focus returns to the row's menu trigger

#### Scenario: Works offline
- **WHEN** the device is offline and the user confirms deleting a section
- **THEN** the impact count is computed from local data, the deletion applies locally at once and is uploaded when the network returns
