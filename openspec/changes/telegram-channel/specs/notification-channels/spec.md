## ADDED Requirements

### Requirement: Find a Telegram chat
`POST /api/v1/notification-channels/telegram/chats` with `{token, url?}`, or `{channelId}` for a saved Telegram channel of the caller, SHALL ask the Bot API for the chats the bot has recently seen and answer `{chats: [{id, type, title}]}`, newest first, de-duplicated, at most 20. It SHALL go through the server's outbound policy, SHALL NOT store the token it was given or the updates it read, SHALL NOT mark updates as read for the bot, and SHALL count toward the account's test limit. It SHALL require a session or a token allowed to write; it is refused on a demo instance and answers 404 `channels_disabled` while the owner switch is off.

Errors:

| Error | When |
|---|---|
| 401 `unauthorized` | no session or token |
| 400 `invalid_input` | the token is malformed or the Bot API refuses it (field `token`) |
| 404 `not_found` | `channelId` is not a Telegram channel of the caller |
| 409 `telegram_webhook_set` | the bot delivers its updates to a webhook, so recent chats cannot be read; the message says to enter the chat id by hand |
| 429 `rate_limited` | the test limit is reached |
| 502 `telegram_unreachable` | the Bot API cannot be reached or answers an error other than the above |

#### Scenario: Pick the private chat
- **WHEN** the user sent "hi" to their bot and chooses Find chats with the bot's token
- **THEN** the response lists the private chat with the user's name and id, and choosing it fills the chat id

#### Scenario: Nothing seen yet
- **WHEN** nobody has written to the bot
- **THEN** the response is an empty list and the editor says to send the bot a message and try again

#### Scenario: Not signed in
- **WHEN** a request without a session or token calls the route
- **THEN** the response is 401 `unauthorized` and no request reaches the Bot API

#### Scenario: Wrong token
- **WHEN** the Bot API answers 401 for the token
- **THEN** the response is 400 `invalid_input` with field `token`, and the token is in no log line

#### Scenario: Bot with a webhook
- **WHEN** the bot already delivers its updates to a webhook
- **THEN** the response is 409 `telegram_webhook_set` and the editor offers to type the chat id

#### Scenario: Another account's channel
- **WHEN** Ben calls the route with Ana's channel id
- **THEN** the response is 404 `not_found` and no request reaches the Bot API

#### Scenario: Demo instance
- **WHEN** a demo visitor calls the route
- **THEN** the request is refused as a feature not available on the demo

#### Scenario: Offline
- **WHEN** the device is offline and the user opens the Telegram editor
- **THEN** Find chats is disabled and says it needs a connection

## MODIFIED Requirements

### Requirement: Delivery channels
Each account SHALL be able to keep up to five delivery channels through `GET`/`POST /api/v1/notification-channels` and `PATCH`/`DELETE /api/v1/notification-channels/{id}`. A channel has:

- a kind: `ntfy`, `pushover`, `gotify`, `webhook` or `telegram`;
- a name of at most 60 characters;
- the kind's settings:
  - ntfy: server address, topic and an optional access token;
  - Pushover: user key and application token;
  - Gotify: server address and application token;
  - webhook: an address;
  - Telegram: a bot token, a chat id and an optional Bot API address (`https://api.telegram.org` by default);
- the events it receives;
- an "include task titles" switch, off by default;
- an enabled switch.

Addresses SHALL be http or https URLs of at most 2048 characters. An ntfy topic SHALL be 1 to 64 letters, digits, `-` or `_`. A Telegram bot token SHALL have BotFather's form (digits, `:`, then 30 to 64 letters, digits, `-` or `_`), and a chat id SHALL be an integer of at most 20 digits, negative for a group or channel, or `@` followed by 5 to 32 letters, digits or `_`.

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

#### Scenario: Add a Telegram channel
- **WHEN** a signed-in user creates `{kind: "telegram", name: "Telegram", token: "123456789:AA…", chatId: "987654321", events: ["reminder"]}`
- **THEN** the response is 201 with the channel, `tokenSet: true`, `chatId: "987654321"`, the default Bot API address and `includeTitles: false`, and the token is never in the response

#### Scenario: Invalid Telegram settings
- **WHEN** a Telegram channel is created without a token, with the token `abc`, or with the chat id `my chat`
- **THEN** the response is 400 `invalid_input` naming the field

### Requirement: Channel kinds and the webhook payload
Each kind SHALL send its messages this way:

| Kind | Request |
|---|---|
| ntfy | publish to its server with ntfy's JSON publishing (topic, title, message, click link), and the access token as a bearer token when set |
| Pushover | post to Pushover's message API with its application token and user key |
| Gotify | post to its server's `/message` with its application token in `X-Gotify-Key` |
| Webhook | POST a JSON payload with `version` 1 and the headers below |
| Telegram | post to `<Bot API address>/bot<token>/sendMessage` with the chat id, the title in bold and the message as HTML-escaped text, link previews off, and an "Open in OpenTodo" button carrying the link when the link is https on a public host name, otherwise the link as the text's last line |

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

#### Scenario: Telegram message
- **WHEN** a Telegram channel with titles on receives the reminder for "Pay <rent> & bills" and the server's address is `https://todo.example.com`
- **THEN** the bot posts to the chat a message whose bold line is the reminder title, whose text contains `Pay &lt;rent&gt; &amp; bills`, and whose button opens the task

#### Scenario: Telegram link without a public https address
- **WHEN** the server's address is `http://192.168.1.10:8080` and a Telegram reminder is sent
- **THEN** the message has no button and its last line is the link to the task

#### Scenario: Telegram asks to slow down
- **WHEN** the Bot API answers 429 with `retry_after: 40`
- **THEN** the next attempt is no sooner than 40 seconds later, and the delivery log records the 429

#### Scenario: Token never leaks
- **WHEN** a Telegram send fails because the connection is refused, or the Bot API answers 401
- **THEN** the delivery log, the channel's last error, the server log and the audit log contain neither the token nor `bot<token>`

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

The Telegram editor SHALL explain how to create a bot with @BotFather, SHALL offer Find chats (see "Find a Telegram chat") to fill the chat id, and, when the chat id names a group or a channel, SHALL say that everyone in that chat will read the messages and SHALL ask for confirmation before Include task titles is turned on.

#### Scenario: Add Pushover from the card
- **WHEN** the user chooses Add channel, picks Pushover, fills the user key and the application token, keeps Reminders and Assigned and saves
- **THEN** the card lists "Pushover" with the switch on and "Nothing delivered yet", and Send test reports the outcome beside it

#### Scenario: Phone width
- **WHEN** the card is shown at 360 px
- **THEN** every row's controls wrap under its name and nothing overflows the screen

#### Scenario: Telegram group warning
- **WHEN** the user enters the chat id `-100123456789` and turns on Include task titles
- **THEN** the editor shows that everyone in the chat will read the messages and turns titles on only after the user confirms
