# Proposal

## Why

Telegram is where many self-hosters already get their alerts: Home Assistant, Uptime Kuma, Proxmox and backup tools all ship a Telegram notifier, and Tududi, a self-hosted task app OpenTodo replaces, offers Telegram as its headline integration (research §1 Tududi; gap analysis "Telegram integration: Partial, relay recipe in docs/webhooks.md#telegram, native Telegram channel missing, S"). Today an OpenTodo user can only reach Telegram through the webhook channel and a relay such as Apprise, which means running and securing one more service just to get a reminder on the phone. `notification-channels` deliberately left Telegram out of its first four kinds; it is the most requested next one.

## What Changes

- **A fifth channel kind, `telegram`.** In Settings → Notifications → Delivery channels, Add channel offers Telegram. The person enters:
  - their own bot's token (from @BotFather), stored as a secret;
  - the chat id to send to: their private chat with the bot, a group or a channel the bot was added to;
  - optionally the address of a self-hosted Bot API server, `https://api.telegram.org` by default.
- **Find my chat.** After the person sends any message to their bot, a **Find chats** action lists the chats the bot has recently seen (name and id) so they pick one instead of hunting for a number. It asks the Bot API through the server with the token they typed. A new route, `POST /api/v1/notification-channels/telegram/chats`, does this.
- **Messages like the other kinds:** the same events, the same content policy ("include task titles" off by default, never content for an encrypted account), the same languages, queue, retries, limits, Send test, delivery log, audit events and owner switch. The text is plain with the event title in bold, and an **Open in OpenTodo** button when the server's address is public https (otherwise the link is the last line).
- **Group warning.** When the chat is a group or a channel, the editor says that everyone in it will read the messages, and asks for confirmation before turning on task titles.
- **Outbound policy.** Requests go only to the address the person configured (the Telegram Bot API by default), through `internal/outbound`, like Pushover. Nothing is contacted until the person saves a Telegram channel or uses Find chats. The bot token is part of the request path and is scrubbed from every error, log line and delivery entry.

No new environment variable, no new dependency, no op schema change. Not **BREAKING**.

## Out of scope

- A two-way bot: completing or snoozing a task from Telegram, adding tasks by messaging the bot, or inline commands. That needs an inbound webhook and a write path, and is a separate change if wanted.
- Forum topics (message thread ids) in groups, silent messages per event, and message formatting options.
- Matrix, Discord, Slack and Signal channels.
- Sending rule events to Telegram (rules stay in-app, as for every channel kind).

## Roadmap

Advances ROADMAP-1.0 milestone 0.21 "Horizons and home", item `telegram-channel`, and the research's §1 Tududi row "Telegram integration". In ROADMAP.md it extends the "Notification channels" row under Integrations.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `notification-channels`: the `telegram` kind and its settings, its request shape, the chat discovery route, the editor's Telegram fields and group warning.

## Impact

- **Data model, sync, op schema, E2EE:** none. Channels are server state outside the op log. The Bot API address is stored in the channels table's `url` column and the chat id in a new `chat_id` column (design D1). The bot token goes to `<data>/secrets/notification-channels.json`.
- **API:** `kind: "telegram"` and the `chatId` field on the existing channel routes; one new route, `POST /api/v1/notification-channels/telegram/chats`, signed in, demo-denied by the existing prefix, rate limited with the test limit.
- **CLI, MCP, CalDAV, vault:** none.
- **Outbound:** one more fixed default target (`api.telegram.org`), reached only when the person configures it, which keeps AGENTS rule 5.
- **Bundle and binary size:** about 3 KB of Go and under 1 KB gzip in the Settings chunk. No dependency.
