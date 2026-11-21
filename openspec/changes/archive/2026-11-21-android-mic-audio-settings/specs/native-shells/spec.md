# Spec Delta

## MODIFIED Requirements

### Requirement: Microphone for voice capture
The Android shell SHALL declare `RECORD_AUDIO`, and `MODIFY_AUDIO_SETTINGS`, without which the web view opens no microphone, and SHALL ask for it the first time the web app records, and not before. It SHALL grant audio capture only to a page of the configured server, and SHALL NOT grant the camera from that request. A page of another origin SHALL be refused without a prompt. The microphone feature SHALL NOT be required, so a device without one can still install the app. The web app SHALL ask the shell before it records when the shell lists the `microphone` capability, and SHALL keep today's behaviour when it does not.

#### Scenario: First dictation
- **WHEN** the person taps the microphone in the Android app and has not allowed it
- **THEN** Android asks for the microphone, and allowing it lets the page record

#### Scenario: Another origin
- **WHEN** a page of another origin loaded in the shell asks for the microphone
- **THEN** the shell refuses and Android does not ask

#### Scenario: Already allowed
- **WHEN** the person has already allowed the microphone and taps it again
- **THEN** Android does not ask again and the page records

#### Scenario: Server speech service in the app
- **WHEN** the person has allowed the microphone, chose **This server's speech service** and taps the microphone in Quick Add
- **THEN** Android shows its microphone indicator and the page records, as in Chrome on the same phone
