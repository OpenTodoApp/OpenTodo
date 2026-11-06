---
title: How we verify security
summary: A retrospective of how OpenTodo's security is built and checked, with the tests and tools behind each claim, past issues and known gaps.
audience: developer
section: Internals
specs: []
screens: []
order: 41
---
# How we verify security

People asked for a deep retrospective of how OpenTodo's security, encryption and architecture have been verified, and for outside review. This page is that retrospective.

For each area it covers:

- the design;
- the automated checks that would fail if the design broke;
- what the checks do not cover.

It ends with the issues found so far and the gaps still open. [Threat model](threat-model.md) lists what is defended against whom. [SECURITY.md](../../SECURITY.md) has the disclosure policy.

In short:

- **The design limits what can go wrong.** All data writes go through one op log, every route declares its access policy, every outbound request to a typed address goes through one policy, and content encryption happens only on devices.
- **Tests pin each rule.** Many of them are table or matrix tests over every route, field or content kind, so a new route or field cannot skip the rule unnoticed.
- **Most findings so far came from internal audits** of our own code (the 2026-10 audit waves) and were fixed with a regression test.
- **No independent review has taken place yet.** One is sought; see [Independent review](#independent-review).

## Architecture and the op-log sync

**Design.**
- Every change to tasks, projects and the other synced entities is an operation on one field, stamped with a hybrid logical clock, and the last writer wins per field ([docs/sync.md](../sync.md)).
- The server's tables are materialized from the op log. Devices hold the same log in IndexedDB.
- REST, CalDAV, MCP, rules, imports and email all write through the sync service (`ApplyStrict`), never through table writes. That makes one place where scope, role and validation are checked.
- The op schema is declared once in `internal/sync/ops.go` and generated into TypeScript, the encryption field list and a shared fixture.

**Convergence tests.**
- **Randomized, in Go.** `TestConvergenceProperty`, `TestConvergenceSharesAfterUpload` and `TestConvergenceRefusedEditsAcrossRequests` (`internal/sync/convergence_property_test.go`) run devices with skewed clocks:
  - they edit in random order;
  - they exchange in random page sizes;
  - one of them shares a project part way through.
  
  Every replica must end equal to the server, and the server's tables must equal an LWW replay of its own log. A failing seed is printed and can be replayed with `OPENTODO_PROPERTY_SEED`.
- **Fixed order, in Go.** `TestOrderIndependence` and `TestApplyIsIdempotentAndConverges` (`internal/sync/service_test.go`).
- **Clock skew, in Go.** `TestClockSkewRefusedWithServerTime`, `TestFastClockDeviceConverges` and `TestServerTSStrictlyIncreasing` (`internal/sync/convergence_test.go`).
- **The client.** `web/src/lib/ops.test.ts` ("converges to the same state regardless of delivery order", "stamps a local edit after a received op even when this device's clock runs behind") and `web/src/lib/hlc.test.ts`.
- **Against the built server.** `web/src/lib/sync.contract.test.ts` runs two devices against a real server binary: offline edits on two devices, a far-ahead clock, a viewer's refused edit.
- **Schema.** `TestGeneratedOpSchema` fails while the generated files are stale, and refuses a removed or renamed field.

**Limits of this evidence.**
- The Go property test models the TypeScript client with a hand-written Go copy of its clock rules. A change to `hlc.ts` could drift from the model unnoticed.
- The TypeScript side has no randomized test.
- The property test's seeds come from the clock, so a CI failure must be replayed from the logged seed.

## End-to-end encryption

**Format.**
- A value is `enc:v1:` + base64url(12-byte nonce ‖ AES-256-GCM ciphertext ‖ tag).
- The additional data is `entity\0id\0field`, so a value cannot be moved to another field or item.
- Attachments use a chunked format (`OTAT1`, 1 MiB chunks, a last-chunk flag in the nonce).

**Keys.**
- The account key is a random 256-bit key, kept on devices as a non-extractable `CryptoKey`.
- It is wrapped with AES-KW twice:
  - under a key derived from the passphrase (PBKDF2-SHA-256, 600,000 iterations, 16-byte salt);
  - under a random 256-bit recovery key (HKDF-SHA-256).
- The server stores the wrapped key record only (`internal/e2ee/keys.go`) and checks that its parameters are in range.
- There is no server-side reset.

**What is encrypted.**
- Every field declared `Content: true` in the op schema: titles, descriptions, notes, comments, names of projects, labels, sections, saved views, places, routines, frames and objectives, and more.
- Prefix families: task custom-field text, and appended note lines.
- The list is generated, not hand-kept: `web/src/generated/opSchema.ts` `CONTENT_FIELDS` and `internal/e2ee/contentfields.go`.
- Dates, priorities, structure and timing stay plaintext so the server can sync, schedule and authorize. The list is in [docs/e2ee.md](../e2ee.md).

**Turning encryption on rewrites existing content**, kind by kind (`web/src/lib/e2eeSync.ts`). `web/src/lib/e2eeCoverage.test.ts` fails when a content kind exists in the schema but not in the job. That test came with the fix for the gap below ([Known gaps and past issues](#known-gaps-and-past-issues)).

**The device relay** (`internal/relay`, `web/src/lib/relay.ts`) lets an opted-in device decrypt and encrypt content for an AI assistant on an encrypted account.
- Each device opts in with a recently confirmed session, and the opt-in is bound to that session.
- Requests are sealed per stream (ECDH P-256, HKDF, AES-GCM). This hides values from a TLS-terminating proxy, not from the server.
- The device refuses fields that are not content and keeps its own hourly and daily caps.
- `TestRelayEndToEndNoPlaintextLeft` checks that no relayed value is left in the database, the audit export or the logs.

While the relay is on, the server is trusted with content within those caps; see [Threat model](threat-model.md#malicious-server-for-an-encrypted-account).

**Shared vectors with the CLI.** `web/src/lib/e2ee.vectors.json` holds known-answer vectors for content values and for passphrase and recovery wraps. Three implementations read the same file:
- `TestVectors` (`internal/e2ee/vectors_test.go`);
- `TestContentVectors` and `TestPassphraseAndRecoveryVectors` (`internal/e2ee/crypt`, the `ot` CLI's implementation, for `ot encryption` and `ot mcp --decrypt`);
- the "known-answer vectors" suite in `web/src/lib/crypto.test.ts`.

`TestServerDoesNotLinkCrypt` keeps the CLI's crypto out of the server binary. The relay has its own vectors (`web/src/lib/relay.vectors.json`, `TestStreamCryptoVectors`).

**Server-side behaviour on encrypted accounts.**
- Server features that show content use `e2ee.Display`/`IsCiphertext` and degrade explicitly.
- They are tested: `TestNotificationsNeverShowCiphertext`, `TestCaldavRefusedForEncryptedAccount`, `TestDigestEncryptedAccountRefused` and the assistant's refusal in `TestTurnRouteGuards`.
- A server that "forgets" the key record cannot switch devices back to plaintext. `web/src/lib/e2ee.test.ts` covers it ("a 404 on refresh keeps encryption on and locks…").

**Not verified by tests:** the cryptographic design itself has had no independent review. The vectors prove that three implementations agree, not that the construction is right.

## The route policy wrapper

**Design.**
- Every HTTP route is registered with `routes.handle(pattern, policy, handler)` (`internal/httpapi/policy.go`) and exactly one policy:
  - `public("reason")`, only when a spec says so;
  - `signedIn`;
  - `ownerOnly`;
  - `adminsOnly`.
- Modifiers set the accepted token scopes, step-up, session-only and demo refusal.
- Registration panics on a route without a policy, a public route without a reason, or a role limit without a refusal message.
- Route packages (`davroutes`, `maproutes`, `speech`) receive an `httpx.Router` that registers the same way.

**Tests.**
- `TestEveryRouteDeclaresAPolicy` parses the package's source and fails on any direct `ServeMux.Handle` or `HandleFunc` call.
- `TestSecurityRoutePolicies` pins the policy of every security-relevant route.
- `TestRouteMatrix` (`internal/httpapi/route_matrix_test.go`) calls every non-public route in each of these ways, and compares each answer with the declared policy:
  - anonymously;
  - with each token scope;
  - as a member;
  - as a viewer of a shared project;
  - cross-site;
  - with a stale session.
- `TestDemoDenyListMatchesPolicy` keeps the demo's deny list and the `.demoDenied()` routes identical in both directions.

**Limits.**
- Public routes are skipped by the matrix and rely on their own tests.
- The source scan does not cover the route subpackages.

## Token scopes

API tokens are `read`, `agent`, `full` or `admin`, stored as SHA-256 hashes and shown once.

- `read` and `agent` tokens are refused on every write and on `/api/v1/sync`.
- `agent` tokens write only through the agent content routes and MCP write tools.
- The credential and administration routes refuse `full` tokens and accept a session or an `admin` token. An `admin` token is created only from a recently confirmed session.
- `agent` and `admin` are stored as `read` plus a marker row, so a rolled-back server treats them as read-only.

Tests: `TestReadTokenRefusedOnWrites`, `TestCredentialRoutesNeedAdminToken`, `TestAdminTokenOnlyFromFreshSession`, `TestAgentTokenRefusedOnRestWrites`, `TestAgentTokenDowngradeSafe`, and the token rows of `TestRouteMatrix`. `scripts/repo-checks.test.mjs` checks that AGENTS.md lists every scope.

## SSRF policy

`internal/outbound` is the one policy for requests to an address a user or the owner typed.

**Design.**
- Only `http(s)` is accepted.
- The name is resolved by the server, every address is checked, and the connection is pinned to the checked address. This defends against DNS rebinding.
- These are refused:
  - loopback, private, link-local and CGNAT addresses;
  - ULA, multicast and reserved ranges;
  - NAT64, 6to4 and IPv4-compatible embeddings of those;
  - cloud metadata addresses.
- The owner can allow private networks. Metadata, link-local and `0.0.0.0/8` stay refused even then.
- Redirects are not followed, or followed at most 3 times with every hop re-checked. No environment proxy is used.
- Hosted tenants can never reach private networks.

**Callers:** webhooks, push, notification channels, calendar feeds, issue connections, calendar sync, speech to text, the assistant's compatible endpoint, the map proxy and provider profile pictures.

**Tests.**
- `internal/outbound/outbound_test.go`: `TestDenyListTable`, `TestDialerPinsCheckedAddress`, `TestRedirectsNotFollowed`, `TestClientIgnoresEnvironmentProxy`, `TestAllowPrivateKeepsMetadataDenied`, `TestAllowPrivateHost`.
- `TestFollowRedirectsChecksEveryHop`.
- Per-feature tests in each caller, such as `TestPrivateHostRefusedUnlessAllowed`, `TestGraphRefusesRedirectsAndOtherHosts` and `TestMapProxyPrivateTargets`.

**Outside the policy, on purpose:** connections to targets only the operator sets. These are the OIDC issuer, SMTP, IMAP, backup destinations and the three built-in assistant hosts. [Threat model](threat-model.md#malicious-calendar-mail-or-issue-server) says what that means.

## Importer parsing limits

**Limits.**
- Uploads are capped by `OPENTODO_IMPORT_MAX_MB`.
- ZIP archives:
  - are read in memory;
  - hold at most 1,000 entries;
  - unpack to at most 10× the upload limit, checked against both declared and actual sizes;
  - have unsafe names (`..`, absolute paths, backslashes) refused;
  - are expanded one nested level at most.
- SQLite databases (Things, Tududi):
  - are opened read-only and immutable from a private temporary directory;
  - run with `query_only` and a 1 MiB value limit;
  - get 30 seconds;
  - are refused when their schema computes values.
- An import stores its attachments itself and refuses ids owned elsewhere.

**Tests.** `TestArchiveTooManyEntries`, `TestArchiveOversizedExpansion`, `TestArchiveUnsafeName`, `TestThingsRefusesSchemaThatComputes`, `TestThingsRefusesOversizedValue`, and the fuzz targets below.

## Stability contract and upgrade tests

[Stability and compatibility](../stability.md) promises that 1.x only adds. This matters for security: an upgrade must not drop a check or reinterpret stored credentials.

- **Every release's data directory is upgraded by the current server.** `TestUpgradeFromEveryRelease` (`internal/tenant/upgrade_test.go`) opens each fixture under `internal/store/testdata/upgrade/` and compares the result. `make release-prepare` refuses a minor release without its fixture.
- **Recorded calls of older clients still work.** `TestV1ClientsReplay` (`internal/tenant/clients_test.go`) replays the web sync client, `ot` and the extension. `scripts/repo-checks.test.mjs` checks that the recordings hold no session, token or password.
- **The API, op schema, export format, MCP tools and CLI only grow.** `TestV1SurfaceIsAdditive` (`internal/httpapi/surface_test.go`) checks them against `internal/httpapi/testdata/v1_surface.json`.
- **Older exports still import.** `TestReleasedExportsImport`.
- **Migrations are numbered above the base branch.** A repo check enforces this.

Downgrades are not supported. A rollback to a binary from before a security fix re-opens that issue.

## Static analysis

| Tool | Where | Blocks a merge? |
|---|---|---|
| `go vet` and staticcheck (pinned, `make staticcheck`) | CI on every pull request | Yes |
| govulncheck | CI on every pull request | Yes: a reachable known vulnerability fails |
| CodeQL for Go and for TypeScript/JavaScript | `.github/workflows/security.yml`, every pull request and weekly | Through code scanning: a new alert is flagged on the pull request; the findings on `main` are the baseline |
| gosec (pinned, `make gosec-sarif`) | Same workflow, uploaded to code scanning | Same as CodeQL. It runs with `-no-fail`, and rules G101 and G304 are excluded as false positives (Makefile) |
| ESLint, including `test-hygiene/no-fixed-wait` | CI | Yes |
| `internal/codesize` | `go test` | Yes. Size limits, plus `TestRowLoopsCheckErr`: every `rows.Next()` loop checks `rows.Err()`, so a partial read cannot look complete |
| The container image scan | The release job | Yes: a critical vulnerability with a fix stops the image |
| Dependabot | Weekly, with a cooldown | Opens pull requests |

CI also pins every GitHub Action to a full commit SHA and every base image to a digest. Release artefacts are signed and attested. `scripts/repo-checks.test.mjs` checks all of this.

## Fuzzing

Go's native fuzzing covers the parsers that read untrusted bytes. `scripts/fuzz.sh` runs every `Fuzz…` target for 60 seconds each night (`.github/workflows/nightly.yml`). A failing input is committed under the package's `testdata/fuzz/`, where every `go test` replays it.

| Package | Targets |
|---|---|
| `internal/importer` | `FuzzParse` (every import profile), `FuzzReadArchive` |
| `internal/webauthn` | `FuzzParseClientData`, `FuzzParseAuthData`, `FuzzParseAttestationObject`, `FuzzParseCOSEKey`, `FuzzVerifyAssertion` |
| `internal/caldav` | `FuzzParseXML`, `FuzzParseICal` |
| `internal/calfeed` | `FuzzParseAndExpand` |
| `internal/calsync` | `FuzzParseMultistatus` |
| `internal/email` | `FuzzParse`, `FuzzHTMLToMarkdown`, `FuzzRoute` |
| `internal/filter` | `FuzzParse` |
| `internal/quickadd` | `FuzzParse` |
| `internal/recurrence` | `FuzzParse` |
| `internal/vault` | `FuzzParseLine`, `FuzzParseDoc`, `FuzzTaskNoteFront` |

**Not fuzzed yet**, though they read untrusted input (follow-up):
- OIDC ID-token and key parsing (`oidc.VerifyIDToken`);
- the outbound address checks;
- theme documents (`themes.Validate`);
- automation rule values (`internal/ruleval`);
- task origins and locations (`origin.Decode`, `location.Decode`);
- the Microsoft Graph event parser.

The TypeScript client has no fuzzing.

## Other checks worth knowing

- **Audit log allow-list.** `TestConstructorsNeverCarryEntityFields` (`internal/audit/audit_test.go`) fails if an audit event could carry a synced content field or a secret.
- **Secrets never serialised.** `TestAssistantSecretsNeverSerialised` checks the assistant's key in JSON, `slog` and every `%v` form.
- **Contracts between Go and TypeScript.** Logic that exists on both sides is pinned by shared fixtures ([Shared contracts](../contracts.md)). `scripts/contracts.test.mjs` checks the index of fixtures.
- **Race detector.** The full Go suite runs nightly with `-race`.

## Disclosure policy

[SECURITY.md](../../SECURITY.md) is the policy. In short:

- Reports go through GitHub's private vulnerability reporting, or by email.
- Acknowledgement within 3 business days, and an assessment within 10.
- Fix targets: 7 days for Critical, 30 for High, 90 for Medium, the next minor release for Low.
- Coordinated disclosure within 90 days, with a GitHub security advisory and a CVE id.
- Credit for reporters.
- A safe harbour for good-faith research on your own instance.
- Supported versions after 1.0, as a table.

`scripts/security-review.test.mjs` fails if any of these numbers or sections disappears.

Every server also answers `/.well-known/security.txt` ([RFC 9116](https://www.rfc-editor.org/rfc/rfc9116)) with the same channels and a link to the policy. A comment in the file says that a problem with how a particular server is run belongs to its operator. `TestSecurityTxt` checks the file, and `TestSecurityTxtMatchesSecurityPolicy` fails when it and SECURITY.md name different channels.

## Known gaps and past issues

### Issues found and fixed

Every item below is in the CHANGELOG's Security section of its release. Most were found by our own internal audits; none was reported from outside.

- **0.21.0: encryption left some older content in plaintext.** Turning on end-to-end encryption rewrites existing content as ciphertext, but the job missed several kinds:
  - notes (since 0.19.0);
  - time entry notes and the closing line for tomorrow (since 0.9.0);
  - saved locations and routine names (since 0.10.0);
  - calendar frame and slot titles (since 0.18.0).
  
  Text written before encryption was on stayed plaintext on the server. Text written afterwards was always encrypted.
  
  - **Root cause:** the job's list of kinds was kept by hand, so new content kinds were added to the schema but not to the job.
  - **Fix ([#806](https://github.com/OpenTodoApp/OpenTodo/pull/806)):** the job covers every kind, devices finish the job once for accounts that already encrypt, and `e2eeCoverage.test.ts` ties the job to the generated content list.
  - **Lesson:** a hand-kept list beside a generated one is a gap waiting to happen. The remaining hand-kept list, the content prefix families, is pinned across Go and TypeScript by a fixture but not derived from the schema.
- **0.20.0: Multipath TCP turned off** (`godebug multipathtcp=0`). This narrows exposure to CVE-2026-98432, a kernel use-after-free reachable through MPTCP listeners.
- **0.16.0: adding someone to a project by email no longer adds them without their consent,** and no longer reveals which addresses have accounts.
- **0.14.2**, from an internal audit:
  - A hosted tenant's map provider could reach the operator's private network.
  - A self-hosted map provider's style could point at the local network.
  - "Allow private network targets" also opened link-local and metadata addresses.
  - One client could exhaust a hosted tenant's request limit.
  - One party could hold the demo's sandbox limit.
  - Single sign-on could link to an account whose address was never confirmed.
  - The setup code could be skipped from the local network behind Docker or NAT, and a forged leading `X-Forwarded-For` was believed.
  - "Forgot password?" revealed accounts by its response time.
  - The attachment quota could be exceeded by restoring or parallel uploads.
  - Attachments stayed in the browser cache after sign-out.
  - Links from encrypted data could open non-web schemes.
- **0.14.1**, from an internal audit:
  - A shared project could take over a private task by reusing its id.
  - CalDAV resource names were shared between accounts.
  - A project could join someone else's workspace.
  - Passkeys, TOTP and SSO links could be added without a recent sign-in.
  - A crafted saved-view filter could crash the server, so the filter parser is now bounded.
  - A crafted Things database could tie up the server.
  - An import could link another account's attachment.
  - Reading the email-to-task settings created an address.
  - Some owner security settings accepted a `full` token.
  - Sharing by email had no rate limit or audit.
  - A device whose clock ran slightly behind could lose an edit to the older value. On an encrypted account, that could leave a value in plaintext.
- **0.7.0:**
  - A server could turn end-to-end encryption off by dropping the key record.
  - Key records with extreme parameters were accepted.
  - Other sites could post to the share target.
  - Links were not encrypted.
  - A tampered backup could fill the disk during a restore.
  - `X-Forwarded-For` was believed from anyone.
  - There was no account lockout.
- **0.2.0:**
  - The demo had no abuse bounds.
  - The client-controlled first `X-Forwarded-For` hop was used for rate limits.
- **Toolchain updates** for standard-library vulnerabilities: Go 1.27.2 in 0.7.0, Go 1.27.3 in 0.9.0. Since 0.7.0, govulncheck fails CI on any reachable known vulnerability.

### Gaps still open

These are known and tracked as follow-up tasks of the OpenSpec change `external-security-review`.

- **Key derivation bounds.** The client accepts key records from 100,000 PBKDF2 iterations, while the server stores only 600,000 or more.
- **Untested security headers.** No test pins `X-Frame-Options`, the CSP's `frame-ancestors` and `script-src`, or `nosniff` on pages.
- **Coverage holes in the route tests.**
  - The source scan of the route policy test does not cover the route subpackages.
  - The route matrix skips public routes.
- **Host mode.** No test uses one tenant's API token on another tenant's host (only cookies). The assistant's concurrency limit is per tenant, not per host.
- **Write paths are a convention.** Nothing mechanically enforces that REST handlers write with `ApplyStrict`, or that no package writes synced rows directly.
- **Fuzzing.** Several parsers have no fuzz target (see [Fuzzing](#fuzzing)), and the TypeScript client has none.
- **No independent review** of the design or the code yet.

## Independent review

We are seeking an independent security review. The reviewer must have made no contribution to the repository in the 12 months before the engagement. They would work from a pinned commit, with source review and dynamic testing of a demo-mode instance and a host-mode instance.

The scope is ready: [Independent review scope](review-scope.md) lists every area with its code and its section of the [threat model](threat-model.md), and says how findings are recorded and gated before a release. The review is optional for 1.0 and depends on funding. Until a report is published in `docs/security/reviews/`, nothing in OpenTodo's documentation or release notes claims an external review.
