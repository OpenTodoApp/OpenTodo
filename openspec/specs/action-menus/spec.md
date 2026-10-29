# action-menus Specification

## Purpose
Defines how contextual action menus (the "⋯" menus on views, labels, sections and projects) present their actions and behave, so every menu in the app is scannable, keyboard-operable and safe for destructive actions.

## Requirements

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

### Requirement: Open a task's action menu with a right-click
A right-click on a task row (a list row, a board card, or a row of the filter, saved-view and method lists) SHALL open that row's actions menu — the same menu the keyboard opens, with the same items, pickers, review step and Undo — positioned at the pointer, and SHALL suppress the browser's own context menu over the row. The menu's target SHALL be every ticked task when the right-clicked row is ticked, otherwise only the right-clicked row's task, in list order, and a right-click SHALL NOT change the current selection. (The keyboard's own menu differs by design: `.` acts on the whole ticked selection wherever the cursor is.) The browser's menu SHALL be left alone over a link, a text field or editable text inside the row, and over a non-collapsed selection of the row's text, so native actions — open in a new tab, copy link address, paste, spellcheck, copy — keep working there. A `contextmenu` raised by touch SHALL be suppressed but SHALL NOT open the menu: the touch hold owns that gesture, so one press never both ticks a row and opens its menu. While a row drag is lifted, the right-click SHALL do nothing and the drag SHALL proceed. On a viewport below 640 px the menu SHALL appear as the standard bottom sheet, ignoring the pointer position. When the menu closes with the focus nowhere in particular (Escape, the keyboard), focus SHALL return to the row it was opened from.

#### Scenario: Right-click a single task
- **WHEN** the user right-clicks an unticked row in Today
- **THEN** the Actions menu opens next to the pointer with "Actions for 1 task", the browser menu does not appear, and the row's selection state is unchanged

#### Scenario: Right-click a ticked row acts on the selection
- **WHEN** three rows are ticked and the user right-clicks one of them
- **THEN** the menu opens for all three tasks ("Actions for 3 tasks"), in list order, exactly as the Selection bar's menu would

#### Scenario: Right-click a row outside the selection
- **WHEN** two rows are ticked and the user right-clicks a third, unticked row
- **THEN** the menu opens for that row's task only, and the two ticked rows stay ticked

#### Scenario: A link keeps the browser's menu
- **WHEN** the user right-clicks the origin chip (an external link) inside a row
- **THEN** no app menu opens and the browser's own menu appears, offering "Open link in new tab" and "Copy link address"

#### Scenario: The inline title editor keeps the browser's menu
- **WHEN** the user right-clicks inside a row whose title is being edited in place
- **THEN** no app menu opens and the field's native menu (paste, spelling suggestions) appears

#### Scenario: Selected text can still be copied with a right-click
- **WHEN** the user selects part of a row's title and right-clicks the selection
- **THEN** no app menu opens and the browser's menu offers "Copy"

#### Scenario: A touch long press never doubles up
- **WHEN** Chrome on Android raises `contextmenu` during a long press on a row
- **THEN** the browser menu is suppressed, no app menu opens, and the row's long press keeps its own meaning (it ticks the row)

#### Scenario: A lifted drag wins
- **WHEN** the user long-presses a row to drag it and the context gesture fires before release
- **THEN** no menu opens and the drop completes on release as it does today

#### Scenario: Escape closes without residue
- **WHEN** the right-click menu is open and the user presses Escape
- **THEN** the menu closes, focus returns to the row's open button, and the next right-click opens it again at the new pointer position

### Requirement: Open a task's action menu with a touch hold
On a fine-pointer touch device, holding a task row still for the hold interval (350 ms) SHALL arm the gesture — the row shows held feedback while the hold counts — and releasing without moving SHALL open the same actions menu at the finger: the same items, pickers, review step and Undo, and the same ticked-selection rule as the right-click, without changing the current selection. Moving before the hold completes SHALL be a scroll and SHALL NOT open anything; moving after it SHALL end the hold as a scroll on a row without a drag, with no menu. On a coarse pointer (a phone or a tablet used as one) the hold SHALL never open the menu: the long press keeps its existing meaning from bulk-actions — it ticks the row, or simply scrolls a row that cannot be ticked — so one gesture means one thing on every list of a device. The gesture SHALL work on every row that answers a right-click, a press shorter than the hold SHALL keep the row's ordinary tap behaviour, and the browser's own context menu SHALL NOT appear over the row.

#### Scenario: Hold still and lift — the menu opens at the finger
- **WHEN** the user presses a row in a list on a touch screen with a fine pointer, holds still past the hold interval and lifts without moving
- **THEN** the row's actions menu opens anchored where the finger was, acting on the ticked selection when the row is ticked and on the row's task otherwise, and the row's held feedback is cleared

#### Scenario: Hold and then move drags instead
- **WHEN** the user presses a row, holds past the interval and then moves the finger
- **THEN** the drag lifts with its usual feedback, no menu opens, and releasing completes the drop as it does today

#### Scenario: A move before the hold is a scroll
- **WHEN** the user presses a row and moves further than the drag threshold before the hold interval elapses
- **THEN** the hold ends without feedback and without a menu, and the page scrolls under the finger

#### Scenario: A short press is still a tap
- **WHEN** the user taps a row and releases before the hold interval elapses
- **THEN** the row behaves exactly as it does today (the tap opens or selects it), with no menu

#### Scenario: On a phone the long press ticks, never opens a menu
- **WHEN** a user on a phone holds a row of a saved view still past the hold interval and lifts
- **THEN** no menu opens; the press keeps whatever the list's long press means there (a tick where the list offers one, otherwise nothing), and the row's own menu button remains the touch path to the menu

### Requirement: Long lists of choices fold into a submenu
An action menu MAY show related choices as one submenu item labelled with an ellipsis. Activating it SHALL replace the menu's items with the choices in the same panel, still a menu with the same keyboard model, with focus on the first choice. Its first item, Escape or a tap outside SHALL go back, with focus on the submenu item; a choice SHALL act and close the menu. The task Actions menu SHALL show Priority and Date as submenus; the command palette SHALL still list each choice.

#### Scenario: Set a priority from the right-click menu
- **WHEN** the user right-clicks a task row, chooses "Priority…" and then "Priority 1"
- **THEN** the menu shows Priority 1 to 4 with their keys in place of its items, and choosing one sets the priority, closes the menu and offers Undo

#### Scenario: Go back from a submenu
- **WHEN** the Date submenu of the Actions menu is open and the user presses Escape
- **THEN** the menu's items come back with focus on "Date…", and a second Escape closes the menu

#### Scenario: The menu fits a laptop screen
- **WHEN** the user right-clicks a task row in the middle of a 1280 × 720 window
- **THEN** the whole Actions menu is visible at once, without scrolling
