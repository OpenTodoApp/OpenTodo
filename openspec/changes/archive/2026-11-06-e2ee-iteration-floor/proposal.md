# Key records need the iterations the app writes

## Why

The threat model (`docs/security/threat-model.md`, follow-up 5.5 of `external-security-review`) found that devices accepted a key record with 100,000 PBKDF2 iterations or more, while the app writes 600,000 and the server stores only 600,000 to 10,000,000. A record the server changes no longer unwraps the account key, so the gap gave a server nothing to unwrap, but the device's check was weaker than every other part of the system and the three ranges disagreed.

## What Changes

- Devices accept a key record only with 600,000 to 10,000,000 iterations: the count the app writes is the floor, the same range the server stores (`ACCEPTED_ITERATIONS` in `web/src/lib/crypto.ts`).
- The `ot` CLI (`internal/e2ee/crypt`) applies the same range to the record it reads, and a test keeps it equal to the server's.
- Docs: the threat model's mechanism and gap lines, the open gap in "How we verify security", and the encryption page.

No key record changes and no upgrade step is needed: every record a server holds passed the server's 600,000 floor, which has existed since the key record was introduced (design D1). Not **BREAKING**; no new route, field or environment variable.

Out of scope: a memory-hard derivation, raising 600,000, and any change to how records are written.

ROADMAP: hardening of a shipped feature (`end-to-end-encryption`); advances `external-security-review` task 5.5.

## Capabilities

### Modified Capabilities

- `end-to-end-encryption`: "Bounded key derivation parameters" raises the floor to 600,000.

## Impact

- `web/src/lib/crypto.ts`, `internal/e2ee/crypt/crypt.go`.
- Tests: `web/src/lib/crypto.test.ts`, `web/src/lib/e2ee.test.ts`, `internal/e2ee/crypt/crypt_test.go`, `obsidian/test/send.test.ts` (restores the shared limit).
- Docs: `docs/security/threat-model.md`, `docs/security/how-we-verify.md`, `docs/e2ee.md`; CHANGELOG `### Security`.
- Bundle: a few bytes.
