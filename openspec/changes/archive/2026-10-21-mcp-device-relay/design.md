## Context

`/mcp` (internal/httpapi/mcp.go, internal/mcp) serves tools from the one registry in `internal/agenttools`. Every write passes the permission gate (owner switch `mcp.writes`, the user's agent-access switch, an `agent` token), the limits (50 entities per call, 30 calls a minute, 1,000 entities a day), planning into a change set, `ApplyStrict` with device `agent:<token-id>`, `NotifyApplied`, and one `agent.write` audit event. For an account with end-to-end encryption the registry renders content fields as an encrypted placeholder in results and refuses content arguments with `encryption_enabled` (`registry.go: encryptionErr`); structural writes work.

The account key exists only on unlocked devices (web app, kept non-exportable in browser storage; after `mcp-projects`, also `ot` with the system keychain). Devices learn about changes through `GET /api/v1/sync/events`, a per-device SSE stream that by spec carries no content, only a cursor; at most ten streams per account, oldest closed first. In a browser one tab runs the sync loop, chosen with a browser lock.

A cloud MCP client (claude.ai connectors, remote agents) reaches only the server. Whatever answers it must hand it plaintext over the HTTPS connection the client opened to the server.

## Goals / Non-Goals

**Goals**
- A cloud MCP client can read and write content of an encrypted account while one of the user's opted-in devices is online and unlocked.
- The server never holds the key or anything derived from it, never stores or logs relayed plaintext, and cannot decrypt anything without a live device answering.
- Every existing rule of MCP writes (gate, limits, planning, audit, attribution, op log, convergence) applies unchanged.
- Failure is explicit and fast: no device, a locked device or a slow device produce a clear tool error, never a hang.

**Non-Goals**
- Keeping relayed plaintext invisible to the server process. Impossible for a remote client: it terminates TLS at the server, sends arguments there and reads results from there. Rejected alternatives below.
- Background relaying on phones; relaying for REST agent routes; relaying for shared or public data.

## Decisions

### D1. The device is the account's crypto agent, not a second tool runtime
The server keeps running every tool. Two steps are delegated per call:
- **decrypt(values[])**: before a result leaves the server, the ciphertext values it would render as placeholders (titles, descriptions, notes, comment bodies, names, origins…) are sent to the device, which returns plaintext or an error per value.
- **encrypt(values[])**: before a write is planned into ops, the content arguments (`title`, `description`, `name`, comment `body`…) are sent to the device, which returns ciphertext produced with the account key in the normal envelope, so the ops look exactly like a device's own edits.

*Alternative rejected:* the device runs the whole tool (reads its local store, plans ops, returns them). It would need a TypeScript copy of the registry, its validation, limits and planning, which would drift from the Go registry, and it does not hide more: the result still travels through the server in plaintext to reach the client. One registry, one gate, one audit path wins.

### D2. A separate relay stream; the sync wake-up stream stays content-free
`GET /api/v1/relay/events` (SSE, session or device-bound credential, one per opted-in device) carries relay requests: `{id, op: "decrypt"|"encrypt", values, call: {tool, token_label}, deadline}`. The device answers with `POST /api/v1/relay/answers/{id}`. The existing `/api/v1/sync/events` keeps its "no content" rule untouched, so proxies and logs that rely on it stay safe. Both are inbound connections from the device: the server still makes no outbound request (`mcp-server` "Limits and no outbound calls" holds).

*Alternative rejected:* long-poll. SSE is already used twice (sync events, assistant turns), works behind the same reverse proxies and reconnects with the same backoff.

### D3. Opt-in per device, as server state
"Answer AI connectors from this device" is a switch on an unlocked device, stored server-side keyed by the account and the device id (a small table `relay_devices(user_id, device_id, label, enabled_at)`), not an op: it is about this server and this device, never synced as user data. Turning it on needs a recently confirmed session (`.recent()`), like other credential-adjacent settings. It is cleared when the device locks (the device stops its relay worker and calls the off route), signs out, when encryption is turned off on the account, and when the owner turns MCP off (the row stays, the stream is refused). Demo instances deny the routes.

### D4. Which device answers
Among the account's opted-in devices with an open relay stream, the server picks the one whose stream most recently delivered an answer or heartbeat; ties by most recent `enabled_at`. One in-flight request per device; up to 4 queued per account; a fifth concurrent call gets `device_busy`. If the chosen device does not answer within its share of the deadline, the server does not retry on another device (a retry could double-encrypt a write; reads are cheap to retry by the client) and returns `device_timeout`.

### D5. Deadlines
The relay deadline is the remaining MCP request deadline minus a margin: at most 20 s for a read, 30 s for a write (a write may wait for a confirmation, D7). The browser worker answers from the syncing tab; a hidden tab still answers SSE events in current browsers, but timers are throttled, so the answer path is event-driven only.

### D6. Limits on both sides
- **Server:** per account, at most 60 relayed requests a minute and 2,000 values (and 2 MB of plaintext) per request batch; the existing MCP limits apply first (200 items per page, 50 entities per write).
- **Device:** its own caps, enforced locally regardless of what the server asks: 5,000 decrypted values per hour and 20,000 per day by default, a visible counter, and "Stop relaying" one click away. Over a cap the device answers `device_limit` for the rest of the window. This bounds what a compromised or buggy server could pull through a device that stays online.

### D7. Confirmation of writes on the device: optional, default off
A per-device option "Ask me before AI connectors change anything" shows the change set (the in-app assistant's review sheet) with Apply / Decline before the device encrypts the write's content. Declining returns `declined_on_device`; no op is written. Default off, because a cloud agent typically runs when nobody is at the device; reads are never confirmed (they would make the relay unusable).

### D8. What the server may keep
Relayed plaintext lives only in the request's memory: never written to the database, the op log, caches, debug logs or audit details. The audit catalogue gets `relay.enabled` and `relay.disabled` (device label, device id), no per-call event: each write already produces `agent.write` with counts only, and reads are not audited today. MCP debug logging stays "method and duration only".

### D9. Key versions and passphrase changes
A passphrase change re-wraps the same account key, so relaying continues. Encrypting always uses the device's current key version; decrypting a value of an older version works as on the device today. Turning encryption off removes every relay row (D3) because there is nothing to relay.

### D10. Data model, size, interface budget
- One new table `relay_devices` (migration NNNN), additive; no op field, no change to the op schema or `e2ee.ContentFields`.
- No new dependency; server image unchanged; runtime memory bounded by 4 queued requests × 2 MB per account plus streams (capped like sync streams: ten per account, oldest closed).
- Interface: one switch and one option in Settings → Assistants, a small relay indicator in the sidebar footer next to the sync status while a request runs (no new row of chrome), the existing review sheet for D7. No new shortcut.

### D11. Security review outcome (task 0.1)
The review is in [security-review.md](security-review.md). It adds six requirements, now part of this design:
- **R1. Payloads sealed per stream.** The device opens the stream with an ephemeral ECDH P-256 public key, the server replies with its own in the first event, and both derive an AES-256-GCM key with HKDF-SHA-256 (info `opentodo relay v1`, salt = stream id). Request and answer values are sealed with it, the request id as associated data, so a TLS-terminating proxy sees ciphertext on the relay leg and only the stream's holder can answer.
- **R2. Opt-in bound to the session** that turned it on (`relay_devices.session_hash`); only that session opens the stream or answers; signing out removes the row.
- **R3. The device checks requests:** only content fields of known entities, at most 2,000 values a request.
- **R4. Device caps persist on the device** and cannot be reset by the server.
- **R5. Encryptions count against the caps** like decryptions.
- **R6. Only rendered values are decrypted:** the server marks ciphertext while loading, runs the tool, and asks the device only for the values whose markers appear in the result.

## Risks / Trade-offs

- **The trust model changes while the relay is on.** A compromised server can fabricate tool calls and get the opted-in device to decrypt values, up to the device caps (D6), and can read what is relayed. That is why it is opt-in per device, off by default, capped locally, visible while active, and stopped by locking. The Settings copy and docs/e2ee.md must say this in plain words.
- **Prompt injection reaches more data.** Decrypted titles and notes go to the cloud model inside the existing untrusted-text wrapper; nothing new beyond the plaintext case.
- **Availability.** Works only while a device is on, unlocked and online; phones in the background do not answer. Assistants get `device_unavailable` with an actionable message.
- **Double effects.** No cross-device retry for writes (D4); the op ids planned server-side keep `ApplyStrict` idempotent if the client retries the whole call.

## Migration Plan

No data migration beyond creating the empty table. Ship behind the existing owner MCP switch; the relay routes refuse while MCP is off. Rollback: remove the routes; the table is ignored; encrypted accounts fall back to `encryption_enabled` as today.

## Open Questions

Answered by the security review (D11): caps stay 5,000 an hour and 20,000 a day and cannot be raised in this version; write confirmation is off by default and recommended for unattended devices; no reads-only mode and no `ot` relay target in this version.
