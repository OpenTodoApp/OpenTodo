## ADDED Requirements

### Requirement: A fact is never only in a control's tooltip
A tooltip does not open on a tap on a control. Whatever the tooltip of a control (a button, a link, a menu trigger), or of an element inside one, says beyond the control's name and its keyboard shortcut SHALL also be readable with a coarse pointer: inside what the control opens (a dialog, a popover, a menu or its sheet), or as text beside or under the control. The tooltip SHALL stay for a mouse and for keyboard focus, and the same words SHALL be used in both places. Showing the fact SHALL NOT add a tap target smaller than 44 px beside the control, and SHALL NOT change the height of a list row. This is presentation only: it reads the rows the screen already reads, writes no data, and behaves the same offline.

In particular:
- A label marked **duplicate** SHALL say what that means and what to do under **Merge into** in the label's menu.
- The details of a calendar event that can be deleted but not changed SHALL say why it cannot be changed.
- The menu of a projected occurrence of a series with more occurrences in the range than the view draws SHALL be headed by the note that says so, and the occurrence's accessible name SHALL include it.
- Without a fine pointer, the repeat editor SHALL say under **Skip** and **This occurrence only** what each does.
- The menu of an origin chip that is not a link SHALL be titled with the origin page's title when it has one.
- A reaction listed in a comment's reaction menu SHALL name who chose it.

#### Scenario: A duplicate label in the drawer
- **WHEN** two labels are named "Errand" and the user opens the menu of one of them in the phone's drawer
- **THEN** **Merge into** shows "Another label has this name. Merge them from the menu or the banner on the labels page." under its name

#### Scenario: An event of a calendar that only allows deleting
- **WHEN** the user taps an event that can be deleted but not changed
- **THEN** its details show "This calendar is read-only" above **Delete**

#### Scenario: A daily task in a long range
- **WHEN** a daily task has more than 31 occurrences in the range the view shows and the user long-presses one of them on a phone
- **THEN** the menu is headed "Showing the next 31 occurrences"

#### Scenario: Skip on a phone
- **WHEN** the user opens the repeat editor of a repeating task on a phone
- **THEN** a line under the buttons reads "⤼ Skip · Move to the next occurrence without completing", and a second one says what **This occurrence only** does

#### Scenario: Skip with a mouse
- **WHEN** the user rests the pointer on **Skip** on a computer
- **THEN** the tooltip says what it does with its shortcut, and no line is drawn under the buttons

#### Scenario: Who reacted
- **WHEN** Ana and the user chose the heart on a comment and the user opens the comment's **More actions** on a phone
- **THEN** **Heart** is ticked and shows "Ana, You" under its name

#### Scenario: Offline
- **WHEN** the device is offline
- **THEN** each of these shows the same words, from local data
