# notification-channels Specification

## Purpose
Lets each person receive reminders and other notifications through services they already use (ntfy, Pushover, Gotify, or any endpoint that accepts a signed webhook), sent only to the addresses they enter, never carrying task content for an encrypted account, and switched off for the whole server by its owner when they choose.

## Requirements

### Requirement: Delivery channels
Each account SHALL be able to keep up to five delivery channels through `GET`/`POST /api/v1/notification-channels` and `PATCH`/`DELETE /api/v1/notification-channels/{id}`. A channel has:

- a kind: `ntfy`, `pushover`, `gotify` or `webhook`;
- a name of at most 60 characters;
- the kind's settings:
  - ntfy: server address, topic and an optional access token;
  - Pushover: user key and application token;
  - Gotify: server address and application token;
  - webhook: an address;
- the events it receives;
- an "include task titles" switch, off by default;
- an enabled switch.

Addresses SHALL be http or https URLs of at most 2048 characters. An ntfy topic SHALL be 1 to 64 letters, digits, `-` or `_`.

A channel belongs to its account alone: another account's channel answers 404. Channels are server state outside the op log: they are not synced, need a connection to change, and the app shows the last loaded list while offline.

Errors:

| Error | When |
|---|---|
| `unauthorized` | no session or token |
| `invalid_input` | a field is invalid; the error names it |
| `limit_reached` | a sixth channel |
| `private_target` | the address resolves only to private targets |
| `not_found` | the channel doesn't exist or isn't the caller's |
| `channels_disabled` | the owner switch is off |

#### Scenario: Add an ntfy channel
- **WHEN** a signed-in user creates `{kind: "ntfy", name: "Phone", url: "https://ntfy.example.com", topic: "ana-tasks", events: ["reminder","assigned"]}`
- **THEN** the response is 201 with the channel, enabled, with `tokenSet: false` and `includeTitles: false`, and listing the user's channels includes it

#### Scenario: Not signed in
- **WHEN** a request without a session or token lists or creates channels
- **THEN** the response is 401 `unauthorized`

#### Scenario: Another account's channel
- **WHEN** Ben patches, tests, reads the deliveries of or deletes Ana's channel id
- **THEN** the response is 404 `not_found` and the channel is unchanged

#### Scenario: Invalid settings
- **WHEN** a Pushover channel is created without a user key, or an ntfy channel with the topic "my topic!" or the address `ftp://x`
- **THEN** the response is 400 `invalid_input` naming the field

#### Scenario: Sixth channel
- **WHEN** a user with five channels creates another
- **THEN** the response is 409 `limit_reached`

#### Scenario: Offline
- **WHEN** the device is offline and the user opens Settings → Notifications
- **THEN** the card shows the last loaded channels with every control disabled and says that changing them needs a connection

### Requirement: Channel events
Each channel SHALL receive only the events switched on for it, at least one of these:

| Event | When |
|---|---|
| `reminder` | a reminder fires |
| `assigned` | someone else assigned a task to the user |
| `mentioned` | someone mentioned the user in a comment or in notes |
| `unblocked` | someone else completed the last blocker of a task assigned to the user |
| `page` | a guest replied on or completed one of the user's task pages |

An event SHALL be queued for a channel after the change that caused it has committed on the server, at most once per channel. A channel that is switched off queues nothing. Events caused by the user themselves are never sent to them.

#### Scenario: Assigned by a teammate
- **WHEN** Ben assigns a task to Ana and Ana has an enabled channel with `assigned`
- **THEN** one message is queued for that channel and none for Ana's channels without `assigned`

#### Scenario: Same event twice
- **WHEN** the same assignment reaches the channels twice
- **THEN** the channel still receives one message

#### Scenario: Channel switched off
- **WHEN** a channel's enabled switch is off while a reminder fires
- **THEN** nothing is queued for it

### Requirement: Reminders through channels
The server's reminder scheduler SHALL hand every reminder that fires to the user's channels with `reminder`, once per firing, under the same rules as Web Push: not for a deleted reminder, a completed task, or a task whose project is in the Trash.

Sending to channels SHALL be independent of the user's devices:

- A firing goes to the channels whether or not a device is subscribed.
- A device push that is retried on a later pass does not send to a channel again.

Reminders reach channels only while the reminder scheduler runs, that is while Web Push is not turned off by `OPENTODO_PUSH=off`.

#### Scenario: Reminder with no subscribed device
- **WHEN** a reminder fires for a user with no push subscription and one ntfy channel with `reminder`
- **THEN** one message is sent to ntfy and the reminder is recorded as delivered as before

#### Scenario: Push retried
- **WHEN** every push to the user's devices fails and the scheduler tries again on the next pass
- **THEN** the channel received the reminder once

