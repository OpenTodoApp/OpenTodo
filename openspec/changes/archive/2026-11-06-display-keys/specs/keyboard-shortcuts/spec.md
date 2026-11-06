# Spec Delta

## ADDED Requirements

### Requirement: Group and order keys
In a project's list (List layout), on a label's page and in a saved view, the client SHALL offer key sequences that change the list's Display options: `r g` followed by `s` (Section), `j` (Project), `n` (None), `d` (Due date), `p` (Priority) or `l` (Label) SHALL set Group by; `r o` followed by `m` (Manual order), `p` (Priority), `d` (Due date), `c` (Created), `l` (Deadline) or `t` (Title) SHALL set Order by; `r r` SHALL switch the direction between ascending and descending. A sequence SHALL work only where the page's panel offers that choice and SHALL do nothing elsewhere, including Today, Upcoming, the New view page and a project's board, timeline and calendar layouts. The keys SHALL write the same setting as the panel, through the same operations, so the change works offline, reaches the user's other devices with sync and converges by last-writer-wins per field. After each sequence the client SHALL show a notice with the setting now in effect, in the panel's words, in a live region read by screen readers. The keys SHALL NOT fire while a text field has focus, SHALL NOT fire while single-key shortcuts are turned off, and SHALL keep working with Vim keybindings on. The `?` sheet and the keyboard guide SHALL list them under "Group and order", generated from the registry.

#### Scenario: Group a project by priority
- **WHEN** the user presses `r`, `g`, `p` in the list of the project "Home"
- **THEN** the list is grouped by priority, the notice reads "Group by: Priority", and the project's stored grouping is Priority, as if chosen in the panel

#### Scenario: Order, then reverse
- **WHEN** the user presses `r o p` and then `r r` in a saved view, before the list has redrawn
- **THEN** the view is ordered by priority, descending, with priority 1 first, and the notice reads "Order by: Priority · Descending (p1 first)"

#### Scenario: A choice the page does not offer
- **WHEN** the user presses `r g s` on a label's page
- **THEN** nothing changes and nothing is announced, and `r g j` groups the page by project

#### Scenario: Offline
- **WHEN** the device is offline and the user presses `r g d` in a project
- **THEN** the list is grouped by due date at once, the change is queued, and the user's other devices show the same grouping after they sync

#### Scenario: While typing
- **WHEN** focus is in the quick add field and the user types `rgp`
- **THEN** the letters are typed and the grouping is unchanged

#### Scenario: With Vim keybindings
- **WHEN** Vim keybindings are on and the user presses `r o d` in a project
- **THEN** the list is ordered by due date, and no quick add opens and nothing is deleted

#### Scenario: Elsewhere
- **WHEN** the user presses `r g p` on Today
- **THEN** nothing happens

## MODIFIED Requirements

### Requirement: Sequence spotlight
When the user presses the first key of a registered sequence outside a text field and no second key follows within 250 ms, the client SHALL open a small dialog in the centre of the screen. The dialog SHALL show the pressed key as a keycap followed by "+", the instruction "Press a key", and the sequences that can complete in the scopes active right now, each as its second key and its short label, grouped. For a sequence of three keys the dialog SHALL list its next key with the name of that step ("g Group by"), and after that key it SHALL show both pressed keys and the choices that can complete it. While the dialog is open, the pending sequence SHALL NOT expire. Pressing a listed key, or clicking a listed entry, SHALL run that shortcut, or continue the sequence for a step, and close the dialog once a shortcut runs. Esc, the dialog's close button, a click outside it, or a key that completes no sequence SHALL close it without running anything and return focus to where it was. A second key pressed within 250 ms SHALL run its shortcut without the dialog ever showing.

#### Scenario: Hesitating after g
- **WHEN** the user presses `g` on the Today view and waits half a second
- **THEN** a dialog in the centre of the screen shows "g +", "Press a key" and, among others, "t Today", "i Inbox" and "u Upcoming"

#### Scenario: Completing from the spotlight
- **WHEN** the spotlight for `g` is open and the user presses `u`, even three seconds after `g`
- **THEN** Upcoming opens and the spotlight closes

#### Scenario: Cancelling with Esc
- **WHEN** the spotlight is open over a list with the task panel open and the user presses Esc
- **THEN** the spotlight closes, the task panel stays open, nothing else runs, and focus returns to where it was before `g`

#### Scenario: Cancelling with the mouse
- **WHEN** the spotlight is open and the user clicks its close button or anywhere outside it
- **THEN** it closes and no shortcut runs

#### Scenario: Fluent typing never shows it
- **WHEN** the user types `g` and `t` 150 ms apart
- **THEN** Today opens and no spotlight is shown at any moment

#### Scenario: A key that completes nothing
- **WHEN** the spotlight for `g` is open and the user presses `z`, which completes no sequence
- **THEN** the spotlight closes and nothing else happens

#### Scenario: Only what is available
- **WHEN** the assistant is turned off on the server and the user hesitates after `g`
- **THEN** the spotlight does not list `k` (Ask)

#### Scenario: Vim's gg
- **WHEN** Vim keybindings are on and the user hesitates after `g` in a list
- **THEN** the spotlight lists "g First task" with the go-to entries, and pressing `g` selects the first task

#### Scenario: Not while typing
- **WHEN** focus is in the quick add field and the user types `g`
- **THEN** the letter is typed and no spotlight opens

#### Scenario: Three keys
- **WHEN** the user presses `r` in a project's list and waits
- **THEN** the spotlight lists "g Group by", "o Order by" and "r Reverse order"; after `g` it shows "r g +" and lists Section, None, Due date, Priority and Label, and not Project
