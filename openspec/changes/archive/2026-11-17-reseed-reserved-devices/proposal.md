## Why

On 16 Nov the owner's browser showed "Sync error: op device: server and ids starting with agent:, caldav: or public: are reserved" against a fresh v1.5.0 container, and stopped syncing. A task created through REST (the n8n node) never showed.

After a server restore (a new log `generation`), the client re-seeds: it re-sends every field it holds with the clock it was last written with, `(ts, device)`. A field last written through REST carries the device `server`. One written by an AI assistant carries `agent:<token>`, and the same goes for CalDAV, rules, issue and calendar connections, public links and task pages. `/api/v1/sync` refuses those devices from clients (mcp-write-tools D4), and it refuses the whole request with 400, before anything is applied or pulled. The client then sends the same batch on every exchange, so it neither uploads nor pulls again. Any account that used REST, n8n, MCP, CalDAV or rules is stuck this way after a restore, or after a database swap on an address the browser already knew.

Reproduced end to end: the real server, a task created through REST and synced into Chromium, then the generation changed as a restore would. On main every later exchange answered 400 and a task written afterwards never arrived. With this change the exchange completes and it arrives in half a second.

## What Changes

- **A reserved device goes out as this device.** When an op in the outbox carries a device the server takes only from itself, the client sends it with its own device id and the op's original timestamp. The value and the time are unchanged, so the restore converges as before.
- **A stuck outbox recovers.** The rewrite happens where ops leave the device, so an outbox an earlier build filled this way is sent on the next exchange.
- **One list of reserved devices.** The client's `reservedDevice` copies the server's `ReservedDevice`, and both are pinned by `internal/sync/testdata/reserved_devices.json`.

## Capabilities

### Modified Capabilities

- `offline-first-sync`: "Every entity kind is re-seeded and handled when refused" says how a field last written by the server's own writers is re-sent.

## Impact

- `web/src/lib/sync.ts`: `reservedDevice` and one line in the exchange. No platform change; the native shells load the same code.
- No server, op schema or data change. The server's refusal of reserved devices stays as it is.
- History: after a restore, a field that only this device still held (written through REST or by an assistant after the backup) shows as written by this device instead of "API" or "AI assistant". Fields the backup holds keep their original op, because `server` wins the tie against a device id.
- The separate rule that one refused op never blocks the whole batch is the other half of "Sync must never stop silently" and comes as its own change.
