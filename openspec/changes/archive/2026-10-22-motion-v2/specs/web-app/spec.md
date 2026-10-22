## ADDED Requirements

### Requirement: Overlay motion
Each overlay kind SHALL enter and leave with a fixed motion: a dialog from 640 px up fades and scales up slightly within the emphasis duration and leaves in about three quarters of it; a phone sheet slides up within the emphasis duration and slides down in about three quarters of it; the task panel slides in from its edge within the emphasis duration when opened from closed and slides out in about three quarters of it, and switching the task it shows SHALL NOT replay the slide; a toast slides up within the emphasis duration and fades out; menus, popovers, tooltips and the command palette fade in within the interface duration and close at once. Entrances SHALL use the spring ease-out; an overlay SHALL accept input from its first frame; focus SHALL move as "Consistent overlay behaviour" requires regardless of motion. Under reduced motion every overlay fades only; under no motion it appears and disappears at once.

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
