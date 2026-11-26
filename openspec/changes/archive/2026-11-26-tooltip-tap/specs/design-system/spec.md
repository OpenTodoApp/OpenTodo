# Spec Delta

## MODIFIED Requirements

### Requirement: Tooltip primitive
The client SHALL offer one tooltip that opens on hover after 400 ms and on keyboard focus at once, shows a label and an optional shortcut, closes on Escape and blur, is announced as the control's description, and does not open on touch on a control (the accessible name still applies). On a device whose primary pointer is coarse, a tooltip on an element that is not a control and is not inside one (a word, a time, a badge) SHALL open at once on a tap of that element, since the tap would otherwise do nothing and the text can be read no other way there; it SHALL close on a second tap of the element, on a press anywhere else, on a scroll, on Escape and on blur. A control is a link, a button, a form field, or an element with the role of one. Focus SHALL open the tooltip only when the page's last input before it was a key press, or when there has been no press yet; focus that follows a press of a finger, a mouse or a pen SHALL NOT open it, whether it arrives while the press is held, after it is released, or later when a closing surface returns focus to the control. On a device whose primary pointer is coarse, a key press SHALL count only when an on-screen keyboard cannot make it (a key outside a text field, a chord with Ctrl, Alt or Meta, Tab or Escape). A control's accessible name SHALL NOT depend on its tooltip. Icon-only buttons SHALL use it by default, including a button that opens a menu. The native `title` attribute SHALL not be used in screens; a lint SHALL fail on it. This is presentation only: it reads and writes no data and behaves the same offline.

#### Scenario: Keyboard user sees the hint
- **WHEN** a keyboard user focuses the notifications button
- **THEN** a tooltip reading "Notifications" appears at once and leaves on blur

#### Scenario: Icon-only menu button
- **WHEN** a pointer rests on a list's Filter button or a page header's More actions button
- **THEN** after 400 ms a tooltip shows the button's name, while a menu button that shows its name as text gets no tooltip

#### Scenario: Native title in a screen
- **WHEN** a change adds `title=` to a button under the app folder
- **THEN** the lint fails naming the file and line

#### Scenario: Tap on a phone
- **WHEN** the user taps the sync dot in the drawer on a 360 px touch screen, or holds a finger on it and lifts it
- **THEN** the button has focus and no tooltip appears, at once or later

#### Scenario: Tap a word that explains itself
- **WHEN** on a touch phone a person taps "(pending)" beside an entry of Updates, which is text with a tooltip and not a control
- **THEN** the tooltip "Not yet synced" appears at once, and a tap elsewhere or a scroll closes it

#### Scenario: A tooltip inside a button
- **WHEN** on a touch phone a person taps a badge with a tooltip that sits inside a button
- **THEN** the button does what it does and no tooltip appears

#### Scenario: Focus returned after a tap
- **WHEN** the user taps a button that opens a sheet and closes the sheet with a tap, so focus returns to the button
- **THEN** no tooltip appears

#### Scenario: Click, then Tab
- **WHEN** a mouse user clicks an icon button, then presses Tab and Shift+Tab
- **THEN** the click shows no tooltip and the focus that returns with Shift+Tab shows it at once

#### Scenario: Keyboard attached to a tablet
- **WHEN** the user of a touch tablet with a keyboard presses Tab until an icon button has focus
- **THEN** its tooltip appears at once
