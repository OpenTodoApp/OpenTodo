## ADDED Requirements

### Requirement: Back closes the open overlay on a touch device
On a device with a coarse pointer, the system Back SHALL close the topmost open overlay (a dialog, a menu, a popover, a sheet, the command palette, the assistant panel, a help panel or the phone drawer) and SHALL leave the page underneath on its address, instead of navigating behind the overlay. Each open overlay SHALL own one history entry at the address it was opened from, numbered by its place in the overlay stack; a second Back SHALL then navigate as it would with no overlay open. Back SHALL close the overlays one at a time, the topmost first, and overlays that close together (a dialog and the dialog over it, or a single action that closes two) SHALL remove their entries together so no marker remains. Closing an overlay with its own control, Escape or a tap outside SHALL remove its entry as well, so a later Back navigates and never reopens a stale marker. A navigation made while an overlay is open SHALL take the overlay's entry, so Back returns to the page the overlay was opened from. With a fine pointer the browser's Back SHALL keep navigating and SHALL NOT be used to close overlays. The entries are device interface state: they are never written to the server or synced.

#### Scenario: Back closes a dialog
- **WHEN** a user on a phone opens a dialog from a list and presses the system Back
- **THEN** the dialog closes, no task behind it opens, and the list keeps its address, scroll position and focus

#### Scenario: Two overlays close one at a time
- **WHEN** a dialog is open over a list and a second dialog opens over it, and the user presses Back twice
- **THEN** the second dialog closes on the first Back, the first closes on the second, and the list stays shown

#### Scenario: A closed overlay leaves no entry
- **WHEN** the user closes a sheet with its close button and then presses Back
- **THEN** Back navigates to the previous page and does not reopen the sheet

#### Scenario: The phone drawer closes on Back
- **WHEN** the user opens the phone drawer on a 390 px phone and presses the system Back
- **THEN** the drawer closes and the page it was opened from stays on screen

#### Scenario: A destination chosen in the drawer keeps the page behind it
- **WHEN** the user opens the drawer from Today, taps a project and then presses Back
- **THEN** the project opens with no marker left over, and Back returns to Today

#### Scenario: A mouse keeps the browser's Back
- **WHEN** a user with a mouse or trackpad opens a dialog and presses the browser's Back
- **THEN** the browser navigates and the dialog is not what closed
