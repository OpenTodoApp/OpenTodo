## MODIFIED Requirements

### Requirement: Encrypted accounts and write tools
For an account with end-to-end encryption and no device opted in to answer AI connectors, `tools/list` SHALL list every write tool the caller may use with its content arguments (titles, descriptions, names, comment bodies) described as accepting ciphertext only and without plaintext length bounds, and SHALL leave out the arguments that cannot be sent as ciphertext (`origin_url`). A call supplying a content field as plaintext SHALL return the tool error `encryption_enabled` and change nothing; a content field supplied as a well-formed ciphertext envelope SHALL be stored unchanged. Structural changes (complete, reopen, schedule, move, priority, label ids, trash, and a project's or section's colour, icon, parent, position and Favourites entry) SHALL work and converge with offline device edits by last-writer-wins. When at least one of the account's devices is opted in, `tools/list` SHALL describe content arguments as plain text, plaintext content SHALL be encrypted through an opted-in device as described in "Content through an opted-in device", and envelopes SHALL still be stored as given.

#### Scenario: Create refused for an encrypted account
- **WHEN** an allowed assistant of an encrypted account with no opted-in device calls `create_tasks` with a plaintext title
- **THEN** the result is the tool error `encryption_enabled` and no op is written

#### Scenario: Content tools are listed as ciphertext only
- **WHEN** an allowed assistant of an encrypted account with no opted-in device lists the tools
- **THEN** `create_tasks`, `update_tasks`, `create_project`, `update_project`, `create_label`, `add_comment`, `create_sections` and `update_sections` are listed, their text arguments say they accept ciphertext only, and no `origin_url` argument is offered

#### Scenario: Rescheduling works for an encrypted account
- **WHEN** the same assistant calls `schedule_tasks` for two tasks
- **THEN** both get the new plaintext due date and every enrolled device shows it after sync with titles still encrypted

#### Scenario: Recolouring works for an encrypted account
- **WHEN** the same assistant calls `update_project` with only `color` and `icon` for an encrypted project
- **THEN** both are written in plaintext, every enrolled device shows them after sync, and the project's name stays the ciphertext it was

#### Scenario: Ciphertext name is stored as given
- **WHEN** a client of an encrypted account calls `update_sections` with a `name` that is a well-formed `enc:v1:` envelope
- **THEN** the envelope is stored unchanged, and an unlocked device shows the decrypted name if the envelope was made with the account key for that section, or its "can't decrypt" placeholder otherwise

#### Scenario: Plaintext name refused
- **WHEN** a client of an encrypted account with no opted-in device calls `update_project` with `name: "Garden"`
- **THEN** the result is the tool error `encryption_enabled` and nothing changes

#### Scenario: Opted-in device takes plain text
- **WHEN** the user has opted in one device and an allowed `agent` token lists the tools
- **THEN** the text arguments of `create_tasks` and the other content tools are described as plain text, without the ciphertext-only note

## ADDED Requirements

### Requirement: Device opt-in to answer AI connectors
On an unlocked device of an encrypted account, the user SHALL be able to turn on "Answer AI connectors from this device" and turn it off again. Turning it on SHALL need a recently confirmed session on that device and SHALL be refused on a demo instance and while the owner has MCP off. The choice SHALL be server state for that device, never an operation. It SHALL end when the device locks, signs out, when encryption is turned off on the account, or when the user turns it off from any device. The setting SHALL state in plain words that while it is on, text an assistant asks for passes through the server to reach the assistant, and that the device enforces its own limits.

#### Scenario: Turning it on
- **WHEN** the user, recently confirmed on an unlocked laptop, turns the switch on
- **THEN** the laptop appears as an opted-in device in Settings → Assistants on every device of the account

#### Scenario: Locking the device ends it
- **WHEN** the user locks the laptop
- **THEN** the laptop is no longer opted in and an assistant's next content call returns `device_unavailable`

#### Scenario: Without credentials
- **WHEN** a request without a valid session calls the opt-in route
- **THEN** the response is 401 `unauthorized` and nothing changes

#### Scenario: Stale confirmation
- **WHEN** a session confirmed more than the recent-confirmation window ago calls the opt-in route
- **THEN** the response asks for confirmation and the device is not opted in

#### Scenario: Unencrypted account
- **WHEN** an account without encryption calls the opt-in route
- **THEN** the response is 409 `not_encrypted` and nothing changes

### Requirement: Relay channel
An opted-in device SHALL receive relay requests over its own authenticated event stream, separate from the sync wake-up stream, and SHALL answer each on a route bound to that request. Only the device the request was sent to SHALL be able to answer it, once. The sync wake-up stream SHALL keep carrying no content. The server SHALL make no outbound request for the relay.

