# Spec Delta

## MODIFIED Requirements

### Requirement: Microphone for voice capture
The Android shell SHALL declare `RECORD_AUDIO`, and `MODIFY_AUDIO_SETTINGS`, without which the web view opens no microphone, and SHALL ask for it the first time the web app records, and not before. Each shell SHALL grant audio capture only when the asking frame is a page of the configured server (on iOS, the top-level page too), so a frame of another site embedded in the server's page is refused, and SHALL NOT grant the camera from that request; where the web view decides a request as a whole (iOS), a request that also asks for the camera SHALL be refused. A page of another origin SHALL be refused without a prompt, and the iOS shell SHALL grant the server's page without WebKit's own prompt, iOS asking only once for the app's microphone. The first-run sign-in screen SHALL refuse every capture request. Both shells' decisions SHALL be checked against one fixture, `mobile/android/app/src/test/resources/microphone/cases.json`. The microphone feature SHALL NOT be required, so a device without one can still install the app. The web app SHALL ask the shell before it records when the shell lists the `microphone` capability, and SHALL keep today's behaviour when it does not.

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

#### Scenario: Another origin on iOS
- **WHEN** a sign-in provider's page loaded in the iPhone app asks for the microphone
- **THEN** the app refuses and nobody is asked

#### Scenario: Another site's frame in the server's page
- **WHEN** a frame of another site embedded in the server's page asks for the microphone
- **THEN** the shell refuses, without a prompt

#### Scenario: The server's page on iOS
- **WHEN** the person has allowed the iPhone app the microphone and taps the microphone in Quick Add
- **THEN** the page records, with no further prompt from the web view
