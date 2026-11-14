# Spec Delta

## ADDED Requirements

### Requirement: Keyboard hints only where a key can be pressed
The app SHALL show shortcut key badges and lines that only name keys (such as "Enter toggles or creates · Esc closes") only on a device where a key can be pressed. A device counts as such when it has a fine pointer or a pointer that hovers (a mouse, a trackpad, a hovering pen: every computer, and a phone or tablet with one attached), or once the page has received a key press that an on-screen keyboard cannot make: a key pressed outside a text field, a chord with Ctrl, Alt or Meta, or Tab or Escape. On any other device (a phone or tablet used by touch alone) no badge and no keys-only line SHALL be shown, in menus, sheets, buttons, tooltips, the command palette, fields and prompts, whatever the "Show shortcut hints" preference says.

A hidden hint SHALL leave no empty gap, no separator and no "then" or "or" behind. The change SHALL apply without a reload when a pointer is attached or the first such key is pressed, and SHALL last until the page is closed or reloaded; nothing is stored, so it needs no network, changes no task data and syncs nothing.

The cheat sheet and the keyboard guide in Help are reference and SHALL list their keys on every device. A key named inside a sentence that says something else too SHALL stay, so the sentence stays whole. A control's shortcut SHALL stay exposed to assistive technology (`aria-keyshortcuts` and the accessible description) on every device.

#### Scenario: A task's menu on a phone
- **WHEN** the user opens a task's actions sheet on a phone with nothing attached
- **THEN** Complete, Labels and Move to trash show no key badge, and each label runs to the edge of its row

#### Scenario: The same menu on a computer
- **WHEN** the user opens a task's menu on a computer
- **THEN** Complete shows `c`, Labels `Shift+L` and Move to trash `Delete / Backspace`, as before

#### Scenario: A picker's hint line
- **WHEN** the label picker opens on a phone with nothing attached
- **THEN** the line "Enter toggles or creates · Esc closes" is not shown and the dialog has no empty line in its place

#### Scenario: A search field
- **WHEN** the user opens Settings on a phone with nothing attached
- **THEN** the search field shows no `/`

#### Scenario: A keyboard without a pointer
- **WHEN** the user of a tablet with a keyboard case and no trackpad presses `j` in a list or Tab in a dialog
- **THEN** the badges and hint lines appear at once and stay until the app is closed or reloaded

#### Scenario: Typing on the on-screen keyboard
- **WHEN** the user types a title and taps Enter on the phone's on-screen keyboard
- **THEN** no badge or hint line appears

#### Scenario: A mouse or trackpad attached
- **WHEN** the user attaches a keyboard with a trackpad to a tablet while a menu is open
- **THEN** the menu shows its key badges without a reload

#### Scenario: A touch laptop
- **WHEN** the app runs on a laptop with a touch screen
- **THEN** badges and hint lines are shown, whichever input the user last used

#### Scenario: The cheat sheet on a phone
- **WHEN** the user opens the keyboard shortcuts sheet on a phone with nothing attached
- **THEN** every row lists its keys

#### Scenario: A screen reader with a keyboard
- **WHEN** a screen reader user moves to Complete in a task's menu on a tablet before pressing any key the app can see
- **THEN** the item still announces its shortcut `c`

#### Scenario: Offline
- **WHEN** the device is offline
- **THEN** hints are hidden and shown by the same rules, since nothing is fetched or stored
