# Spec Delta

## MODIFIED Requirements

### Requirement: Opt-in per device
Voice capture SHALL request no microphone permission until the user activates it. When the browser offers speech recognition, quick add SHALL show a microphone button; its first activation on a device SHALL explain that speech is processed by the browser and ask to continue before any permission prompt. Settings → Capture SHALL offer a switch, stored only on the current device and never synced, that hides the button. When the browser offers no speech recognition no button SHALL be shown and the switch SHALL be disabled with an explanation.

#### Scenario: Default state
- **WHEN** a user opens the app on a new device in a browser with speech recognition
- **THEN** quick add shows the microphone button and the browser has not asked for microphone permission

#### Scenario: First activation
- **WHEN** the user activates the microphone button for the first time on a device
- **THEN** a note explains where speech is processed and offers Continue or Cancel, and only Continue leads to the browser's permission prompt

#### Scenario: Browser without recognition
- **WHEN** Settings is opened in a browser that offers no speech recognition
- **THEN** the switch is disabled and a note explains that this browser does not provide speech recognition

#### Scenario: Hidden by the switch
- **WHEN** the user turns the switch off
- **THEN** quick add shows no microphone button on this device and `Shift+V` does nothing