#### Scenario: Request and answer
- **WHEN** an assistant reads a task of an encrypted account while the laptop is opted in and connected
- **THEN** the laptop's relay stream delivers one request, the laptop answers it, and the assistant's result arrives within the call

#### Scenario: Unauthenticated stream
- **WHEN** a request without a valid session or device credential opens the relay stream
- **THEN** the response is 401 `unauthorized` and no stream opens

#### Scenario: Answer from another device or twice
- **WHEN** a different device, or the same device a second time, posts an answer to a request id
- **THEN** the response is 404 `not_found` and the assistant's call is unaffected

#### Scenario: Sync stream unchanged
- **WHEN** relayed calls run while the sync stream is captured
- **THEN** the sync stream contains wake-up cursors only

### Requirement: Content through an opted-in device
For an encrypted account with an opted-in device online, every tool SHALL run on the server exactly as for an unencrypted account (permission gate, validation, limits, planning, operations, audit), except that ciphertext values in a result SHALL be decrypted by the device before the result is returned, and content arguments of a write SHALL be encrypted by the device before operations are written. Operations written this way SHALL carry ciphertext only, SHALL be decrypted by every other enrolled device, and SHALL converge like any device's edits, offline edits included. The server SHALL never hold the account key, and SHALL never store, cache, log or audit relayed plaintext.

#### Scenario: Reading titles
- **WHEN** an assistant calls `list_tasks` for an encrypted account with the laptop online and opted in
- **THEN** the titles in the result are plaintext and the server's database, logs and audit log contain no plaintext title

#### Scenario: Creating a task
- **WHEN** the assistant calls `create_tasks` with title "Call the plumber"
- **THEN** the written operation's title is ciphertext, the phone decrypts it as "Call the plumber" after sync, and the audit log has one `agent.write` with counts only

#### Scenario: Offline edit on another device
- **WHEN** the phone renamed the same task offline and syncs after the assistant's write
- **THEN** both devices converge on the later title by last-writer-wins, as for any two devices

### Requirement: Relay errors
A tool call that needs the relay SHALL return a tool error and change nothing when it cannot be answered: `device_unavailable` when no opted-in device is online and unlocked, naming how to make one available; `device_timeout` when the device does not answer within the call's deadline (at most 20 seconds for reads and 30 for writes); `device_busy` when the account already has the maximum of queued relayed calls; `device_limit` when the device refused because its own limit is reached; and `declined_on_device` when the user declined a write on the device. A write that timed out SHALL NOT be retried on another device by the server.

#### Scenario: No device online
- **WHEN** the only opted-in device is closed and an assistant calls `create_tasks`
- **THEN** the result is the tool error `device_unavailable` with a message saying to open OpenTodo on an opted-in, unlocked device, and no op is written

#### Scenario: Structural calls need no device
- **WHEN** no device is online and the assistant calls `complete_tasks`
- **THEN** the tasks are completed as today, because no content is read or written

#### Scenario: Slow device
- **WHEN** the device does not answer a write within 30 seconds
- **THEN** the result is `device_timeout`, no op is written, and no other device is asked

### Requirement: Relay limits
The server SHALL limit relayed requests to 60 per account per minute, to 4 queued at once per account, and to 2,000 values and 2 MB of text per request, after the existing MCP limits. Each device SHALL enforce its own limit on decrypted values, by default 5,000 per hour and 20,000 per day, whatever the server asks, SHALL show while it is answering a request, SHALL list the recent relayed calls (tool, time, number of values, never the values), and SHALL offer stopping the relay in one action.

#### Scenario: Server minute limit
- **WHEN** an account's assistants make a 61st relayed call within one minute
- **THEN** the result is `rate_limited` with `retry_after_seconds` and the device receives no request

#### Scenario: Device limit
- **WHEN** a server asks a device to decrypt more values in an hour than the device's limit
- **THEN** the device answers `device_limit` for the rest of the hour and decrypts nothing more

### Requirement: Confirming writes on the device
A device SHALL offer the option "Ask me before AI connectors change anything", off by default. When it is on, a relayed write SHALL show the change set on the device with Apply and Decline before any content is encrypted; Decline SHALL return `declined_on_device` and write nothing; no answer within the deadline SHALL return `device_timeout`. Reads SHALL never ask.

#### Scenario: Declined
- **WHEN** the option is on and the user declines an assistant's `create_tasks` on the laptop
- **THEN** the result is `declined_on_device` and no task is created

#### Scenario: Applied
- **WHEN** the user applies the same change set
- **THEN** the task is created with ciphertext content and the assistant gets the created task's id
