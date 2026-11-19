## Why

#1532 point 6. `ot vault` and the Obsidian plugin don't announce `invalid_ops`, so one op the server cannot accept (a value a rule refuses, or a field an older server doesn't know) refuses the whole request with `400 invalid_op`:
- for the vault, every later sync then fails too, as long as the file still holds the value;
- for the plugin, the outbox is held on that entry, and nothing after it is sent.

The web app has refused such an op alone since #1475 and #1533.

## What Changes

- **`ot vault` announces `invalid_ops`.** An op the server cannot accept is refused alone and reported like any other refusal, as a warning that names the field, the entity and the reason. The rest of the sync applies, and the file shows the server's value again. The vault keeps no outbox, so a change refused as `unknown_field` (a field this server is too old for) is typed again once the server is upgraded.
- **The Obsidian plugin announces `invalid_ops`** on the push-only exchange and on its vault sync. A refused entry is dropped from the outbox and reported with the reason and the note, as its spec already requires for every refusal (`obsidian-plugin`, "Refused"). The other entries are sent.

## Capabilities

### Modified Capabilities

- `markdown-vault`: a new requirement, "Refused changes".

## Impact

- `internal/vault/exchange.go` (the feature list), `obsidian/src/api.ts`, `obsidian/src/vault/engine.ts`, with tests.
- No server change: the server has handled `invalid_ops` since #1475.
