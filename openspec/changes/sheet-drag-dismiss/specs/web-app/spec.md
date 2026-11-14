# Spec Delta

## ADDED Requirements

### Requirement: A bottom sheet is dragged away
Every bottom sheet (a menu, popover or picker below 640 px, and a dialog shown as a bottom sheet) SHALL follow a finger that moves down from its handle or its header, and from its body while no content between the finger and the sheet is scrolled away from its top; a drag that starts on scrolled content, in a text field or on an element with a drag of its own SHALL scroll or act as it does without the sheet, and a drag that starts sideways or upward SHALL NOT move the sheet. The sheet SHALL never move above its resting place. Released more than 80 px below where the drag began, or released in a downward flick, the sheet SHALL close; released earlier it SHALL return to its place with the spring ease within the emphasis duration. A dialog shown as a bottom sheet SHALL show the same drag handle as a menu sheet. A dialog that does not close on a tap outside SHALL NOT close on a drag, SHALL NOT move and SHALL show no handle, so one rule decides both. Under reduced motion and under no motion the sheet SHALL NOT move with the finger: it closes when released past the same distance or flick and otherwise stays. Closing by a drag SHALL be the same close as the close control: focus returns to the trigger, the page behind stays where it was and, on a touch device, the overlay's history entry is removed, so a later Back navigates. The close control, Escape, a tap outside and Back SHALL keep working, and a dialog that fills the phone's screen SHALL NOT be dragged. The gesture is device interface state: it writes no data, works offline and syncs nothing.

#### Scenario: The bulk actions sheet follows the finger
- **WHEN** a user on a 360 px phone opens the bulk actions and drags its handle 140 px down
- **THEN** the sheet moves down with the finger, and on release it closes and focus is back on the button that opened it

#### Scenario: A short drag springs back
- **WHEN** the user drags a sheet's header 40 px down slowly and lifts the finger
- **THEN** the sheet returns to its place and stays open

#### Scenario: A flick closes
- **WHEN** the user flicks a sheet's handle 60 px down
- **THEN** the sheet closes

#### Scenario: Scrolled content scrolls
- **WHEN** the notifications sheet is scrolled down and the user drags down on its list
- **THEN** the list scrolls back toward its top and the sheet does not move; a drag on its header still moves the sheet

#### Scenario: A dialog sheet
- **WHEN** the start guide is open on a phone and the user drags its header past 80 px and lets go
- **THEN** it closes exactly as its close button closes it

#### Scenario: A sheet that ignores a tap outside
- **WHEN** a dialog that ignores a tap outside is shown as a bottom sheet and the user drags its header 200 px down
- **THEN** it has no handle, does not move and stays open

#### Scenario: Reduced motion
- **WHEN** reduced motion is requested and the user drags a sheet's handle 120 px down and lets go
- **THEN** the sheet does not move during the drag and closes on release; after a 40 px drag it stays

#### Scenario: Back after a drag
- **WHEN** the user drags a sheet away on an Android phone and then presses Back
- **THEN** Back navigates to the previous page and does not reopen the sheet

#### Scenario: A full-screen dialog
- **WHEN** a dialog fills the phone's screen and the user drags its title bar down
- **THEN** it does not move and stays open

## MODIFIED Requirements

### Requirement: Overlay motion
Each overlay kind SHALL enter and leave with a fixed motion: a dialog from 640 px up fades and scales up slightly within the emphasis duration and leaves in about three quarters of it; a phone sheet slides up within the emphasis duration and slides down in about three quarters of it; the task panel slides in from its edge within the emphasis duration when opened from closed and slides out in about three quarters of it, and switching the task it shows SHALL NOT replay the slide; a toast slides up within the emphasis duration and fades out; menus, popovers, tooltips and the command palette fade in within the interface duration and close at once. A bottom sheet closed by a drag, a menu's sheet included, SHALL leave from where the finger left it, sliding down and fading in about three quarters of the emphasis duration, and SHALL NOT jump back to its place first. Entrances SHALL use the spring ease-out; an overlay SHALL accept input from its first frame; focus SHALL move as "Consistent overlay behaviour" requires regardless of motion. Under reduced motion every overlay fades only; under no motion it appears and disappears at once.

#### Scenario: Dialog on a desktop
- **WHEN** the user opens the share dialog at 1280 px
- **THEN** the dialog fades in and scales from slightly smaller to its size within 250 ms and its first field has focus before the animation ends

#### Scenario: Panel switches tasks without replaying
- **WHEN** the task panel is open on one task and the user presses the open key on another row
- **THEN** the panel's content changes with no slide

#### Scenario: Menu closes at once
- **WHEN** the user picks an item in a row menu
- **THEN** the menu disappears with no exit animation and the action's effect is visible immediately

#### Scenario: Reduced motion
- **WHEN** reduced motion is requested and the user opens a phone sheet
- **THEN** the sheet fades in with no slide and closes with a fade

#### Scenario: A sheet dragged away
- **WHEN** the user drags a menu's sheet 140 px down on a phone and lets go
- **THEN** the sheet slides on down and fades from where it was released
