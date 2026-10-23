---
title: Delivery channels
summary: Send your reminders and notifications to ntfy, Pushover, Gotify, or any address through a signed webhook, including Apprise and Home Assistant.
audience: user
section: Guides
specs: [notification-channels, reminders]
screens: [settings/notification-channels]
order: 86
---
# Delivery channels

<picture><source srcset="images/settings-notification-channels-dark.webp" media="(prefers-color-scheme: dark)"><img src="images/settings-notification-channels-light.webp" alt="Settings, Notifications, the Delivery channels card with an ntfy channel and the Add channel button."></picture>

A delivery channel sends your notifications to a service you already use, even when every device is closed. It works next to [push notifications](push-notifications.md), not instead of them.

## Add a channel

1. Open **Settings → Notifications** and find **Delivery channels**.
2. Select **Add channel** and pick the service. Each service needs its own settings:
   - **ntfy:** the server (`https://ntfy.sh` or your own) and the topic your ntfy app subscribes to. Add an access token if the topic is protected.
   - **Pushover:** your user key and an application token you create on pushover.net.
   - **Gotify:** your server's address and an application token.
   - **Webhook:** any address that accepts a JSON POST.
3. Choose what to send: **Reminders**, **Assigned to me**, **Mentions**, **Ready to start** (a blocked task you're assigned to can begin) and **Task page replies**.
4. Save, then use **Send test** from the channel's menu to check it.

You can have up to five channels. Tokens and keys are stored on your server only and never shown again, so to change one, paste a new one.

## What a message says

With **Include task titles** off, the default, a message only says what happened, for example "A reminder is due", plus a link that opens the task. Turn it on to see the task's title and who acted.

With end-to-end encryption, messages never name a task or a person, whatever the switch says.

Messages are written in the language your app used when you saved the channel.

## Webhook, Apprise and Home Assistant

A webhook channel POSTs one JSON message per notification:

```json
{"version": 1, "id": "…", "event": "reminder", "createdAt": 1760000000000,
 "title": "OpenTodo", "message": "A reminder is due", "body": "A reminder is due",
 "url": "https://todo.example.com/?task=…", "task": {"id": "…"}}
```

The request is signed like [webhooks](webhooks.md): check `X-OpenTodo-Signature` with the signing secret shown once when you created the channel. **New signing secret** in the menu replaces it.

- **Apprise:** point the channel at your Apprise API server's notify address (`https://apprise.example.com/notify/<key>`). Apprise reads `title` and `body`.
- **Home Assistant:** create an automation with a **Webhook** trigger and use its address. The message is in `trigger.json`.

## When something fails

Failed messages are retried for about a day. After 20 failures in a row, the channel turns itself off and says why. Fix its settings, then turn it on again.

Your server allows at most 60 messages an hour per person. Each person can send 12 tests an hour.

A server on your home network (for example `http://192.168.1.20`) works only if the server owner allows private network targets under **Settings → Integrations → Webhooks**.

The server owner can turn delivery channels off for everyone in this card, with **On this server**.

## For server owners

| Item | Detail |
|---|---|
| Owner switch | On by default; the setting is `notifications.channels` |
| Secrets | `<data>/secrets/notification-channels.json`, outside backups and exports. After a restore, people enter their tokens again |
| Reminders | Reach channels while web push is on: `OPENTODO_PUSH=off` also stops them |
| Demo instance | Channels are not available |
