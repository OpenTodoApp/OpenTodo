# voice-capture Specification

## Purpose
Defines voice dictation into quick add: how it is enabled, what the user is told about where audio goes, how speech becomes parsed quick-add text, which languages are used, and how errors and keyboard access are handled.

## Requirements

### Requirement: Opt-in per device
Voice capture SHALL request no microphone permission until the user activates it. When the browser offers speech recognition, quick add SHALL show a microphone button; its first activation on a device SHALL explain that speech is processed by the browser and ask to continue before any permission prompt.

#### Scenario: Default state
- **WHEN** a user opens the app on a new device in a browser with speech recognition
- **THEN** quick add shows the microphone button and the browser has not asked for microphone permission

#### Scenario: First activation
- **WHEN** the user activates the microphone button for the first time on a device
- **THEN** a note explains where speech is processed and offers Continue or Cancel, and only Continue leads to the browser's permission prompt

### Requirement: Microphone button switch per device
Settings → Capture SHALL offer a switch, stored only on the current device and never synced, that hides the button. When the browser offers no speech recognition no button SHALL be shown and the switch SHALL be disabled with an explanation.

#### Scenario: Browser without recognition
- **WHEN** Settings is opened in a browser that offers no speech recognition
- **THEN** the switch is disabled and a note explains that this browser does not provide speech recognition

#### Scenario: Hidden by the switch
- **WHEN** the user turns the switch off
- **THEN** quick add shows no microphone button on this device and `Shift+V` does nothing

### Requirement: Privacy contract
Before voice capture can be switched on, the client SHALL show a statement that recognition is performed by the browser, that the browser may send audio to its vendor's service, that the server never receives audio or transcripts, and that only the resulting task is stored and synced. The client SHALL request on-device recognition when the browser offers that choice and SHALL never record, store or transmit audio itself.

#### Scenario: Statement before enabling
- **WHEN** the user turns the switch on
- **THEN** the statement is shown and the switch becomes active only after the user confirms

#### Scenario: Server receives no audio
- **WHEN** a task is dictated with network traffic to the server inspected
- **THEN** the only requests to the server are the usual sync requests carrying the task's operations

### Requirement: Dictation into quick add
With voice capture on, a microphone button in quick add and `Shift+V` outside text fields SHALL start listening; the button, Escape or silence SHALL stop it. Interim results SHALL appear in the input and the final transcript SHALL be inserted at the caret. The text SHALL then be handled exactly like typed text, including parsing, and the task SHALL be created only on Enter, as one local operation set that syncs and converges like any quick-add task.

#### Scenario: Dictate a scheduled task
- **WHEN** the user presses `Shift+V`, says "call the dentist tomorrow at nine", and presses Enter
- **THEN** quick add showed the words as they were recognised, chips for tomorrow at `09:00` appeared, and the created task is titled `call the dentist` with that due date and time

#### Scenario: Review before saving
- **WHEN** recognition finishes
- **THEN** the input keeps the transcript with focus and caret at the end, and no task exists until Enter is pressed

#### Scenario: Offline dictation then sync
- **WHEN** the device is offline, on-device recognition is available and the user dictates and saves a task
- **THEN** the task is created locally and uploads when the network returns

### Requirement: Spoken attribute normalisation
Before parsing, the transcript SHALL be normalised per active language so that spoken forms of attribute tokens become their typed forms: "hashtag <word>" to `#<word>`, "label <word>" or "at <word>" followed by a known label to `@<word>`, "priority <one..four>" to `p1`–`p4`, spelled-out hours and minutes to digits, and spoken durations to `+<n>m`. Normalisation SHALL be deterministic and SHALL leave unrecognised words unchanged.

#### Scenario: Spoken project and priority
- **WHEN** the final transcript is "renew insurance hashtag home priority two"
- **THEN** the quick-add text becomes `renew insurance #home p2` and the chips show the Home project and `P2`

#### Scenario: Spoken time
- **WHEN** the final transcript is "standup at nine thirty am"
- **THEN** the text becomes `standup at 9:30am` and the due chip shows today at `09:30`

### Requirement: Recognition language
The recognition language SHALL default to the first active quick-add language and SHALL be overridable in Settings from the list of languages the parser supports. When the browser reports that the chosen language is unsupported, the client SHALL say so and fall back to the browser's default language.

#### Scenario: Follows parser language
- **WHEN** the quick-add languages are German then English
- **THEN** dictation listens in German and German date phrases produce chips

#### Scenario: Override
- **WHEN** the user sets the recognition language to Italian in Settings
- **THEN** subsequent dictation listens in Italian regardless of the browser language

### Requirement: Error handling without blocking capture
Denied microphone permission SHALL show a non-blocking message explaining how to re-enable it in the browser; no detected speech SHALL stop listening quietly; recognition being unavailable (for example offline when the browser depends on a remote service) SHALL show "voice capture is unavailable right now" and leave typed capture fully working. Errors SHALL never clear text already in the input.

#### Scenario: Permission denied
- **WHEN** the user denies microphone access
- **THEN** a message explains how to allow it, the microphone button stays available to retry, and typing works

#### Scenario: Offline with remote recognition
- **WHEN** the device is offline and the browser's recognition needs a network service
- **THEN** starting dictation shows the unavailable message and the input keeps its current text

### Requirement: Keyboard access and status announcements
Starting and stopping dictation SHALL be possible without a mouse, the listening state SHALL be visible on the button and announced to assistive technology, and the `Shift+V` shortcut SHALL be listed in the shortcut help and SHALL not fire while typing in a field. Plain `v` keeps its existing meaning (list/board toggle in a project).

#### Scenario: Keyboard start and stop
- **WHEN** focus is not in a text field and the user presses `Shift+V`, then Escape
- **THEN** listening starts, is announced as "Listening", then stops and is announced as "Stopped"

#### Scenario: Typing v is not intercepted
- **WHEN** the user types the letters `v` and `V` into the quick-add field
- **THEN** dictation does not start
