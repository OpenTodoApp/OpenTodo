# Design

## Context

`internal/channels` has one message model rendered by four senders (`send.go` builds one request per kind), a durable queue with the webhooks' retry schedule, a per-account limit of 60 messages an hour and 12 tests an hour, secrets in `<data>/secrets/notification-channels.json`, error scrubbing (`scrub`) of the stored secrets, and the content policy (titles only when switched on, the account is not encrypted and the value is not ciphertext). Pushover is the precedent for a fixed third-party API reached only because the person configured it. The demo deny list refuses the whole `/api/v1/notification-channels` prefix.

## Decisions

**D1. One more kind in the same model.** `telegram` joins `ntfy`, `pushover`, `gotify` and `webhook`. It takes:

| Setting | Stored | Rule |
|---|---|---|
| `token` | secrets file, `<id>` | required; `^[0-9]{5,16}:[A-Za-z0-9_-]{30,64}$` (BotFather's format) |
| `chatId` | channels table | required; an integer of up to 20 digits, negative for groups and channels, or `@` and a public channel username of 5–32 letters, digits or `_` |
| `url` | channels table | optional Bot API address, http(s), default `https://api.telegram.org` |

Alternative: reuse the `topic` column for the chat id. Rejected: topic has ntfy's validation, and the API's read shape should name the field for what it is. The migration adds one `chat_id` text column, empty for other kinds.

**D2. The request.** `POST <url>/bot<token>/sendMessage` with JSON:

```json
{"chat_id": "<chatId>", "text": "<b>Title</b>\nMessage", "parse_mode": "HTML",
 "link_preview_options": {"is_disabled": true},
 "reply_markup": {"inline_keyboard": [[{"text": "Open in OpenTodo", "url": "<link>"}]]}}
```

- Title and message are HTML-escaped (`&`, `<`, `>`), so a task title can never inject markup.
- The button is sent only when the link is `https` with a public host name; Telegram refuses buttons for `localhost`, IP literals and plain http. Otherwise the link is appended as the last line of the text, which Telegram makes clickable when it can.
- The button label comes from the channel's language table, like the other texts.
- Telegram's `429` carries `parameters.retry_after`; the queue's next attempt is the later of the schedule and that value. A `403` ("bot was blocked by the user", "bot is not a member") and `400 chat not found` are recorded with Telegram's description so the row explains the fix; they are retried like any failure, as the existing design does for refused credentials, so fixing the chat lets the queued message through.

**D3. The token is in the URL path, so scrubbing covers URLs.** Go's `*url.Error` prints the request URL, so a connection error would contain `bot<token>`. `scrub` already removes the stored secrets from every message; the Telegram sender also builds its error text from `outbound.RootCause(err)` (without the URL), and a test asserts that neither the token nor `bot<token>` appears in an outcome, a delivery row, a log line or an audit entry. The token is never logged at debug level either.

**D4. Find chats.** `POST /api/v1/notification-channels/telegram/chats` with `{token, url?}` or `{channelId}` (to use a saved channel's token):

- calls `getUpdates` with `limit=100` and `allowed_updates=["message","channel_post","my_chat_member"]`, 10-second timeout, through `internal/outbound`;
- answers `{chats: [{id, type, title}]}`, de-duplicated, newest first, at most 20; `title` is the chat's title, or the first name and username of a private chat;
- never stores the token it was given and never stores the updates;
- shares the test limit (12 per hour per account) and answers `429 rate_limited` beyond it;
- maps Telegram's `401` to `400 invalid_input` (field `token`), and `409` (the bot has a webhook set, so `getUpdates` is unavailable) to `409 telegram_webhook_set` with a message telling the person to enter the chat id by hand;
- answers `502 telegram_unreachable` when the Bot API cannot be reached or answers another error (both new codes go into the server error code fixture with translated messages);
- registered like the other channel routes, `signedIn.DemoDenied()` wrapped in `channelsGate` (so it answers `404 channels_disabled` while the owner switch is off); the demo deny list's `/api/v1/notification-channels` prefix already covers it, and the policy test checks both agree. A `read` token is refused like on every write.

Calling `getUpdates` marks nothing as read for the bot unless an offset is passed; none is passed, so another tool polling the same bot is not disturbed. Alternative: deep link `t.me/<bot>?start=<code>` and a server-side poll that binds the chat automatically. Rejected for now: it needs the server to poll Telegram for minutes, and the list is enough.

**D5. Groups and channels.** A chat id below zero or starting with `@` is a group or channel. The editor shows "Everyone in this chat will see these messages" under the field, and turning on "Include task titles" for such a chat asks for confirmation. The server enforces nothing extra: the content policy already decides what leaves.

**D6. Outbound and the anti-telemetry rule.** `api.telegram.org` is reached only after a person saves a Telegram channel or presses Find chats, exactly like Pushover's fixed API, so it is "a target the user configured" under AGENTS rule 5. A self-hosted Bot API server is allowed through the same policy (private targets only with the owner's switch). The owner switch for channels turns Telegram off with every other kind; a per-kind owner switch is not added (open question).

**D7. Languages and texts.** New texts in the channels table, all maintained languages: the button label "Open in OpenTodo" and the test message is the existing "Test from OpenTodo". In the web app: the kind name, the field labels and help ("Create a bot with @BotFather and paste its token"), Find chats, the empty result ("Send any message to your bot, then try again"), the group warning and the error texts for `telegram_webhook_set`.

## Progressive disclosure and interface budget

Nothing changes until a person opens Add channel; the kind picker gains one entry with the Telegram glyph from the icon catalogue (or a generic "send" icon if the catalogue has none; no brand asset is bundled without checking its terms). The editor's Telegram fields replace the kind's fields in the same dialog; Find chats opens a small list inside it. No chrome above lists, no task property, no sidebar destination, no shortcut. At 360 px the chat list rows are at least 44 px tall.

## Data model

| Table | Change |
|---|---|
| `notification_channels` | `chat_id TEXT NOT NULL DEFAULT ''` (migration `NNNN_channel_chat_id`) |

No op, no synced field. Backups skip the secrets file as before, so a restored Telegram channel shows "token missing" and sends nothing until the token is entered again.

## Size and memory

About 150 lines of Go (sender, validation, discovery handler) and its tests; no dependency; a `getUpdates` answer is read through a 256 KB limit reader. The Settings chunk grows by under 1 KB gzip.
