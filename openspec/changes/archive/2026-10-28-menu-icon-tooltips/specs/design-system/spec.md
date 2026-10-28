## MODIFIED Requirements

### Requirement: Tooltip primitive
The client SHALL offer one tooltip that opens on hover after 400 ms and on focus at once, shows a label and an optional shortcut, closes on Escape and blur, is announced as the control's description, and does not open on touch (the accessible name still applies). Icon-only buttons SHALL use it by default, including a button that opens a menu. The native `title` attribute SHALL not be used in screens; a lint SHALL fail on it.

#### Scenario: Keyboard user sees the hint
- **WHEN** a keyboard user focuses the notifications button
- **THEN** a tooltip reading "Notifications" appears at once and leaves on blur

#### Scenario: Icon-only menu button
- **WHEN** a pointer rests on a list's Filter button or a page header's More actions button
- **THEN** after 400 ms a tooltip shows the button's name, while a menu button that shows its name as text gets no tooltip

#### Scenario: Native title in a screen
- **WHEN** a change adds `title=` to a button under the app folder
- **THEN** the lint fails naming the file and line
