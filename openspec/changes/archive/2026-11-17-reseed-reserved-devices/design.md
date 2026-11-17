## Decisions

### D1: Re-stamp the device, keep the time

The choices were:
- **Skip such fields.** That loses data: a task created through REST after the backup would exist only in this browser, and the server and every other device would never get it.
- **Let the server accept reserved devices in a re-seed.** It cannot tell a re-seed from a device impersonating an assistant or a calendar app, and that is the forgery D4 of mcp-write-tools exists to stop.
- **Send the op as this device's write at its original `ts`.** This is the honest record: this device is re-sending a value it holds.

Last-writer-wins compares `ts` first, so the outcome against everything the restored server or other devices hold is the same as before. Only a tie at the same `ts` compares devices. `server`, `rule:`, `public:`, `page:` and `issues:` sort after every hex device id, so the restored server's original op keeps winning a tie with the same value and keeps its attribution. Device-checked fields are unaffected: `uploaded_at` is already left out of a re-seed, and `CreatedBy` (an assistant may trash only what it created) only becomes stricter.

### D2: At the send, not in the re-seed

The rewrite is in the exchange, where the outbox batch becomes the request. That covers a new re-seed and an outbox already filled by an earlier build, which is the owner's state, without a migration. The local row keeps the clock it had, with the same value and the same `ts`. The server never echoes a device's own ops back, so nothing changes on screen.

### D3: One list, shared vectors

`reservedDevice` in `sync.ts` copies `ReservedDevice` in `internal/sync/devices.go`. `internal/sync/testdata/reserved_devices.json` lists reserved and allowed ids, and a Go test and a web test both read it, so a new reserved prefix that only one side learns fails a test.

## Risks

- **Two different values at the same millisecond.** If one device wrote a field at exactly the `ts` of a server write, the original tie went to the server. After the rewrite, the tie is between two device ids, so it could go the other way. This needs an identical hybrid-clock millisecond on the same field, then a restore, then that device still holding its losing value unsent. It is not reachable in practice, and the result is still the same value on every device.
