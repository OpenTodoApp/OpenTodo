# Relay requests the device can see and refuse

## Why

The threat model (`docs/security/threat-model.md`, "Malicious server operator, encrypted account") lists the device relay as not defended: while a device answers AI connectors, the server can ask it to decrypt any value, and the device shows encryption requests only (with **Confirm changes first**), never decryption requests, and cannot tell a request for an assistant from one the server made up. Hardening item 6.1 of `external-security-review`.

## What Changes

- Every relay request names the agent call it serves: the tool, the connector's token name and the call's arguments (compact JSON, at most 300 bytes), sealed with the request like its values.
- While the device answers, the key in the sidebar footer names the connector and the tool ("Answering Claude.ai: list_tasks"). The recent requests list names the connector for reads and writes alike. Nothing new interrupts the user by default.
- A new option, **Confirm reads first** (off by default), beside **Confirm changes first**: each decryption request shows on the device with the connector, the tool, its arguments and the values it would send, decrypted on the device for that view, with Allow and Decline. Decline answers `declined_on_device` and sends nothing.
- The change sheet of **Confirm changes first** also shows the call's arguments.
- A request that names no tool is refused by the device.
- The `declined_on_device` tool message no longer says "change": it now also covers a declined read.

The device still cannot prove what the server says about a call; the docs say so. What changes is that a request the user did not cause becomes visible, and with **Confirm reads first** refusable, before any text leaves the device.

No new route, server setting or environment variable; the options are per device, stored on the device like **Confirm changes first**. Not **BREAKING**: a device that does not know the new field ignores it, and the server needs nothing from the device it did not need before.

Out of scope: proving a request's origin (that needs the assistant to sign its calls, which MCP clients cannot), per-connector rules ("always allow Claude.ai"), and a longer read deadline for confirmed reads (20 seconds stays).

ROADMAP: hardening of the shipped `mcp-device-relay`; advances `external-security-review` (6.1). No new item.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-server`: new "Relay requests name their call" and "Confirming reads on the device"; "Relay errors", "Relay limits" and "Confirming writes on the device" updated.

## Impact

- Server: `relay.Call.Args`; `agenttools.Registry.Call` keeps the call's arguments on the caller for its relay requests (`relayCall`); the `declined_on_device` message.
- Web: `web/src/lib/relay.ts` (refuses a request without a tool, the `answering` call in the snapshot, the confirm-reads option, decrypt-then-confirm), `web/src/app/RelayConfirm.tsx` (one sheet for reads and writes), `web/src/app/RelaySettings.tsx` (the option, the connector in the list, the footer label), `settingsCopy.ts`, the six catalogues.
- Tests: `internal/agenttools/relay_test.go`, `internal/relay/hub_test.go`, `web/src/lib/relay.test.ts`, `web/src/app/relay.test.tsx`.
- Docs: `docs/mcp.md`, `docs/e2ee.md`, `docs/security/threat-model.md`; CHANGELOG `### Security`.
