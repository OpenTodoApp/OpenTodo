# Proposal

## Why

Issue #271 asks for notifications outside the app: people who self-host already run ntfy, Pushover, Gotify, Apprise or Home Assistant, and want OpenTodo's reminders and "assigned to you" notices to arrive there. Today a notification reaches a person in three ways only: the in-app inbox, Web Push to a browser or installed app that subscribed, and the weekly email digest. Web Push needs a subscription per device and a browser that keeps it alive. A phone that already runs the ntfy app, or a household that routes everything through Home Assistant, has no way in. Webhooks exist, but they describe task and project changes for integrations, not notifications meant for one person.

## What Changes

- **Delivery channels per person.** Settings → Notifications gains a **Delivery channels** card. Each person adds up to five channels of four kinds:
  - **ntfy:** server address, topic, optional access token.
  - **Pushover:** user key and application token.
  - **Gotify:** server address and application token.
  - **Webhook:** any address, POSTed one documented, versioned JSON notification payload, signed with the same `X-OpenTodo-Signature` scheme as webhooks. It also serves Apprise's API server and Home Assistant's webhook trigger; the guide shows both.
- **Events per channel.** Each channel has switches for the events it receives: reminders, assigned, mentioned, unblocked, and task page replies and completions. A **Send test** action sends a real test message through the channel.
- **Reminders through the existing scheduler.** The reminder scheduler that sends Web Push also hands each firing to the channels once. Pushing to devices and sending to channels are independent, and a reminder is never sent twice to the same channel.
- **Privacy.**
  - Messages carry task titles and people's names only when the channel's **Include task titles** switch is on; otherwise they say only what happened ("A reminder is due").
  - An account with end-to-end encryption never sends content to a channel.
  - Secrets (tokens, user keys, the signing secret) live in `<data>/secrets/notification-channels.json`. They're never synced, never logged and never returned after creation, except the webhook signing secret, shown once.
- **Outbound policy.** Every request goes through `internal/outbound`: http(s) only, the connection pinned to the checked address, and private network targets refused unless the owner allows them. The owner's existing webhook switch for private targets governs both, since self-hosted ntfy and Gotify usually live on the LAN.
- **Durable, bounded delivery.**
  - A queue in SQLite with the webhooks' retry schedule (about 27 hours).
  - A channel is turned off after 20 consecutive failures.
  - A per-person limit of 60 messages an hour, and 12 tests an hour.
  - A delivery log per channel (30 days, the newest 50).
- **Owner switch.** The Delivery channels card shows the owner a switch **On this server** (like Issues), on by default, like webhooks. Turned off, nothing is queued or sent and the routes answer 404 `channels_disabled`. The demo refuses every route and runs no worker.
- **API.**
  - `GET`/`POST /api/v1/notification-channels`.
  - `PATCH`/`DELETE /api/v1/notification-channels/{id}`.
  - `POST /api/v1/notification-channels/{id}/test` and `GET /api/v1/notification-channels/{id}/deliveries`.
  - `GET`/`PUT /api/v1/settings/notification-channels` for the owner switch.
  
  Creating, deleting and changing a channel's secret are recorded in the audit log.
- **Languages.** Messages are written in the language the person's app used when the channel was saved (the six app languages).

No new environment variable, no new dependency, no change to the op log or to synced data. Not **BREAKING**.

## Out of scope

- **More channel kinds.** Telegram, Matrix, Discord, Slack, email per event and SMS. The webhook kind reaches most of them through Apprise.
- **Delivery tuning.** Per-project or per-label routing, quiet hours, and per-channel priority mapping beyond one fixed priority per event kind.
- **Rule events.** The automation rules' "notify" action stays in-app; a later change can route rule events to channels.
- **The command-line client.** No `ot` commands; the routes are documented for scripts.
- **Web Push.** Unchanged.

## Roadmap

Advances "Reminders and web push notifications" (`reminders`) and "Assignees and in-app notifications" (`task-assignment`) in ROADMAP.md §4 and §5, and adds a row "Notification channels: ntfy, Pushover, Gotify and a webhook" under §6 Integrations. Closes #271.

## Capabilities

### New Capabilities

- `notification-channels`: per-person delivery channels, their events, privacy, the delivery queue, the owner switch, the routes and the payload.

### Modified Capabilities

None. Reminders, in-app notifications and webhooks keep their requirements. The reminder scheduler gains a second consumer, described in the new capability.
