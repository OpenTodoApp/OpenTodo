## Why

> **Planned for later.** This change is written now to record the direction; it is built after `mcp-projects` (which adds the local `ot mcp` with the key in the system keychain) and only after its security review below is done.

A user with end-to-end encryption who connects a cloud assistant (a claude.ai connector or another remote MCP client) to `/mcp` gets placeholders instead of titles and `encryption_enabled` for every write that carries text. The server holds no key, which is the point of the encryption. Giving the passphrase to the server, or unlocking the server for an hour, would remove that guarantee and was rejected. The local `ot mcp` from `mcp-projects` solves it for desktop assistants that run a process on the user's machine, but a cloud client has no process there: it can only talk to the server.

The relay lets that cloud client work on encrypted data without the server ever holding the key: for each tool call the server asks one of the user's own unlocked devices, which they opted in, to decrypt the content fields the answer needs, or to encrypt the text the assistant wants to write. The key never leaves the device and the server never stores plaintext.

The guarantee this gives is narrower than "the server never sees plaintext", and the change says so: a remote client sends its arguments to the server and reads the result from it over TLS, so the text of a relayed call passes through the server's memory. What the relay keeps is that the server never holds the key, can decrypt nothing on its own, never stores or logs relayed text, and can obtain plaintext only for calls answered while an opted-in device is online, within that device's limits.

## What Changes

- **Opt in per device.** On an unlocked device the user turns on "Answer AI connectors from this device" (Settings → Assistants). It is server state, not an op; locking the device, signing out, turning off encryption or the owner switching MCP off stops it.
- **A relay channel per device.** An opted-in device keeps an authenticated event stream open for relay requests, separate from the sync wake-up stream, which stays content-free. The device answers each request on its own route.
- **The device as the account's crypto agent.** The server still runs every tool: permission gate, validation, planning, limits, audit and `ApplyStrict` are unchanged. Only two steps move to the device: decrypting the ciphertext values a result contains, and encrypting the content arguments of a write. Ops carry ciphertext produced by the device, so every other device decrypts them as usual and convergence is unchanged.
- **Encrypted accounts get the full tool list** when at least one device is opted in. A call made while none is online, unlocked and answering returns the new tool error `device_unavailable` naming what to do; a slow device returns `device_timeout`; a write the user declines on the device returns `declined_on_device`.
- **Limits on both sides.** Server: a per-account rate and size limit on relayed requests. Device: its own per-minute and per-day caps on decrypted values, enforced locally so a misbehaving server cannot exceed them, an activity indicator while relaying and a log of recent relayed calls.
- **Optional confirmation of writes on the device**, showing the change set the way the in-app assistant does (default off: a cloud agent usually runs while nobody watches the device; see design for the open decision).
- **Audit events** for turning the relay on and off on a device, with no content.

Out of scope:
- Unlocking the server, or storing the key or a derived key on the server, in any form or for any time.
- Relaying for the agent REST routes or the in-app assistant (the in-app assistant already runs where the key is).
- Shared projects (encrypted accounts cannot share projects today).
- A native mobile background service; on phones the relay works while the app is in the foreground.

ROADMAP: advances the AI agents line (MCP for every account, including encrypted ones). It is not in ROADMAP.md yet; `mcp-projects` and this change should be added under the AI agents section.

No **BREAKING** change: no new mandatory environment variable, no change to the op log format. Accounts without encryption are unaffected.

## Capabilities

### New Capabilities

### Modified Capabilities
- `mcp-server`: encrypted accounts get content tools through an opted-in device; new requirements for the relay opt-in, the relay channel, the device as crypto agent, relay errors, relay limits and write confirmation on the device.
- `end-to-end-encryption`: server-side reads and integrations gain the one exception of a relayed call answered by an opted-in device, with what the server may and may not keep.
- `audit-log`: device relay events.

## Impact

- **Server:** `internal/httpapi` (relay stream and answer routes, registered through the policy wrapper as `signedIn().sessionOnly()` for opt-in and as device-bound for the stream; demo-denied), `internal/httpapi/mcp.go` (waiting on a relayed answer within the request's deadline), `internal/agenttools` (the encryption refusal becomes "relay or refuse"; a crypto hook around result rendering and content-argument patching), `internal/audit` (two events), a small in-memory relay hub (no database table for requests; one table or side table for opted-in devices).
- **Web app:** a relay worker in the syncing tab (the "one tab syncs" lock already picks one tab), the Settings switch, the activity indicator, the optional confirmation sheet, local caps.
- **CLI:** later, `ot` can answer relays when run with the key from `mcp-projects`; not required for the first version.
- **No new dependency**, no new environment variable, no outbound request from the server. Image size unchanged; memory bounded by the in-flight request cap.