#### Scenario: Completed before it fires
- **WHEN** the task is completed before its reminder's time
- **THEN** no channel receives the reminder

### Requirement: Notification content and privacy
A message SHALL name the task and the person who acted only when all of these hold:

- the channel's "include task titles" switch is on;
- the account has no end-to-end encryption;
- the value is not ciphertext.

Otherwise it SHALL say only what happened:

| Event | Message |
|---|---|
| reminder | "A reminder is due" |
| assigned | "A task was assigned to you" |
| mentioned | "You were mentioned" |
| unblocked | "A task you're assigned to is ready to start" |
| page reply | "A guest replied on a task page" |
| page completion | "A guest completed a task page" |

A mention's excerpt follows the same rule.

Every message SHALL carry a link into the app made of the server's address and the task's id.

Messages SHALL be written in the language the user's app used when the channel was last saved (English, German, French, Spanish, Italian or Portuguese), and in English otherwise.

#### Scenario: Titles off
- **WHEN** a reminder for "Call the plumber" fires on a channel with titles off
- **THEN** the message reads "A reminder is due" and carries a link to the task, and no request contains "Call the plumber"

#### Scenario: Encrypted account
- **WHEN** an account with end-to-end encryption has a channel with titles on and a task is assigned to it
- **THEN** the message reads "A task was assigned to you" with no title and no name, and the editor shows the titles switch off and disabled with the reason

#### Scenario: German
- **WHEN** a channel was saved from the app in German and a reminder fires with titles off
- **THEN** the message reads "Eine Erinnerung ist fällig"

### Requirement: Channel kinds and the webhook payload
Each kind SHALL send its messages this way:

| Kind | Request |
|---|---|
| ntfy | publish to its server with ntfy's JSON publishing (topic, title, message, click link), and the access token as a bearer token when set |
| Pushover | post to Pushover's message API with its application token and user key |
| Gotify | post to its server's `/message` with its application token in `X-Gotify-Key` |
| Webhook | POST a JSON payload with `version` 1 and the headers below |

The webhook payload SHALL have these fields:

- always: `id`, `event`, `createdAt`, `title`, `message`, `body` (equal to `message`), `url` and `task.id`;
- for task pages: `page.id`;
- only when content may leave: `task.title` and `actor.name`.

The webhook request SHALL carry these headers:

- `X-OpenTodo-Event: notification.<event>`;
- `X-OpenTodo-Delivery`;
- `X-OpenTodo-Timestamp`;
- `X-OpenTodo-Signature`: `v1=` HMAC-SHA256 of `"<timestamp>.<body>"` with the channel's signing secret, the webhooks' scheme.

The signing secret SHALL be returned once, when the channel is created or the secret rotated.

#### Scenario: Webhook signature
- **WHEN** a webhook channel receives a reminder
- **THEN** the receiver can verify `X-OpenTodo-Signature` with the secret shown at creation, and the body has `version: 1`, `event: "reminder"` and a `body` equal to `message`

#### Scenario: Secret shown once
- **WHEN** the user lists channels after creating a webhook channel
- **THEN** the list shows `secretSet: true` and never the secret

### Requirement: Outbound policy for channels
Every request to a channel SHALL go through the server's outbound policy:

- http or https only, with no redirects;
- the connection made to the address that was checked;
- no private, loopback or link-local target, unless the owner allowed private network targets. That switch is shared with webhooks and always off on a hosted tenant.

Creating or changing a channel whose address resolves only to such targets SHALL be refused with `private_target`. A send that meets one fails without retry.

#### Scenario: LAN ntfy refused by default
- **WHEN** a user adds an ntfy channel at `http://192.168.1.20` and the owner has not allowed private targets
- **THEN** the response is 400 `private_target` naming the owner's switch

#### Scenario: LAN ntfy allowed
- **WHEN** the owner allows private network targets and the user adds the same channel
- **THEN** it is created and messages reach it

### Requirement: Channel delivery queue
Messages SHALL be queued durably and sent by one worker:

- each request has a 10-second timeout;
- failures are retried on the webhooks' schedule, about 27 hours in total;
- every attempt is recorded with its status code and a short error, never a secret.

A channel SHALL be switched off after 20 consecutive failed messages, with the reason shown. Switching it on again resets the count.

A channel's delivery log SHALL keep 30 days and at most the newest 50 entries, readable through `GET /api/v1/notification-channels/{id}/deliveries`.

A server restart SHALL neither lose nor duplicate queued messages.

#### Scenario: Temporary outage
- **WHEN** the ntfy server answers 503 to a reminder and is back ten minutes later
- **THEN** the message is sent on a later attempt and the log shows the failed and the successful attempt

