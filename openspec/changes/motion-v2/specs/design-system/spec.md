## MODIFIED Requirements

### Requirement: Reduced motion
Interface transitions SHALL use one of three durations: 120 ms for interface feedback, 250 ms for emphasis, and one 400 ms *moment* reserved for the completion sequence, list reflow and overlay entrances; nothing SHALL last longer than 400 ms and no exit SHALL last longer than its entrance. Movement SHALL use an ease-out curve without overshoot (`--ease-spring`) or the calm ease; nothing SHALL bounce. When the system requests reduced motion, the app SHALL replace every movement, scale and height animation with an instant change or an opacity or colour fade of at most 120 ms, and SHALL skip view transitions. Under the no-motion attribute every transition and animation SHALL be instant, colour and opacity included.

#### Scenario: Completing a task with reduced motion
- **WHEN** reduced motion is requested and the user completes a task
- **THEN** the check mark changes state without a scale animation, the row's opacity fades within 120 ms and the rows below take their new places at once

#### Scenario: Nothing longer than a moment
- **WHEN** any sequence in the app is measured
- **THEN** no transition or animation is declared longer than 400 ms and every exit is shorter than or equal to its entrance

#### Scenario: Reduced motion skips view transitions
- **WHEN** reduced motion is requested and a reschedule moves three rows to another group
- **THEN** no view transition starts and the list shows its new order at once

## ADDED Requirements

### Requirement: Motion sequences in the workbench
The workbench SHALL have a Foundations motion story set showing the completion sequence on a row and on a card, the repeating-task completion, a list reflow and each overlay entrance, each playable with a control, in both themes. An automated check in the interface check SHALL open these stories with reduced motion emulated and fail if any running animation changes `transform`, `height`, `width` or `translate`, and SHALL open them with the no-motion attribute and fail if any animation runs at all.

#### Scenario: A movement sneaks past reduced motion
- **WHEN** a contributor adds a 200 ms slide to a toast without a reduced-motion rule and runs the interface check
- **THEN** the check fails naming the story and the animated property

#### Scenario: Stories render in both themes
- **WHEN** the motion stories are opened in light and in dark
- **THEN** every sequence plays and the accessibility gate passes on each story
