# Design

## Context

Notifications are produced in two places today:

- **The sync engine's sinks** (`notify.Sink` and its optional interfaces) receive `assigned`, `mentioned`, `unblocked` and task page events after the batch that caused them commits. `notify.InApp` stores them for the inbox.
- **The reminder scheduler** (`push.Service.Tick`) finds due reminders every 30 seconds, sends Web Push to each subscribed device, and records `delivered_at` as a server op, so a firing is handled once.

Outbound HTTP to user-typed addresses goes through `internal/outbound`. Webhooks have the durable queue, retry schedule, signing scheme and the owner's private-target policy. Per-user secrets that must not be synced or backed up live in `settings.SecretsFile` files under `<data>/secrets/`, as issue connection tokens do.

## Decisions

**D1. One package, `internal/channels`, as a sink and a reminder consumer.**

- `channels.Service` implements `notify.Sink`, `MentionSink`, `UnblockedSink` and `PageSink`. The tenant registers it with `syncSvc.AddSink` next to the inbox.
- For reminders, `push.Service` gains `SetReminderHook(func(ctx, Reminder))`, called in `tickUser` for every eligible due reminder before the devices are pushed.
- A sink must be quick, so the service only inserts queue rows and wakes its worker.
- Alternative: a separate scheduler for channels. Rejected: it would repeat the due-reminder query and its eligibility rules (completed task, project in the Trash, deleted reminder).

**D2. Exactly once per firing, independent of devices.** Every queued delivery carries a `dedupe_key`, unique per channel:

| Event | `dedupe_key` |
|---|---|
| reminder | `reminder:<id>:<fire_at>` |
| assigned | `assigned:<task>:<at>` |
| mentioned | `mentioned:<comment or task>:<at>` |
| unblocked | `unblocked:<task>:<at>` |
| page events | `page:<page>:<kind>:<at>` |

`INSERT OR IGNORE` makes the hook idempotent. While Web Push retries a reminder on later ticks (all sends failed, or the per-user budget ran out), the scheduler calls the hook again and nothing new is queued. A channel's own failure never holds back the devices, and failing devices never hold back the channel.

**D3. Four kinds, one message model.** The queue stores a rendered `Message`:

| Field | Meaning |
|---|---|
| `event` | the event kind |
| `title` | the line shown in bold |
| `body` | the text |
| `url` | a link into the app, when known |
| `taskId`, `pageId` | the ids, for the webhook |
| `taskTitle`, `actorName` | only when content may leave |

Each kind turns it into one request:

| Kind | Request |
|---|---|
| ntfy | `POST <server>` with JSON `{topic,title,message,click,tags,priority}`, using ntfy's JSON publishing, which carries UTF-8 safely; `Authorization: Bearer <token>` when set |
| Pushover | `POST https://api.pushover.net/1/messages.json`, form `token,user,title,message,url,url_title` |
| Gotify | `POST <server>/message`, `X-Gotify-Key: <token>`, JSON `{title,message,priority,extras:{"client::notification":{"click":{"url"}}}}` |
| Webhook | `POST <url>` with the versioned payload `{"version":1,"id","event","createdAt","title","message","body","url","task":{"id","title"},"actor":{"name"},"page":{"id"}}` and the webhook headers. `X-OpenTodo-Event` is `notification.<event>`, plus Delivery, Timestamp and Signature, the signature being `v1=` HMAC-SHA256 over `"<timestamp>.<body>"` (`webhook.Sign`) |

`body` duplicates `message` because Apprise's API server reads `title` and `body`. A notify URL of Apprise's API (`/notify/<key>`) then works without an adapter. Home Assistant's webhook trigger accepts any JSON.

**D4. Content policy.** A message's title and body name the task and the actor only when **all** of these hold:

1. The channel's `include_titles` is on (off by default).
2. The account has no end-to-end encryption key record (`e2ee.Store.Enabled`).
3. The value is not ciphertext (`e2ee.IsCiphertext`).

Otherwise the message says only what happened:

| Event | Generic text |
|---|---|
| reminder | "A reminder is due" |
| assigned | "A task was assigned to you" |
| mentioned | "You were mentioned" |
| unblocked | "A task you're assigned to is ready to start" |
| page reply | "A guest replied on a task page" |
| page completion | "A guest completed a task page" |

The click link is never content: `<origin>/?task=<id>`, with the ids being opaque UUIDs. The comment excerpt of a mention is content and follows the same rule.

**D5. Languages.** The client sends its current app language and its origin with every create and update, as the weekly digest does. Messages are rendered in that language from a small table in `internal/channels/messages.go`, with the six app languages and English as fallback. The origin is used only for the click link, and `OPENTODO_BASE_URL` wins when set. Alternative: render on the device. Rejected: the server sends while every device is closed.

**D6. Secrets.**
- `<data>/secrets/notification-channels.json` holds, per channel id:
  - `<id>`: the ntfy or Gotify token, the Pushover application token, or the webhook signing secret.
  - `<id>.user`: the Pushover user key.
