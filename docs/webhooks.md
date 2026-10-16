---
title: Webhooks
summary: Events, payload, signature checks, retries and recipes for Home Assistant, n8n and Telegram.
audience: developer
section: Integrations
specs: [webhooks]
screens: []
order: 30
---
# Webhooks

OpenTodo can notify other systems when your tasks and projects change: switch on a light when "Water plants" is completed, post to a chat when a task is created, start an n8n flow when a project is archived. Webhooks are configured per account in **Settings → Integrations → Webhooks** (choose **Add webhook**, then pick the target URL, events and an optional project) or through the [API](api.md#webhooks). Each webhook's **⋯** menu has **Send test**, **Delivery log**, **Edit**, **Disable** or **Enable**, and **Delete**, which asks you to confirm. Nothing is sent until you create one, and requests only ever go to the URLs you configured.

## Events

| Event | Fires when |
| --- | --- |
| `task.created` | a task appears for the first time (`created_at` is set) |
| `task.updated` | any other field of a task changes (title, notes, due date, priority, project, labels, position, undelete…) |
| `task.completed` | `completed_at` goes from empty to a time |
| `task.reopened` | `completed_at` goes from a time back to empty |
| `task.deleted` | the task gets a tombstone (`deleted_at` is set) |
| `project.created` | a project appears for the first time |
| `project.updated` | any other field of a project changes, including un-archiving |
| `project.archived` | `archived` goes from false to true |
| `project.deleted` | the project gets a tombstone |
| `import.completed` | an [import](import.md) job finished (done or failed): one summary for the whole job, see [Imports](#imports) |
| `import.undone` | an import was undone: one summary, see [Imports](#imports) |
| `ping` | you pressed **Send test** (not subscribable, always sent on request) |

Task and project events are derived on the server from the operation log, whatever wrote the change: a phone or browser syncing, the REST API, the `ot` CLI and CalDAV. Imports are the exception: they are reported once per job (see [Imports](#imports)). Rules:

- **One event per entity per batch.** A sync batch that creates a task and sets six fields produces one `task.created`, not seven events. When several rules apply the first wins, in this order: created, deleted, completed, reopened, archived, updated.
- **Only real changes.** An edit that loses under last-writer-wins (an older offline change arriving after a newer one), a duplicate retry, or a write of the value the field already had produces no event.
- **Offline edits fire when they sync.** A task completed on a phone in airplane mode fires `task.completed` when the phone reconnects. `time` in the payload is the time the server saw the change; the task's own `completed_at` is when you did it.
- **Project filter.** A webhook can be limited to one project. Task events then fire only for tasks in that project (or moved into or out of it); project events only for that project.
- Webhooks only see your own data.

## Payload (version 1)

Every delivery is a `POST` with a JSON body:

```json
{
  "version": 1,
  "id": "6c4f2f0a-8a8e-4d7e-9d7f-3c1b2a0e9f11",
  "event": "task.completed",
  "time": 1760060001000,
  "webhook_id": "0b9a2e4c-…",
  "source": "device",
  "device": "e4656b83-…",
  "data": {
    "task": {
      "id": "…", "title": "Water plants", "description": "", "project_id": null, "parent_id": null,
      "priority": 4, "due": {"date": "2026-10-10"}, "labels": [], "position": 1760000000000,
      "created_at": 1760000000000, "completed_at": 1760060000000, "deleted_at": null
    }
  },
  "changes": {
    "completed_at": { "from": null, "to": 1760060000000 }
  }
}
```

| Field | Meaning |
| --- | --- |
| `version` | payload format version; additive changes keep `1` |
| `id` | unique delivery id; also in `X-OpenTodo-Delivery`. Use it to de-duplicate |
| `event` | event name, also in `X-OpenTodo-Event` |
| `time` | when the server derived the event, Unix milliseconds |
| `webhook_id` | the webhook that matched, also in `X-OpenTodo-Webhook` |
| `source` | `device` (a syncing app), `server` (REST API / CLI), `import` or `caldav`. Lets a receiver ignore changes it caused itself |
| `device` | the device id when `source` is `device` |
| `data.task` / `data.project` | the entity's current state with the same fields as the [REST API](api.md#task-fields), except the opaque note document `notes_doc` (the note's text is `description`). `ping` carries `data: {}` |
| `changes` | the fields that changed in this batch with their previous (`from`) and new (`to`) values; `from` is `null` when the field had no value before. `notes_doc` is never listed, and a change that only touched it (a merged note republished with the same text) sends no event |

A task's [custom field](custom-fields.md) values are in `data.task.fields`, an object keyed by field definition id like the REST API's; a changed value is listed in `changes` as `fields.<id>` (for example `"fields.f1": {"from": 120, "to": 150}`), with the `task.updated` event.

### Encrypted accounts

For an account with [end-to-end encryption](e2ee.md), content fields in payloads (`title`, `description`, `name`) carry the stored ciphertext (`"enc:v1:…"`); the server cannot decrypt them. Dates, priority and completion stay plaintext.

### Imports

An import can write tens of thousands of tasks; one delivery per task would flood a receiver and the delivery queue. So the changes an import (or its undo) writes never produce `task.*` or `project.*` events. Instead each finished job produces **one** `import.completed` delivery, and each undo **one** `import.undone`, per webhook subscribed to that event. Subscribe to them explicitly; a webhook that only lists `task.created` sees nothing from imports. Changes you make afterwards to imported tasks fire the usual events.

```json
{
  "version": 1,
  "id": "…",
  "event": "import.completed",
  "time": 1760060001000,
  "webhook_id": "…",
  "source": "import",
  "data": {
    "import": {
      "id": "<import job id>",
      "format": "csv",
      "status": "done",
      "totals": { "rows": 120, "create": 120, "written": 121, "ops": 360, "...": 0 },
      "counts": { "task": { "created": 120 }, "project": { "created": 1 } },
      "project_ids": ["<project id>"]
    }
  },
  "changes": {}
}
```

| Field | Meaning |
| --- | --- |
| `data.import.id` | the import job (`GET /api/v1/import/jobs/{id}`) |
| `status` | `done` or `failed` for `import.completed` (`message` then says why), `undone` for `import.undone` |
| `totals` | the job's totals as the import API reports them |
| `counts` | entities written by this run, per kind (`task`, `project`, `label`, `section`, `reminder`, `view`) and action: `created` and `updated` for an import, `deleted` for an undo |
| `project_ids` | the projects the run created or wrote tasks into, sorted |

The importing user's webhooks receive every touched project. When an import writes into a shared project, each other member's subscribed webhooks receive the same summary with `project_ids` limited to the shared projects they belong to. A webhook with a project filter receives the summary only when its project is in `project_ids`. Summaries are queued, signed, retried and logged like every other delivery.

## Headers and signature

| Header | Example |
| --- | --- |
| `Content-Type` | `application/json` |
| `User-Agent` | `OpenTodo/<version>` |
| `X-OpenTodo-Event` | `task.completed` |
| `X-OpenTodo-Delivery` | delivery id (same as `id` in the body) |
| `X-OpenTodo-Webhook` | webhook id |
| `X-OpenTodo-Timestamp` | Unix **seconds** when this attempt was sent |
| `X-OpenTodo-Signature` | `v1=<hex HMAC-SHA256>` |

The signature is `hex(HMAC-SHA256(key = secret, message = "<X-OpenTodo-Timestamp>.<raw request body>"))`, prefixed with `v1=`. The key is the whole secret exactly as shown when you created the webhook, including the `whsec_` prefix. To verify:

1. Read the raw body bytes before parsing JSON (re-serialising changes the bytes).
2. Recompute the HMAC over `timestamp + "." + body` and compare it to the header with a constant-time comparison.
3. Reject the request if the timestamp is too old (five minutes is a good tolerance) to stop replays.

Each retry and each redelivery is signed again with a fresh timestamp, so signatures differ between attempts while the body stays the same.

### Test vector

Use this to check your implementation:

| Input | Value |
| --- | --- |
| secret | `whsec_opentodo-test-vector-secret-do-not-use` |
| timestamp | `1760060001` |
| body | `{"version":1,"id":"7d3c1f0e-0000-4000-8000-000000000001","event":"ping","time":1760060001000,"webhook_id":"0b9a2e4c-0000-4000-8000-000000000002","source":"server","data":{},"changes":{}}` |
| signature | `v1=a049099332920d6f2b44a294b46fc5260f87dfc36294f77069b5ab0058589b98` |

The server's own test suite (`TestSignatureMatchesReferenceVector` in `internal/webhook`) checks the same vector.

**Shell** (OpenSSL):

```bash
secret='whsec_opentodo-test-vector-secret-do-not-use'
timestamp='1760060001'
body='{"version":1,"id":"7d3c1f0e-0000-4000-8000-000000000001","event":"ping","time":1760060001000,"webhook_id":"0b9a2e4c-0000-4000-8000-000000000002","source":"server","data":{},"changes":{}}'
printf '%s' "$timestamp.$body" | openssl dgst -sha256 -hmac "$secret" -hex | sed 's/^.*= /v1=/'
# v1=a049099332920d6f2b44a294b46fc5260f87dfc36294f77069b5ab0058589b98
```

**Python** (standard library):

```python
import hashlib, hmac, time

def verify(secret: str, timestamp: str, body: bytes, signature: str, tolerance: int = 300) -> bool:
    if abs(time.time() - int(timestamp)) > tolerance:
        return False  # too old: possible replay
    expected = "v1=" + hmac.new(secret.encode(), timestamp.encode() + b"." + body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)

# Test vector (tolerance disabled because the vector is old):
body = b'{"version":1,"id":"7d3c1f0e-0000-4000-8000-000000000001","event":"ping","time":1760060001000,"webhook_id":"0b9a2e4c-0000-4000-8000-000000000002","source":"server","data":{},"changes":{}}'
print(verify("whsec_opentodo-test-vector-secret-do-not-use", "1760060001", body,
             "v1=a049099332920d6f2b44a294b46fc5260f87dfc36294f77069b5ab0058589b98", tolerance=10**10))  # True
```

**JavaScript** (Node.js 18+, no dependencies):

```js
const crypto = require('node:crypto')

function verify(secret, timestamp, rawBody, signature, toleranceSec = 300) {
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > toleranceSec) return false // replay
  const expected = 'v1=' + crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex')
  const a = Buffer.from(expected), b = Buffer.from(signature)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// Test vector (tolerance disabled because the vector is old):
const body = '{"version":1,"id":"7d3c1f0e-0000-4000-8000-000000000001","event":"ping","time":1760060001000,"webhook_id":"0b9a2e4c-0000-4000-8000-000000000002","source":"server","data":{},"changes":{}}'
console.log(verify('whsec_opentodo-test-vector-secret-do-not-use', '1760060001', body,
  'v1=a049099332920d6f2b44a294b46fc5260f87dfc36294f77069b5ab0058589b98', Infinity)) // true
```

In an Express app use `express.raw({ type: 'application/json' })` for the webhook route so `req.body` is the raw `Buffer`.

## Delivery, retries and the log

- Deliveries are queued in the database, so a restart loses nothing: anything pending is sent after the server starts again.
- Each attempt times out after **10 seconds**. Any `2xx` answer is success; everything else (other status codes, timeouts, connection errors, redirects) is a failure.
- A failed delivery is retried up to **six times** after the first attempt, waiting 30 s, 5 min, 30 min, 2 h, 8 h and 16 h (each ±20 % jitter), about 27 hours in total. After the last retry the delivery is marked `failed`.
- Delivery is **at least once** and **not ordered**. A receiver that answers slowly or crashes after processing may see the same delivery again; de-duplicate on `id`.
- After **20 consecutive failed deliveries** (each having used all its retries) the webhook is disabled automatically. Settings shows "Disabled after repeated failures" (`disabledReason: "too_many_failures"`); nothing more is queued until you enable it again, which also resets the counter. A successful delivery resets the counter too.
- **Send test** sends a `ping` right away (one attempt, no retries, not counted toward auto-disable) and shows the status code and duration.
- The **delivery log** keeps the last 100 deliveries per webhook with status (`pending`, `retry`, `delivered`, `failed`), number of attempts, last status code, last error, duration and the first kilobyte of the response body. Entries older than 30 days are removed. **Redeliver** queues the same body again with a new delivery id.

## Private network protection

A server that sends HTTP requests on behalf of its users could be abused to reach things that are not meant to be reachable: the router's admin page, other containers, a cloud metadata endpoint. By default OpenTodo therefore refuses webhook targets on:

- loopback (`127.0.0.0/8`, `::1`), unspecified (`0.0.0.0`, `::`) and "this network" (`0.0.0.0/8`),
- private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), carrier-grade NAT and Tailscale (`100.64.0.0/10`), unique-local IPv6 (`fc00::/7`, including `fd00::/8`),
- link-local (`169.254.0.0/16`, `fe80::/10`), which includes the cloud metadata address `169.254.169.254`,
- multicast, broadcast and reserved ranges, and IPv4 addresses embedded in IPv6 (`::ffff:10.0.0.1`, NAT64, 6to4).

How it is enforced:

- Only `http://` and `https://` URLs, at most 2,048 characters.
- The check runs when a webhook is created or its URL is changed (400 `private_target`) and again on **every delivery**: the server resolves the host name itself, drops denied addresses and connects to the address it checked, so a DNS answer that changes later (DNS rebinding) cannot sneak in a private address. If every address is denied, the delivery fails with `private_target` and no connection is made.
- Redirects are never followed; a `3xx` answer counts as a failure.
- The server ignores `HTTP_PROXY`/`HTTPS_PROXY` for webhook deliveries, because a proxy would make the connection on its behalf and bypass the check.

### Allowing receivers on your LAN

Home Assistant, n8n or Node-RED often run on the same network as OpenTodo. The **owner** can switch on **Settings → Integrations → Webhooks → Allow private network targets** (or `PUT /api/v1/settings/webhooks` with `{"allowPrivate": true}`). This applies to every account on the server, and to [calendar subscriptions](api.md#calendar-feeds) too, so leave it off on a public multi-user server. The scheme restriction and the no-redirect rule stay in force.

For deployments managed as code, the optional `OPENTODO_WEBHOOKS_ALLOW_PRIVATE=true` presets the toggle on the first start. After that the value in Settings wins, so the owner can still turn it off.

### Secrets

The secret (`whsec_…`) is shown once, in the dialog right after the webhook is created, with a **Copy** button. It is stored in the server database in plaintext because the server needs it to sign each request; the database file is the trust boundary, just as for sessions and API tokens. If a secret leaks, delete the webhook and create a new one. Webhooks are server configuration: they are not part of the JSON export and not synced to devices.

Settings warns when a target uses plain `http://` outside this machine: the payload contains task content and would cross the network unencrypted.

## Receiver recipes

### Home Assistant

1. In Home Assistant, create an automation with a **Webhook** trigger. Note the webhook id, for example `opentodo-plants`. Leave "Only accessible from the local network" on if OpenTodo runs on your LAN.
2. As the owner, enable **Allow private network targets** in OpenTodo (Home Assistant usually lives at `http://192.168.x.x:8123`).
3. In OpenTodo, add a webhook to `http://<home-assistant>:8123/api/webhook/opentodo-plants` with the event `task.completed`, optionally limited to a "Home" project.
4. In the automation, add a condition on the payload and an action:

```yaml
alias: Plants watered
triggers:
  - trigger: webhook
    webhook_id: opentodo-plants
    allowed_methods: [POST]
    local_only: true
conditions:
  - condition: template
    value_template: "{{ trigger.json.event == 'task.completed' and 'plants' in trigger.json.data.task.title | lower }}"
actions:
  - action: light.turn_on
    target:
      entity_id: light.kitchen
```

Home Assistant's webhook trigger does not check signatures; the long random webhook id acts as the shared secret, so keep it unguessable and keep `local_only` on. Use n8n (below) in front of Home Assistant if you want signature verification.

### n8n

1. Add a **Webhook** node, method `POST`, and under *Options* enable **Raw Body** so the exact bytes are available for verification. Copy the production URL.
2. In OpenTodo, add a webhook with that URL and the events you need. If n8n runs on your LAN, the owner enables private network targets first.
3. Add a **Code** node after the webhook to verify the signature (set the secret as an n8n credential or environment variable rather than in the code):

```js
const crypto = require('crypto')
const secret = $env.OPENTODO_WEBHOOK_SECRET
const item = $input.first()
const headers = item.json.headers
const raw = Buffer.from(item.binary.data.data, 'base64') // raw body from the Webhook node
const expected = 'v1=' + crypto.createHmac('sha256', secret).update(headers['x-opentodo-timestamp'] + '.').update(raw).digest('hex')
const fresh = Math.abs(Date.now() / 1000 - Number(headers['x-opentodo-timestamp'])) < 300
if (!fresh || expected !== headers['x-opentodo-signature']) throw new Error('bad OpenTodo signature')
return [{ json: JSON.parse(raw.toString('utf8')) }]
```

On self-hosted n8n, allow the `crypto` module in the Code node (`NODE_FUNCTION_ALLOW_BUILTIN=crypto`). Then branch on `{{$json.event}}` with a **Switch** node.

4. Press **Send test** in OpenTodo: n8n receives a `ping`.

### Telegram

Telegram's Bot API cannot consume an arbitrary JSON body, so put a small relay in between. The simplest is n8n: after the verification step above, add a **Telegram** node with the text `✅ {{$json.data.task.title}}` for `task.completed`. Without n8n, a few lines of Python on the same host do the job:

```python
# telegram_relay.py: python3 telegram_relay.py (listens on 127.0.0.1:8099)
import hashlib, hmac, http.server, json, os, time, urllib.parse, urllib.request

SECRET = os.environ["OPENTODO_WEBHOOK_SECRET"]
BOT, CHAT = os.environ["TELEGRAM_BOT_TOKEN"], os.environ["TELEGRAM_CHAT_ID"]

class Relay(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        body = self.rfile.read(int(self.headers["Content-Length"]))
        ts, sig = self.headers["X-OpenTodo-Timestamp"], self.headers["X-OpenTodo-Signature"]
        expected = "v1=" + hmac.new(SECRET.encode(), ts.encode() + b"." + body, hashlib.sha256).hexdigest()
        if abs(time.time() - int(ts)) > 300 or not hmac.compare_digest(expected, sig):
            self.send_response(401); self.end_headers(); return
        event = json.loads(body)
        task = event.get("data", {}).get("task") or {}
        text = {"task.created": "🆕 ", "task.completed": "✅ "}.get(event["event"], event["event"] + ": ") + task.get("title", "")
        data = urllib.parse.urlencode({"chat_id": CHAT, "text": text}).encode()
        urllib.request.urlopen(f"https://api.telegram.org/bot{BOT}/sendMessage", data, timeout=5)
        self.send_response(204); self.end_headers()

http.server.HTTPServer(("127.0.0.1", 8099), Relay).serve_forever()
```

Point an OpenTodo webhook at `http://127.0.0.1:8099/` (owner: allow private network targets). The relay, not OpenTodo, talks to Telegram.
