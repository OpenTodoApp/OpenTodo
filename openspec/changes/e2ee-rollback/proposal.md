# Proposal

## Why

For an end-to-end encrypted account, a malicious or compromised server can serve an older ciphertext of a field again (rollback), and devices cannot tell. A ciphertext's additional data binds it to its entity, id and field, but not to a version or a time. So the server can take last month's title from its op log or a backup, attach it to a new operation with a fresh timestamp, and every device decrypts it and lets it win last-writer-wins. The threat model lists this as **Rollback** under "Not defended" ([threat model](../../../docs/security/threat-model.md#malicious-server-for-an-encrypted-account), [limits](../../../docs/security/limits.md#the-server-operator-with-end-to-end-encryption)).

Hardening item 6.13c of `external-security-review`, deferred after 1.0 by the owner on 2026-11-06 ([#969](https://github.com/OpenTodoApp/OpenTodo/issues/969)). The owner approved starting the design on 2026-11-25.

## What Changes

- **A second envelope version, `enc:v2:`, that carries the operation's timestamp.** The timestamp sits in a clear 8-byte header and in the additional data, so it is authenticated with the value. `enc:v1:` stays readable.
- **One invariant, checked by both sides: a `v2` value travels only in an operation whose timestamp equals its stamp.** An old ciphertext can then only come back with its original timestamp, and last-writer-wins on the device ranks it below the newer value the device already holds. The device's existing per-field clock is the high-water mark: no new counter, and no change to convergence.
- **Writers stamp with the operation's timestamp.** The web app, the Obsidian plugin and `ot vault` seal at upload with the op's timestamp. Writers that go through the REST API or MCP (`ot mcp --decrypt`, `ot notes`, the device relay) choose a stamp, and the server uses it as the operation's timestamp; a stamp that would not win answers 409 `stale_ciphertext` with the current timestamp, and the writer seals again.
- **Detection keeps the device's value.** A `v2` value whose stamp differs from its operation's timestamp, or a `v1` value that would replace a value the device holds as `v2`, is not applied. The device keeps what it has, keeps syncing, and Settings → Encryption shows one line: "The server sent older versions of 3 items. This device kept its own." Nothing is re-written automatically.
- **Existing data moves to `v2` once.** After the writer release, the next unlocked device re-seals every content value the server still holds as `v1`, with the re-write job and its catch-up (as when encryption is turned on). Then `v1` is refused over any value the device holds.
- **The key record cannot go back either.** A device refuses a served key record older than the one it cached: an earlier version of the same record, or a record of an earlier enablement. No format change; this part can ship first.
- **Server-side restores of an earlier ciphertext stop.** An undo of a routine run cannot put back an older encrypted value as a new operation (devices would refuse it): those fields are reported as not undoable for encrypted accounts.
- **Docs** move Rollback to "Defended" with what remains: a device that never held the newer value (a new device, a field it never synced), a server that withholds the newest operations, and a server that shows different histories to different devices.

**BREAKING** for readers of the ciphertext format: apps, `ot` and Obsidian plugins older than the reader release cannot open `v2` values and show them as undecryptable. The rollout therefore has two releases (design D8): a reader release first, then, at least one release later, the writer release that bumps `minClientVersion` to 2 and refuses `v1` writes for encrypted accounts. The operation schema does not change: values stay strings, no field is added, renamed or removed. The owner approved the design and the rollout on 2026-11-25 (design, Owner decisions). The reader release is one pull request; the writer release is a second one.

**Out of scope**: freshness (a server that withholds newer operations, or deletes them); fork consistency across devices (signed checkpoints, a transparency log); a device that never held the newer value; plaintext values; mergeable note documents (`notes_doc` updates merge, so replaying an older one changes nothing); attachment files (each upload is a new attachment id); changing the account key or any key ceremony.

ROADMAP.md: none of its rows. This is hardening item 6.13c of `external-security-review` (the 1.0 "Trust" milestone), deferred after 1.0 as #969.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `end-to-end-encryption`: the `v2` envelope and its stamp; how devices detect and report a rollback; how every writer stamps; the server's timestamp rule for ciphertext; the re-seal of existing values; the key record high-water mark; the documented limits (replaces "Ciphertext rollback is a documented limit").

## Impact

- **Format:** `web/src/lib/crypto.ts`, `web/src/lib/e2eeEnvelope.ts` (also bundled by the Obsidian plugin), `internal/e2ee/crypt` (`ot`), `internal/e2ee` (parsing the stamp, plaintext limit in `fit.go`), `web/src/lib/docfields.ts`; shared vectors in `web/src/lib/e2ee.vectors.json` gain `v2` cases, including refusals.
- **Web:** `e2eeSync.ts` (seal with the op's timestamp, the check before apply, the re-seal), `e2ee.ts` (key record high-water mark, the rollback report), `relay.ts` (seal with the stamp the request names), Settings → Encryption (one line when something was refused).
- **Server:** `internal/sync` (a `v2` op's timestamp must equal its stamp; never clamp it), the REST, MCP and import write paths (timestamp from the stamp, 409 `stale_ciphertext`), `internal/rules` routine undo, `internal/httpapi` `MinClientVersion` (writer release).
- **CLI and plugin:** `ot` (`mcp --decrypt`, `notes`, `vault`), the Obsidian plugin.
- **Docs:** `docs/e2ee.md`, threat model, limits, `docs/api.md` (the new error), `docs/cli.md`.
- **Size:** no dependency; a few hundred bytes of client code. Ciphertext grows by 11 characters per value. The re-seal writes one operation per encrypted value once (about 1,500 operations for 500 tasks, as when encryption is turned on).
