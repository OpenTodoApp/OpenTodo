# Spec Delta

## ADDED Requirements

### Requirement: Illustration set
The client SHALL provide, in the illustration style, the named illustrations `inbox-zero`, `today-clear` (a mug with steam and a small sun), `week-clear` (seven small squares on a baseline, the first raised), `project-new` (an open box with its lid back and a pencil on its edge), `day-done` (a closed notebook under a crescent moon) and `trash-empty` (a bin with its lid resting on top and one leaf beside it). The empty Today, the empty Upcoming, a project with no open task, Done for today and the empty Trash SHALL show the matching one above their sentence. Each SHALL follow every rule of "Illustrations" (tokens only, one stroke, one accent shape at low opacity, 160 by 120 px, at most 4 KB, decorative, light and dark, every colour theme, no animation under reduced motion) and SHALL have a story in the workbench in both themes. A view SHALL name an illustration from this set only; naming an unknown one SHALL fail the type check.

#### Scenario: Empty Today
- **WHEN** Today has no task on any device
- **THEN** the `today-clear` drawing is shown above "Nothing due today." in the muted text colour, with the sun in the theme's accent at low opacity, and a screen reader reads only the sentence and the action

#### Scenario: Every theme
- **WHEN** the user switches to the dark theme and then to the violet colour theme while the empty Trash is shown
- **THEN** the bin's strokes follow the muted text colour and the leaf follows the new accent, with no colour left from before

#### Scenario: Style gate on the set
- **WHEN** a contributor adds a sixth drawing with a gradient or over 4 KB of markup
- **THEN** `make ui-lint` fails naming the file

### Requirement: Toast primitive
The client SHALL show at most one toast at a time, in the toast region (bottom centre on phones, bottom right from 640 px up, clear of the home indicator and the on-screen keyboard); a new toast SHALL replace the previous one. A toast SHALL hold one sentence naming what happened, written as the result ("3 tasks rescheduled", "Moved to Home"), and at most two controls, Undo first when the action can be undone. It SHALL stay five seconds after one task's action and ten after a batch; the timer SHALL pause while the pointer is over the toast or focus is inside it and restart when both leave. Tab SHALL reach its controls; focus SHALL never move into a toast on its own; `Ctrl`/`⌘`+`Z` outside a text field SHALL activate Undo while the toast shows. The toast SHALL be announced politely to assistive technology. A toast SHALL never cover the element that has focus: while a toast is shown, the content column SHALL keep the focused element above the toast's height, and from 640 px up, when the region would overlap the focused element, the toast SHALL move to the opposite corner. Under reduced motion a toast SHALL only fade. Toasts are device interface state and write nothing.

#### Scenario: Pause on hover
- **WHEN** a batch toast has shown for eight seconds and the user moves the pointer onto it and reads for ten seconds
- **THEN** the toast stays, and leaves two seconds after the pointer leaves

#### Scenario: Focused row stays visible
- **WHEN** the user completes the last row of a long list on a phone and a toast appears
- **THEN** the next row, now focused, is fully visible above the toast, and the list scrolls only as far as that needs

#### Scenario: Replacement
- **WHEN** the user completes one task and two seconds later deletes another
- **THEN** one toast reads "Deleted · Undo", the completion's offer is gone, and `Ctrl+Z` undoes the deletion

#### Scenario: Keyboard
- **WHEN** a toast with Undo and Open is shown and the user presses Tab
- **THEN** focus moves to Undo, Tab again moves to Open, Enter activates the focused control, and the toast did not take focus by itself

#### Scenario: Reduced motion
- **WHEN** the system prefers reduced motion and a toast appears and leaves
- **THEN** it only fades in and out, with no movement
