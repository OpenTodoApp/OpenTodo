# Spec Delta

## MODIFIED Requirements

### Requirement: Live preview chips
While the user types, the client SHALL show one chip per recognised attribute (due, project, label, priority, estimate) below the input and the title as it will be saved. The preview SHALL update on every keystroke without noticeable delay and SHALL be announced to assistive technology without stealing focus. A link to the quick add guide SHALL appear beside the chips during the first three uses of quick add on a device and in the input's tooltip afterwards; no shortcut badge SHALL be printed in the input unless shortcut hints are on.

#### Scenario: Chips appear as tokens are typed
- **WHEN** the user has typed `Buy milk tomorrow p2`
- **THEN** a due chip reading tomorrow's date and a priority chip reading `P2` are shown, and the title preview reads `Buy milk`

#### Scenario: Chips disappear when text changes
- **WHEN** the user deletes `p2` from the line
- **THEN** the priority chip disappears and the task would be created with priority 4

#### Scenario: Guide link fades out
- **WHEN** the user has added four tasks on this device
- **THEN** the guide link is no longer shown beside the chips and is available from the input's tooltip and the Help action
