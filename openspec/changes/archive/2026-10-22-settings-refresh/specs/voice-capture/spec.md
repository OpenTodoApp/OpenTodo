## MODIFIED Requirements

### Requirement: Privacy contract
Voice capture SHALL offer two recognisers, chosen per device: "This browser" (the default) and, when the owner has connected one, "This server's speech service". Before voice capture can be switched on, and again when the recogniser is changed, the client SHALL show the statement for the chosen recogniser. For "This browser": recognition is performed by the browser, the browser may send audio to its vendor's service, the server never receives audio or transcripts, and only the resulting task is stored and synced. For "This server's speech service": the phrase is recorded in the browser and sent to this OpenTodo server, which passes it to the speech service the owner connected (named by its host) and returns the text; neither the server nor the app stores the audio or the text, and only the resulting task is stored and synced. With "This browser" the client SHALL request on-device recognition when the browser offers that choice and SHALL never record, store or transmit audio itself; with the server's service it SHALL record only while the microphone is on, send each phrase once, and keep no audio after the answer.

#### Scenario: Statement before enabling
- **WHEN** the user turns the switch on
- **THEN** the statement is shown and the switch becomes active only after the user confirms

#### Scenario: Server receives no audio
- **WHEN** a task is dictated with "This browser" chosen and network traffic to the server inspected
- **THEN** the only requests to the server are the usual sync requests carrying the task's operations

#### Scenario: Statement for the server's service
- **WHEN** the user chooses "This server's speech service" on a server connected to `stt.home.lan`
- **THEN** the statement names `stt.home.lan`, says the phrase passes through this server and is not stored, and the choice takes effect only after the user confirms

## ADDED Requirements

### Requirement: Server speech service
The owner SHALL be able to connect one speech-to-text service in Settings → Server → Speech to text, or with the optional variables `OPENTODO_STT_URL`, `OPENTODO_STT_MODEL` and `OPENTODO_STT_KEY_FILE` (none required; a field set by a variable is read-only in Settings and names it). The service SHALL be any endpoint that implements the OpenAI-compatible `POST /v1/audio/transcriptions` request (multipart `file`, `model`, optional `language`, `response_format=json`); the documentation SHALL name Speaches (faster-whisper) as the self-hosted choice and whisper.cpp's server as an alternative. The key, when set, SHALL be stored in `<data>/secrets/stt.json`, never in the database or backups, and never returned. Requests to the service SHALL go through the outbound policy (`internal/outbound`): only to the configured host, no redirects, private-network hosts only when the owner allows them, which is the usual case for a service on the owner's network. A "Test" action SHALL send a short built-in sample and show the text or the stage that failed. While no service is connected, users SHALL see only "This browser". The configuration SHALL be read and written through `GET` and `PUT /api/v1/settings/stt` and tested through `POST /api/v1/settings/stt/test`, all for the owner only (the `ownerOnly` policy, denied to tokens other than `admin` and on the demo instance), answering `forbidden` to anyone else and `invalid_input` naming the field for a URL that is not http(s) or a model that is empty.

#### Scenario: Owner connects Speaches on the home network
- **WHEN** the owner enters `http://stt.home.lan:8000`, the model `Systran/faster-whisper-small`, allows private network targets and presses Test
- **THEN** the sample's text is shown, members can now choose "This server's speech service", and no other host is ever contacted for speech

#### Scenario: Not configured
- **WHEN** no service is connected
- **THEN** the Voice capture card offers only "This browser" and the transcription route answers `stt_not_configured`

#### Scenario: Member cannot configure
- **WHEN** a member sends `PUT /api/v1/settings/stt`
- **THEN** the response is 403 `forbidden` and the configuration is unchanged

#### Scenario: Bad URL
- **WHEN** the owner saves `ftp://stt.home.lan`
- **THEN** the response is 400 `invalid_input` naming `url` and the previous configuration stays

### Requirement: Transcription route
`POST /api/v1/voice/transcribe` SHALL take one recorded phrase (`audio/webm`, `audio/ogg`, `audio/mp4` or `audio/wav`, at most 60 seconds and 5 MB) and the quick-add language, SHALL require a signed-in session or a `full` token, SHALL be denied on the demo instance and limited to 30 requests per user per minute, and SHALL answer `{text}` from the service. The server SHALL hold the audio and the text only in memory for the duration of the request, SHALL write neither to disk, the database, logs or the audit log, and SHALL record only a counter of requests per user for the limit. For an encrypted account the client SHALL say, in the statement, that the phrase and its text are readable by this server and the speech service while the request runs. Errors SHALL be `unauthorized`, `stt_not_configured`, `invalid_input` (wrong type, too long, too large), `rate_limited` and `stt_unavailable` (the service failed or timed out after 30 seconds), and quick add SHALL keep what was typed in every case.

#### Scenario: A phrase becomes text
- **WHEN** a signed-in user dictates "call the dentist tomorrow at 9" with the server's service chosen
- **THEN** the route answers the text, quick add shows it with its date and time chips, and nothing about the phrase remains on the server afterwards

#### Scenario: Without a session
- **WHEN** a request without credentials posts audio to the route
- **THEN** the response is 401 `unauthorized` and nothing is sent to the speech service

#### Scenario: Service down
- **WHEN** the speech service does not answer within 30 seconds
- **THEN** the route answers `stt_unavailable`, quick add says the speech service did not answer and keeps the field as it was, and the microphone can be used again
