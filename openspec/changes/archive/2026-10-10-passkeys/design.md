# Design

## Context

Sessions, cookies, the Origin check and rate limiting exist and are independent of how identity was proven (see the bootstrap design, D6). Passkeys add a second way to prove identity and reuse the session layer unchanged. The browser side is the built-in credential API; the server side must verify a registration (attestation object with format `none`) and later assertions. The constraints that shape the design are the binary size budget, the "no mandatory configuration" rule and the fact that browsers only allow passkeys on secure origins.

## Goals / Non-Goals

**Goals:**
- Phishing-resistant, passwordless sign-in from any device the user owns, several passkeys per account.
- No lock-out risk: password stays; passkeys are additive.
- Keep the server dependency footprint tiny; verify only what matters (origin, RP id, challenge, signature, counter).

**Non-Goals:**
- Attestation verification, authenticator metadata, allow-lists, enterprise policy.
- Passkey-only accounts or account recovery flows.
- Using passkeys as a second factor for password sign-in (left to `mfa-totp`, which can treat a passkey assertion as a satisfied factor later).

## Decisions

### D1. Relying-party id and origin come from `OPENTODO_BASE_URL`
`rpID = BaseURL.Hostname()`, expected origin = `BaseURL.Scheme + "://" + BaseURL.Host`. Passkeys are available when the scheme is https, or when the host is `localhost`/`127.0.0.1` for development. When `BaseURL` is nil the feature is off and `auth/status` reports `passkeysAvailable: false`. This needs no new variable and matches what the cookie `Secure` flag already keys on.
- Alternative: derive the RP id from the request `Host`. Rejected: a proxy misconfiguration would silently register credentials for the wrong RP, and an attacker-controlled Host header could poison ceremonies.

### D2. Server-side verification with one small dependency
A new package `internal/webauthn` implements: challenge issue/consume, parsing of `clientDataJSON` (type, challenge, origin), parsing of authenticator data (RP id hash, flags, counter, attested credential data), COSE key decoding for ES256 (P-256), RS256 and Ed25519, and signature verification over `authData || sha256(clientDataJSON)` using `crypto/ecdsa`, `crypto/rsa`, `crypto/ed25519`. Attestation format is requested as `none` and the statement is ignored; only `authData` inside the attestation object is used.
- CBOR: adopt `github.com/fxamacker/cbor/v2` (pure Go, no transitive dependencies, widely audited). Measured impact on comparable binaries: about +0.4 MB. Memory: negligible.
- Alternative `github.com/go-webauthn/webauthn`: complete, but drags in TPM, x509 chain and metadata packages for attestation we do not use (roughly +3 MB and a dozen modules). Rejected for footprint.
- Alternative: hand-written CBOR subset decoder. Smaller, but parser bugs on attacker-controlled input are exactly where security holes live; a maintained decoder is the safer trade.

### D3. Challenges live in memory
A `challenges` map keyed by the challenge bytes with `{userID (or "" for sign-in), expiresAt}` and a 5-minute TTL, swept on each issue. The server is a single process, so memory suffices; a restart only aborts in-flight ceremonies, which the client reports as "try again". Consuming a challenge deletes it, which makes replay impossible.
- Alternative: a `webauthn_challenges` table. Unnecessary writes to the SQLite file for a transient value.

### D4. Data model
Additive migration `000N_passkeys.sql`: `passkeys(id, user_id, name, credential_id BLOB UNIQUE, public_key BLOB, alg INTEGER, sign_count INTEGER, transports TEXT, backup_eligible INTEGER, backed_up INTEGER, created_at, last_used_at NULL, suspicious_at NULL)`. The WebAuthn user handle is the user's existing id, so no new column on `users`. No op-schema change, nothing is synced, no convergence concern.

### D5. Routes
Authenticated, behind `requireAuth` and the cookie Origin check: `POST /api/v1/passkeys/register/options`, `POST /api/v1/passkeys/register`, `GET /api/v1/passkeys`, `PATCH /api/v1/passkeys/{id}`, `DELETE /api/v1/passkeys/{id}`. Unauthenticated, under the existing per-IP login limiter: `POST /api/v1/auth/passkey/options`, `POST /api/v1/auth/passkey`. Bearer tokens can manage passkeys like any account route; the CLI cannot perform a ceremony, which is fine. Binary fields travel as base64url strings in JSON.

### D6. Sign-in uses discoverable credentials only
Registration requests `residentKey: required` and `userVerification: preferred`; sign-in sends no `allowCredentials`, so the authenticator picks the credential and the server maps `credentialId → user`. This enables the autofill (`mediation: "conditional"`) flow on the email field. A user-verification flag that is false is accepted (the device policy decides), but recorded.

### D7. Counter handling
If stored counter > 0 and incoming counter <= stored, refuse with `invalid_credentials`, set `suspicious_at`, keep the credential (the user decides to delete it after seeing the warning). Counters of zero are common with synced passkeys and are skipped.

### D8. Client
`web/src/lib/passkeys.ts` wraps `navigator.credentials.create/get` with base64url conversion and `PublicKeyCredential.isConditionalMediationAvailable()` detection. The sign-in screen starts a conditional request on mount when `passkeysAvailable` is true and aborts it when the user submits the password form. Settings gets `SecurityPanel` (list, add, rename, delete, suspicious badge). No new npm dependency; roughly +4 KB gzipped.

### D9. Dependencies and footprint summary
Go: `fxamacker/cbor/v2` (+~0.4 MB binary, no runtime memory change). Web: none. Container image stays well under 50 MB.

Measured during apply (`make server`, linux/amd64, `-s -w -trimpath`, same embedded web dist): 11,444,386 bytes before, 11,751,586 bytes after the passkeys change (cbor v2.9.4 plus `internal/webauthn` and the handlers): **+307,200 bytes (+0.29 MiB, +2.7 %)**. cbor brings one transitive module, `github.com/x448/float16` (pure Go, ~300 lines), which the estimate above did not mention. Web bundle (`npm run build`, main chunk, against the branch point): 367.37 kB → 377.03 kB raw, 114.47 kB → 117.14 kB gzipped (**+2.7 kB gzipped**), with no new npm dependency.

## Risks / Trade-offs

- [Verification bug in a hand-written path] → use the maintained CBOR decoder and stdlib crypto only; table-driven tests with recorded real ceremonies from two browsers; `userVerification`, origin, RP-id hash and challenge are all checked.
- [User registers passkeys, forgets password, loses device] → password remains and is recoverable by the owner resetting it (a future change); the Security panel nudges users to register a second passkey.
- [Server moved to a new domain] → RP id changes and existing passkeys stop matching; documented in self-hosting docs, password fallback keeps access.
- [Proxy terminates TLS but base URL left as http] → passkeys stay off and the status explains why; docs call this out next to the cookie `Secure` note.
- [In-memory challenges lost on restart] → client shows a retry message; ceremonies last seconds.

## Migration Plan

Additive migration; old binaries ignore the table. No client data migration. Feature is dormant until `OPENTODO_BASE_URL` is https.

## Open Questions

- Whether to let the owner require a passkey for members (policy) once `audit-log` and `mfa-totp` exist.
- Whether to show which passkeys are synced (backed up) versus device-bound in the list; the flags are stored already.
