## MODIFIED Requirements

### Requirement: Toast primitive
The client SHALL show at most one toast at a time, in the toast region (bottom centre on phones, bottom right from 640 px up, clear of the home indicator and the on-screen keyboard); a new toast SHALL replace the previous one. A toast SHALL hold one sentence naming what happened, written as the result ("3 tasks rescheduled", "Moved to Home"), at most two controls, Undo first when the action can be undone, and a close button that dismisses it. It SHALL stay five seconds after one task's action and ten after a batch; after Undo it SHALL show the result ("Undone.") for five seconds and then leave; the timer SHALL pause while the pointer is over the toast or focus is inside it and restart when both leave, and a control that disappears while it has focus SHALL not keep the toast paused. Tab SHALL reach its controls; focus SHALL never move into a toast on its own; `Ctrl`/`⌘`+`Z` outside a text field SHALL activate Undo while the toast shows; Escape with focus inside the toast SHALL dismiss it and return focus to where it was before. The toast SHALL be announced politely to assistive technology. A toast SHALL never cover the element that has focus: while a toast is shown, the content column SHALL keep the focused element above the toast's height, and from 640 px up, when the region would overlap the focused element, the toast SHALL move to the opposite corner. Under reduced motion a toast SHALL only fade. Toasts are device interface state and write nothing.

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

#### Scenario: The result of Undo leaves
- **WHEN** the user completes a task, clicks Undo in the toast and moves the pointer away
- **THEN** the toast reads "Undone." and leaves five seconds later

#### Scenario: Dismiss
- **WHEN** a toast is shown and the user activates its close button, or tabs into it and presses Escape
- **THEN** the toast leaves at once, and after Escape focus is back on the element that had it before
