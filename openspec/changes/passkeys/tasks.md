# Tasks

## 1. Server: WebAuthn verification package

- [x] 1.1 Add `github.com/fxamacker/cbor/v2` and `internal/webauthn` with clientData parsing, authenticator-data parsing, COSE key decoding (ES256, RS256, Ed25519) and signature verification; verify `TestVerifyRegistrationFromRecordedCeremony` and `TestVerifyAssertionFromRecordedCeremony` using fixtures captured from two browsers, with `go test ./...`
- [x] 1.2 Challenge store with 5-minute TTL, single consumption and user binding; verify `TestChallengeExpiresAndIsSingleUse`
- [x] 1.3 Record the binary size before and after the dependency in `design.md` and `CHANGELOG.md`; verify with `ls -l bin/opentodo` from `make build`

## 2. Server: storage, service and routes

- [x] 2.1 Migration `internal/store/migrations/000N_passkeys.sql`; verify `go test ./internal/store/...` reaches the new `user_version`
- [x] 2.2 `internal/auth`: `BeginPasskeyRegistration`, `FinishPasskeyRegistration`, `ListPasskeys`, `RenamePasskey`, `DeletePasskey`, `BeginPasskeyLogin`, `FinishPasskeyLogin` with counter check and suspicious flag; verify `TestPasskeyRegisterAndLogin`, `TestPasskeyCounterRegressionFlags`, `TestDeletedPasskeyCannotLogin`
- [x] 2.3 `internal/config`: `PasskeysAvailable()` and `RPID()` derived from `BaseURL`; verify `TestPasskeyAvailabilityByBaseURL` covering https, http LAN, localhost and unset
- [x] 2.4 Router: five authenticated routes under `/api/v1/passkeys`, two unauthenticated routes under `/api/v1/auth/passkey` behind the login limiter, `passkeysAvailable` in `auth/status`, `passkeys_unavailable` guard; verify `TestPasskeyRoutesAuth` (401 anonymous, 404 foreign id, 409 unavailable) and `TestPasskeyLoginRateLimit`
- [x] 2.5 Document routes, payload encodings and error codes in `docs/api.md`; update `SECURITY.md`; verify the examples match handler tests

## 3. Web app: client library

- [x] 3.1 `web/src/lib/passkeys.ts`: base64url helpers, support detection, conditional mediation detection, create/get wrappers with abort support; verify `npm test` passes `passkeys.test.ts` for encoding round-trips and feature detection with a mocked credential API
- [x] 3.2 `web/src/lib/api.ts`: functions for the seven routes and the new status field; verify typed responses compile in `npm run build`

## 4. Web app: UI

- [ ] 4.1 Sign-in screen: "Sign in with a passkey" button and conditional autofill on the email field when `passkeysAvailable`, cancel falls back to the password form silently; verify in the browser against an https dev origin that autofill sign-in works and that cancelling leaves no error
  - Apply note: implemented. Verified in Chromium (Playwright) with a CDP virtual authenticator against `OPENTODO_BASE_URL=http://localhost:18080`, a secure-context development origin but not an https one. Autofill (conditional mediation) sign-in worked without typing a password; the email field has `autocomplete="username webauthn"`; a device with no passkey fell back to the password form with no error. Left unchecked until it is repeated on a real https origin with a real authenticator.
- [x] 4.2 Settings `SecurityPanel`: list with name, created, last used, suspicious badge; add (name prompt → ceremony), rename, delete with confirm; hidden when unavailable; offline read-only; verify in the browser plus component tests for the hidden and offline states in `npm test`; `npm run build` passes
- [x] 4.3 Keyboard reachability of the panel and the sign-in button, `?` help updated; verify by adding, renaming and deleting a passkey without a mouse

## 5. Docs and release

- [x] 5.1 `docs/self-hosting/docker.md` and `coolify.md`: explain that passkeys need an https `OPENTODO_BASE_URL` and what happens when the domain changes; `README.md` feature list; CHANGELOG entry; verify links resolve and `make check` passes
- [ ] 5.2 End-to-end run on an https origin: register passkey on device A → sign out → passwordless sign-in → register on device B → delete A's passkey from B → A's passkey refused → password still works; verify the run completes without console errors
  - Apply note: the whole sequence passed on `http://localhost:18080` using two isolated browser contexts, each with its own virtual authenticator: register on A → sign out → passwordless sign-in (autofill and the button, by keyboard) → register on B → delete A's passkey from B → A refused with "That passkey is not registered on this server" → password works. There were no page errors; the one console line is Chromium's network log of the intended 401 refusal. Left unchecked because it did not run on an https origin with real devices.
