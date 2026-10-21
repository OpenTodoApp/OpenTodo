# Security review: mcp-device-relay

Task 0.1. Scope: design D1 (the device as the account's crypto agent), D6 (limits), D8 (what the server keeps) and the trust-model wording, against the code on `main` after `mcp-projects` (merged, `ot mcp --decrypt`, `internal/e2ee/crypt`). Reviewed 2026-10-21.

## What the relay changes

Without the relay, an end-to-end encrypted account's server holds ciphertext only and cannot read or forge content: AES-GCM with the account key, bound to entity, id and field (`internal/e2ee/crypt` `aad`). With the relay on, an opted-in, unlocked device answers two questions for the server: "what does this ciphertext say" (decrypt) and "what is this text as ciphertext" (encrypt). For as long as it answers, the device is an oracle for whoever controls the server. That cannot be engineered away for a cloud client: the client sends arguments to the server and reads results from it, so the server sees what the device returns. The relay is therefore a deliberate, opt-in weakening, and the question is whether it is bounded, visible and stoppable.

## Threats

| # | Threat | Without mitigation | Mitigation | Where |
|---|---|---|---|---|
| T1 | **Malicious or compromised server** asks the device to decrypt values no assistant asked for | The whole account can be read while a device is opted in and online | Device-side caps the server cannot change (5,000 values an hour, 20,000 a day, persisted on the device so a reload does not reset them); the device shows that it is answering and lists recent calls (tool name, time, count, never values); opt-in per device, off by default, ended by lock and sign-out; plain-words trust note in Settings and docs/e2ee.md | D3, D6, R4 |
| T2 | **Same server** asks the device to encrypt text it chose (integrity) | The server can write content that every device shows as the user's own; without the relay it cannot forge a valid envelope | Encrypted values count against the same device caps; the optional "Ask me before AI connectors change anything" shows every relayed write before encrypting; the device encrypts only content fields of known entities (R3); every relayed write is an `agent.write` audit event and carries the assistant's device id in history | D6, D7, R3, R5 |
| T3 | **Stolen session cookie** opens a relay stream as the device | Receives encrypt requests (assistant plaintext) and can answer decrypt requests with invented text, or encrypt requests with garbage that corrupts data | The opt-in row is bound to the session that turned it on (`session_hash`); the stream and answers require that session; sign-out or session expiry ends it. Each stream negotiates its own key (R1): answers must be sealed with it, so a second session cannot answer even with the request id | D3, R1, R2 |
| T4 | **Stolen `agent` token** | Reads plaintext through the device like the legitimate assistant | Unchanged gate: owner `mcp.writes`/MCP switch, the user's "Allow AI assistants" switch, token scope, per-token limits; device caps bound the volume; revoking the token stops it | existing gate, D6 |
| T5 | **Prompt injection in the cloud model** (malicious task text tells it to read everything) | The model pages through the account | Same as T4: per-token and device caps; decrypted text stays inside the untrusted-text wrapper as for unencrypted accounts; reads are bounded by the MCP page limits | D6, existing |
| T6 | **Device spoofing / answer injection** by another account or device | A different device answers someone else's request | Request ids are 128-bit random, one-shot, bound to the account, the device and the stream; answers are AEAD-sealed with the stream key and the request id as associated data; a wrong device, second answer or bad seal is 404 and the call is unaffected | D2, R1 |
| T7 | **Replay** of a captured answer or request | An old answer reused for a new call | Answers are bound to a one-shot request id (AAD) and a per-stream key that dies with the stream; deadlines of at most 20/30 s; the opt-in route needs a recent confirmation and is idempotent | D5, R1 |
| T8 | **Flooding**: many calls, huge batches, many streams | Memory and CPU exhaustion; device battery drain | Server: 60 relayed requests a minute and 4 queued per account, 2,000 values and 2 MB per request, ten relay streams per account and the existing per-IP and server-wide stream caps, answer bodies capped at 4 MB; device: caps and one in-flight request | D4, D6 |
| T9 | **Exfiltration through tool results** | Results carry more content than the call needed | The server only asks for values that the tool's result actually renders (marker pass, see R6), not the whole snapshot; a compromised server ignores this, which is T1 | R6, T1 |
| T10 | **Logging leaks** (access logs, panic dumps, reverse proxies) | Plaintext in server or proxy logs | No relay handler logs a body; MCP debug logging stays "method and duration"; the audit catalogue gets `relay.enabled`/`relay.disabled` only; relay payloads are sealed per stream (R1), so a TLS-terminating reverse proxy that logs bodies sees ciphertext on the relay leg; a test relays a known title and searches the database file, the op log, captured logs and the audit export for it | D8, R1, task 2.5 |
| T11 | **Key material** leaves the device | Total compromise | The account key stays non-exportable in the browser; the stream key is an ephemeral ECDH P-256 key generated per stream, never stored; the server holds only its half and the derived per-stream key in memory | R1 |

## Required changes (adopted into the design)

- **R1. Seal relay payloads per stream.** The device opens the stream with an ephemeral ECDH P-256 public key; the server answers with its own in the first event; both derive an AES-256-GCM key with HKDF-SHA-256 (info `opentodo relay v1`, salt = stream id). Requests and answers carry their values sealed with that key, the request id as associated data. Protects the relay leg from TLS-terminating proxies and binds answers to the stream. Standard library and WebCrypto only.
- **R2. Bind the opt-in to the session.** `relay_devices` stores a hash of the session that opted in; only that session may open the device's stream or answer; the row is removed when that session signs out and ignored once the session is gone.
- **R3. The device checks what it is asked.** It decrypts and encrypts only content fields of known entities (`CONTENT_FIELDS`), at most 2,000 values per request, and refuses anything else per value.
- **R4. Device caps persist on the device** (IndexedDB meta), per account; the server cannot reset or raise them.
- **R5. Encryptions count against the device caps** like decryptions.
- **R6. Decrypt only what is rendered.** The server marks ciphertext values while loading, runs the tool, and sends to the device only the values whose markers appear in the result.

## Accepted residual risk

While a device is opted in and online, a compromised server can read up to the device's caps (20,000 values a day) and can write content the devices accept as the user's, unless "Ask me before AI connectors change anything" is on. This is inherent to answering a cloud client and is the trade the user opts into per device. Settings and docs/e2ee.md say it in plain words: "While this is on, text an assistant asks for passes through the server to reach the assistant. This device decrypts at most 5,000 values an hour and 20,000 a day."

## Answers to the design's open questions

1. Device caps: 5,000 an hour and 20,000 a day, not raisable in this version (a user can stop the relay at any time).
2. Write confirmation: off by default, as designed; it is the recommended setting for anyone who leaves a device on unattended, and the docs say so.
3. Reads-only per device: not in this version; the confirmation option covers writes.
4. `ot` as a relay target: later.

## Verdict

Safe to build as an opt-in feature with R1–R6. The design does not claim more than it delivers: the server never holds the key and cannot read without a live, opted-in device, and what it can do while one is online is bounded and visible.