#### Scenario: Persistent failure
- **WHEN** a channel's token was revoked and 20 messages in a row fail
- **THEN** the channel is off with the reason "too many failures" and nothing more is sent to it

### Requirement: Channel limits
An account SHALL have at most these:

| Limit | Beyond it |
|---|---|
| 5 channels | the sixth answers 409 `limit_reached` |
| 60 messages per rolling hour, across its channels | recorded as skipped for the rate limit and never sent |
| 12 tests per hour | 429 `rate_limited` |

#### Scenario: A burst of assignments
- **WHEN** 80 tasks are assigned to Ana within an hour
- **THEN** 60 messages are sent and 20 are recorded as skipped for the rate limit

### Requirement: Send a test message
`POST /api/v1/notification-channels/{id}/test` SHALL send one message ("Test from OpenTodo") through the channel at once, without queueing it for retry, and answer with the outcome: delivered, or the status and error.

It SHALL require the signed-in owner of the channel. Errors:

| Error | When |
|---|---|
| 401 `unauthorized` | no session or token |
| 404 `not_found` | the channel doesn't exist or isn't the caller's |
| 429 `rate_limited` | the test limit is reached |
| 404 `channels_disabled` | the owner switch is off |

#### Scenario: Test succeeds
- **WHEN** the user sends a test on a working Gotify channel
- **THEN** the response says delivered and the Gotify app shows "Test from OpenTodo"

#### Scenario: Test fails
- **WHEN** the Pushover user key is wrong
- **THEN** the response carries Pushover's status code and error, and the editor shows them beside the channel

### Requirement: Channel secrets
Tokens, user keys and signing secrets SHALL be stored only in the server's secrets file for channels. They SHALL never be in the database, a synced field, a log line, a delivery log, an error message, the export or a backup. Reads SHALL report only whether a secret is set.

Patching a secret SHALL replace it. A channel restored from a backup without its secret SHALL say that the token is missing and SHALL not send.

These SHALL be recorded in the audit log with the channel's id and kind:

- creating a channel;
- deleting a channel;
- changing its secret, with the names of the changed settings, never their values.

#### Scenario: Token replaced
- **WHEN** the user patches a Gotify channel with a new token
- **THEN** later messages use it, the response says `tokenSet: true`, and the audit log records `notification_channel.updated` with `setting: token`

#### Scenario: Deleted
- **WHEN** the user deletes a channel
- **THEN** its secrets are removed from the secrets file, its queued messages are dropped, and the audit log records `notification_channel.deleted`

### Requirement: Owner switch for notification channels
The owner SHALL be able to turn notification channels off and on for the whole server through `PUT /api/v1/settings/notification-channels` (`{enabled}`). `GET` answers any signed-in user. Channels are on unless the owner turned them off, and a change is recorded as `settings.changed` (`notifications.channels`).

While the switch is off:

- nothing is queued or sent;
- queued messages wait;
- the channel routes answer 404 `channels_disabled`.

On a demo instance, every channel route and the setting are refused, and no message is ever sent.

#### Scenario: Owner turns it off
- **WHEN** the owner turns notification channels off
- **THEN** a firing reminder reaches no channel, listing channels answers 404 `channels_disabled`, and the card tells members that the owner turned channels off

#### Scenario: Member tries the switch
- **WHEN** a member puts the setting
- **THEN** the response is 403 `forbidden`

#### Scenario: Demo instance
- **WHEN** a demo visitor lists or creates a channel
- **THEN** the request is refused as a feature not available on the demo

### Requirement: Delivery channels in Settings
Settings → Notifications SHALL have a Delivery channels card after the push card.

Each channel is one row with:

- its kind's icon and its name;
- an enabled switch;
- its last result: when it last delivered, the last error, or why it's off;
- a menu with Edit, Send test and Delete.

An Add channel action opens an editor with:

- the kind and the name;
- the kind's fields, with secrets as password inputs that say when one is saved;
- the five event switches;
- Include task titles.

The owner sees an "On this server" row with the owner switch.

Every control SHALL be reachable by keyboard. At 360 px, the row's controls wrap under its name and each target is at least 44 by 44 px.

The webhook editor SHALL show the signing secret once after creation, with a Copy action.

#### Scenario: Add Pushover from the card
- **WHEN** the user chooses Add channel, picks Pushover, fills the user key and the application token, keeps Reminders and Assigned and saves
- **THEN** the card lists "Pushover" with the switch on and "Nothing delivered yet", and Send test reports the outcome beside it

#### Scenario: Phone width
- **WHEN** the card is shown at 360 px
- **THEN** every row's controls wrap under its name and nothing overflows the screen
