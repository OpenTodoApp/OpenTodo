## Context

`relay.Hub.Do` seals a request `{op, items, call: {tool, token, write}, deadline}` to the device's stream key. `web/src/lib/relay.ts` `answer()` checks the op, the caps and the fields, asks the user only for an encryption request when **Confirm changes first** is on (`RelayConfirm.tsx`), and keeps the last 20 calls (tool, op, count, outcome) in IndexedDB. A decryption request is never shown beyond the footer key "Answering an AI connector".

## Decisions

### D1 — The call is described by the server, and the docs say so

The tool, the token name and the arguments come from the server, which a malicious operator controls. No field the server adds can prove an assistant asked (MCP clients do not sign calls). The value is that the user sees, per request, what it claims to serve: a request for 300 titles "for `get_task {"id":"t1"}`", or one during a quiet hour, is visible as wrong, and **Confirm reads first** lets the user refuse it before any text leaves the device. Settings and docs state this limit in one sentence; nothing claims verification.

### D2 — Arguments: compact JSON, 300 bytes

`Registry.Call` stores `textutil.Truncate(compact(rawArgs), 300)` on the caller (a private field, so transports cannot set it) and `relayCall` copies it into every relay request of that call, reads and writes alike (also the decrypts inside `update_project` and `note_to_task`). 300 bytes names ids, a query or the first titles; a long `create_tasks` is cut on a character boundary. The arguments may contain the user's own text (a search query, a new title); they travel sealed to the user's device, are shown only while the request is pending and are never stored on the device or the server.

### D3 — Showing without interrupting

A routine request is shown, not asked about: the footer key's label and tooltip name the connector and tool while it answers (`snapshot.answering`), and the recent list names the connector. That is the "show decryption requests" part and needs no new row. Only the opt-in option opens a sheet, because it asks for a decision.

### D4 — Confirm reads first: decrypt, show, then send

With the option on, the device decrypts the requested values first (it would have to anyway), shows at most 20 of them with their field and the count of the rest, and returns them only on Allow. Decline returns `declined_on_device` and drops them. The caps are counted before the sheet, as for writes, so a flood of declined requests still meets the device limit. The deadline stays the server's (20 seconds for reads): like the change sheet, the sheet closes itself half a second before it and answers declined, so the assistant learns the user did not allow it rather than waiting for a timeout.

### D5 — Off by default

**Confirm reads first** is off by default, like **Confirm changes first**: turning it on for devices already opted in would make every assistant read wait for a tap, which breaks the connectors people set up and gives a stream of prompts that teaches clicking Allow. A person who wants it turns it on. (Recorded as an owner question; the conservative default keeps today's behaviour.)

### D6 — Refusing a request with no tool

A request without `call.tool` is refused on the device. The server always names the tool, so this only refuses a malformed or hand-made request; it costs nothing and keeps the sheet and the list from showing an empty call.

## Data model

None on the server: the request gains one field inside the sealed box. The device keeps one more boolean (`relay.confirmReads`) and the token name in its recent list, in IndexedDB meta. No ops; offline behaviour and convergence are unaffected (a declined request writes nothing; an allowed write is the same ops as before). No dependency; no measurable effect on image size, memory or the first load (the sheet is the existing one).

## Interface budget

Settings → Integrations → AI assistants gains one switch row under **Confirm changes first**, shown only while the device is opted in. No new chrome on any list, no new sidebar destination, no new shortcut, no new scroll region (the sheet's list reuses the existing one).

## Risks

- A person with **Confirm reads first** on sees one sheet per read; the 20-second deadline may pass while they read it, and the assistant gets `device_timeout`. The docs say so.
- Arguments can be long or unreadable JSON; they are shown in a monospace line, cut to 300 bytes.
