## ADDED Requirements

### Requirement: Hover and focus follow the input in use
A hover look SHALL only apply on a device whose pointer can hover. A focus ring SHALL be drawn when focus comes from a keyboard, a mouse or a trackpad, or from assistive technology, and SHALL NOT be drawn when focus comes from a tap. A field focused by a tap SHALL still show that it is focused by its border and caret. It changes no data, so offline behaviour and convergence are unaffected.

#### Scenario: A tap on a switch
- **WHEN** a person taps a switch on a phone
- **THEN** the switch changes and no focus ring or hover look stays on it

#### Scenario: Tab after taps
- **WHEN** a person who has been tapping presses Tab on an iPad's hardware keyboard
- **THEN** the focused control shows its focus ring