- The table stores only `token_set`. Backups skip the secrets directory, as they do for issue tokens, so a restored server shows the channel with "token missing" and the person enters it again.
- The webhook signing secret is generated (`whsec_…`) and returned once on creation. A `rotateSecret` patch returns a new one once.
- Secrets never appear in logs, the delivery log or errors.
- Audit:

  | Event | Details |
  |---|---|
  | `notification_channel.created` | `notification_channel_id`, `channel_kind` |
  | `notification_channel.updated` | the id, the kind, `setting`, never values |
  | `notification_channel.deleted` | the id, the kind |

  The detail keys are added to the allow-list, and none of them is an op field name.

**D7. Outbound and the owner's policy.**

- **The client:** `outbound.NewClient` with a dialer whose `AllowPrivate` is the webhook service's owner policy. That policy is one switch, "allow private network targets", already explained in Settings → Integrations → Webhooks; the error message names it.
- **Pushover's host** is fixed and public. A test hook replaces its base URL in tests only.
- **At creation,** the address is checked like a webhook target: refused with `private_target` when it resolves only to private addresses and the owner has not allowed them.
- **On a host (multi-tenant),** the policy is forced off, as for webhooks.

**D8. Queue, retries, limits.**

- **Tables (migration `0046_notification_channels`):**

  | Table | Columns |
  |---|---|
  | `notification_channels` | id, user_id, kind, name, url, topic, events, include_titles, lang, origin, enabled, disabled_reason, consecutive_failures, last_ok_at, last_error, created_at, updated_at |
  | `notification_deliveries` | id, channel_id, user_id, event, dedupe_key, message, status, attempts, next_attempt_at, last_status_code, last_error, created_at, delivered_at; unique (channel_id, dedupe_key) |

  Both cascade on the account's and the channel's deletion.
- **One worker loop** on the jobs leader, as for webhooks:
  - four sends in parallel and a 10-second timeout;
  - the retry schedule and jitter of `webhook.Backoff`;
  - `private_target` and `invalid_url` are terminal;
  - 20 consecutive failures turn the channel off with the reason `too_many_failures`.
- **Pruning:** older than 30 days, or beyond the newest 50 per channel.
- **Per-person limit:** at most 60 messages queued per rolling hour across channels. More are recorded as `skipped` with `rate_limited`, so the log shows why, and are not sent.
- **Tests:** at most 12 an hour per person, in memory, like issue checks.
- **Accounts:** at most 5 channels each.

**D9. Owner switch.**

- The settings key is `notifications.channels`, on unless set to false. `GET` is for any signed-in user, `PUT` for the owner only, and a change is recorded as `settings.changed`.
- While it's off:
  - the sink and the hook queue nothing;
  - the worker sends nothing, and queued rows wait;
  - the channel routes answer 404 `channels_disabled`.
- On a demo instance:
  - every route, settings included, is refused by the policy and the deny list;
  - the sink is not registered;
  - the worker never runs.

**D10. Interface.**

- The **Delivery channels** card follows the push card on Settings → Notifications: one row per channel, showing its kind icon, name, an enabled switch, the last result ("Last delivered 3 min ago", or the error) and a menu with Edit, Send test and Delete.
- **Add channel** opens a dialog:
  - **Kind**, as a choice of four;
  - **Name**;
  - the kind's fields, secrets as password inputs showing "Saved" when set;
  - **Events**, as five switches;
  - **Include task titles**.
- The owner sees one more row, **On this server**, with the switch. A member sees that row only while it's off.
- Offline and on an encrypted account, a notice explains the limits. On an encrypted account the titles switch is disabled with its reason.

The card adds no chrome above any list, no sidebar destination and no shortcut, so the interface budget is unchanged.

## Data model

| Area | Change |
|---|---|
| Ops, sync, e2ee | None: no op, no sync field, no change to `CONTENT_FIELDS` |
| Migration | `0046` adds two server tables, outside the op log, like webhooks and issue connections |
| Secrets | One secrets file; the export never includes it |

## Size and runtime

| Measure | Effect |
|---|---|
| Dependencies | None (stdlib HTTP and JSON) |
| Binary | About 40 KB of Go |
| Web bundle | About 6 KB minified for the card and dialog, in the settings chunk |
| Runtime memory | One worker goroutine and a small in-memory test limiter |

## Security review

| Risk | Mitigation |
|---|---|
| SSRF | The outbound policy, the pinned connection, no redirects, and checks at creation and on every send |
| Secret disclosure | Kept out of the database, logs, the API after creation, backups and export; the audit records names of settings only |
| Content leaving the server | Off by default per channel, never with encryption (D4) |
| Abuse as a request cannon | 5 channels, 60 messages an hour, 12 tests an hour, auto-disable after 20 failures, owner switch, never on the demo |
| Replay against a webhook receiver | Timestamp in the signed string, as for webhooks |

## Open questions

- **Rule notifications:** should the automation rules' "notify" action also go to channels?
- **Without Web Push:** reminders reach channels only while the reminder scheduler runs, which today means Web Push is on (`OPENTODO_PUSH` not `off`). Should the scheduler run without push?
