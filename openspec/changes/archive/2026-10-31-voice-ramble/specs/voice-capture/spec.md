## ADDED Requirements

### Requirement: Long dictation into the assistant composer
Where the assistant is available to the user and voice capture is switched on for the device, the composer of the Assistant page and of the assistant panel SHALL offer a microphone button that records a ramble with the recogniser chosen for the device ("This browser" or "This server's speech service") and the statement already confirmed for it. Recognition SHALL be continuous: it SHALL stop on the button, on Escape, after 8 seconds of silence or after 5 minutes, whichever comes first, and SHALL show the elapsed time against the 5-minute limit. Interim and final text SHALL appear in the composer's field, SHALL stay editable, and SHALL NOT be normalised into quick-add tokens. With the server's speech service, the recording SHALL be sent to the transcription route in pieces cut at pauses and at 55 seconds at the latest, in order, each within that route's limits, and the pieces' text SHALL be joined in order. Nothing SHALL be sent to the assistant until the user sends the message. When a piece fails, the text recognised so far SHALL stay, listening SHALL stop and the composer SHALL say that the speech service did not answer or that the limit was reached. Quick add's dictation is unchanged. No audio or transcript SHALL be stored by the client or the server; the transcript exists only in the composer until sent, and then only as the conversation's message on the device.

#### Scenario: A ramble becomes editable text
- **WHEN** a user with the assistant and voice capture on taps the composer's microphone, speaks for two minutes about errands and work items, and taps Stop
- **THEN** the composer's field holds the whole transcript, the user can edit it, and no request reaches the assistant until they send

#### Scenario: Five-minute limit
- **WHEN** the user keeps speaking past 5 minutes
- **THEN** listening stops at 5:00, the status says the limit was reached, and the text so far stays in the field

#### Scenario: Pieces through the server's speech service
- **WHEN** the device uses "This server's speech service" and the user speaks for 2 minutes 30 seconds without long pauses
- **THEN** at least three pieces of at most 55 seconds each are sent to the transcription route one after another, and the field shows their text in the order spoken

#### Scenario: Service fails in the middle
- **WHEN** the third piece answers `stt_unavailable`
- **THEN** the text of the first two pieces stays in the field, listening stops, and the composer says the speech service did not answer

#### Scenario: Voice capture off
- **WHEN** voice capture is switched off on the device or the browser has no speech recognition
- **THEN** the composer shows no microphone button and typing, pasting and photos work as before

#### Scenario: Offline with browser recognition that needs a network
- **WHEN** the device is offline and the browser's recognition needs a network service
- **THEN** the microphone says voice capture is unavailable right now and the composer keeps its text

#### Scenario: Keyboard
- **WHEN** focus is on the composer's microphone button and the user presses Enter, speaks, then presses Escape
- **THEN** listening starts and is announced as "Listening", then stops and is announced as "Stopped", and focus returns to the field with the caret at the end
