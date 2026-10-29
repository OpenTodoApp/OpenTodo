# Spec Delta

## ADDED Requirements

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
