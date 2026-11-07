## ADDED Requirements

### Requirement: Relay requests name their call
Every relay request SHALL carry, sealed with it, the agent call it serves: the tool's name, the name of the connector's token, and the call's arguments as compact JSON cut to at most 300 bytes. A device SHALL refuse a request that names no tool, answering it as refused. While a device answers a request, it SHALL show which connector and tool it is answering without interrupting the user (no dialog), and its list of recent relayed calls SHALL name the connector beside the tool. Neither SHALL show or keep the arguments or any value after the request ends. The call's description is the server's word: the device cannot prove it, and the settings SHALL not claim it can.

#### Scenario: Request names its call
- **WHEN** an assistant connected with the token "Claude.ai" calls `get_task` with `{"id":"t1"}` for an encrypted account with the laptop opted in
- **THEN** the laptop's request carries the tool `get_task`, the token name "Claude.ai" and the arguments `{"id":"t1"}`, and while it answers the laptop shows that it is answering Claude.ai's `get_task`

#### Scenario: Long arguments
- **WHEN** an assistant calls `create_tasks` with arguments longer than 300 bytes
- **THEN** the request carries the arguments cut to 300 bytes on a character boundary, and the call proceeds as before

#### Scenario: Request without a call
- **WHEN** the device receives a request that names no tool
- **THEN** it decrypts and encrypts nothing and answers refused, and the assistant's call fails with `device_unavailable`

### Requirement: Confirming reads on the device
A device SHALL offer the option "Confirm reads first", off by default, beside "Confirm changes first". When it is on, a relayed decryption request SHALL show on the device, before any value is sent, the connector, the tool, the call's arguments and the values it would send (decrypted on the device for this view, at most 20 listed with the count of the rest), with Allow and Decline. Decline, or no decision before the request's deadline, SHALL return `declined_on_device` and send nothing. The values shown SHALL exist only while the sheet is open.

#### Scenario: Declined read
- **WHEN** the option is on and the user declines an assistant's `list_tasks` on the laptop
- **THEN** the result is the tool error `declined_on_device`, no decrypted value leaves the laptop and nothing changes

#### Scenario: Allowed read
- **WHEN** the user allows the same request
- **THEN** the assistant's result shows the decrypted titles, as without the option

#### Scenario: Option off
- **WHEN** the option is off and an assistant reads a task
- **THEN** the device answers without asking, as before

## MODIFIED Requirements

### Requirement: Relay errors
A tool call that needs the relay SHALL return a tool error and change nothing when it cannot be answered: `device_unavailable` when no opted-in device is online and unlocked, naming how to make one available; `device_timeout` when the device does not answer within the call's deadline (at most 20 seconds for reads and 30 for writes); `device_busy` when the account already has the maximum of queued relayed calls; `device_limit` when the device refused because its own limit is reached; and `declined_on_device` when the user declined the request, a read or a write, on the device. A write that timed out SHALL NOT be retried on another device by the server.

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
The server SHALL limit relayed requests to 60 per account per minute, to 4 queued at once per account, and to 2,000 values and 2 MB of text per request, after the existing MCP limits. Each device SHALL enforce its own limit on decrypted values, by default 5,000 per hour and 20,000 per day, whatever the server asks, SHALL show while it is answering a request and for which connector and tool, SHALL list the recent relayed calls, decryption and encryption alike (connector, tool, time, number of values, outcome, never the values), and SHALL offer stopping the relay in one action.

#### Scenario: Server minute limit
- **WHEN** an account's assistants make a 61st relayed call within one minute
- **THEN** the result is `rate_limited` with `retry_after_seconds` and the device receives no request

#### Scenario: Device limit
- **WHEN** a server asks a device to decrypt more values in an hour than the device's limit
- **THEN** the device answers `device_limit` for the rest of the hour and decrypts nothing more

#### Scenario: Reads are listed
- **WHEN** an assistant's `list_tasks` made the laptop decrypt 24 titles
- **THEN** the laptop's recent requests list `list_tasks` with the connector's name, 24 values read and the time, without any title

### Requirement: Confirming writes on the device
A device SHALL offer the option "Confirm changes first", off by default. When it is on, a relayed write SHALL show the change set on the device, with the connector, the tool and the call's arguments, with Apply and Decline before any content is encrypted; Decline SHALL return `declined_on_device` and write nothing; no answer within the deadline SHALL return `device_timeout`. This option SHALL not make reads ask; "Confirm reads first" does.

#### Scenario: Declined
- **WHEN** the option is on and the user declines an assistant's `create_tasks` on the laptop
- **THEN** the result is `declined_on_device` and no task is created

#### Scenario: Applied
- **WHEN** the user applies the same change set
- **THEN** the task is created with ciphertext content and the assistant gets the created task's id
