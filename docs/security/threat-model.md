---
title: Threat model
summary: What an OpenTodo server protects, from whom, by which mechanism and which test, and what it does not defend against.
audience: developer
section: Internals
specs: []
screens: []
order: 40
---
# Threat model

This page says what an OpenTodo server protects, against whom, and how we know. Each attacker profile lists:

- **Defended:** what the attacker cannot do.
- **Mechanism:** the code that stops them.
- **Verified by:** the tests or checks that fail if the mechanism breaks.
- **Not defended:** what remains possible, said plainly.

Where a control has no automated test, the page says so, and the gap is a follow-up task of the OpenSpec change `external-security-review`.

The model describes the code on `main` at the time of writing. An external review works from a pinned commit (see [Independent review scope](review-scope.md)), and the model at that commit is the one that counts. [How we verify security](how-we-verify.md) describes the methods behind the tests named here. [Security limits](limits.md) lists in one place what is not protected. [SECURITY.md](../../SECURITY.md) is the user-facing summary and the disclosure policy.

## Assets

| Asset | Where it lives | Why it matters |
|---|---|---|
| Task content: titles, descriptions, notes, comments, project and label names, attachments | The op log and materialized tables in `<data>/opentodo.db`; files under `<data>/attachments/`; each device's IndexedDB | A person's whole working life |
| Account credentials | `users`, `sessions`, API tokens and app passwords, stored as hashes (argon2id for passwords, SHA-256 for random secrets); TOTP secrets in plain form (`mfa_totp.secret`); passkey public keys | Account takeover |
| Credentials for other services | `<data>/secrets/*.json` (mode 0600, outside the database and backups): SMTP, OIDC client secret, backup destinations, assistant provider keys, issue tokens, calendar sync passwords and refresh tokens, notification channel secrets, speech-to-text key | Pivot into the user's calendar, mail, issue tracker or AI account |
| End-to-end encryption keys | The account key never leaves devices; the server stores only the wrapped key record (`encryption_keys`) | Confidentiality of encrypted accounts |
| The op log's integrity | `ops` and the per-scope tables in `internal/sync` | Every device converges on it; a forged op becomes everyone's state |
| Sharing structure | Memberships, roles, workspaces (`internal/sync/members.go`, `scope.go`) | Who can read and write what |
| Capability links | Public list links, task pages, calendar feed URLs, invitation, reset and sign-up links | Each secret in an address is a credential |
| The audit log | `audit_events` in the database | Evidence after an incident |
| Availability | The single server process; in host mode, one process for many tenants | Everyone's tasks, reminders and syncs |

## Trust boundaries and entry points

1. **Internet to server.** Every HTTP route registers through the policy wrapper (`internal/httpapi/policy.go`) with one declared policy: `public("reason")`, `signedIn`, `ownerOnly` or `adminsOnly`, plus modifiers for token scopes, step-up and the demo. Route families:
   - the REST API (`/api/v1/…`);
   - the sync endpoint (`/api/v1/sync`) and the event stream;
   - CalDAV (`/dav/`, app passwords only);
   - MCP (`/mcp`, bearer tokens only) and its OAuth endpoints;
   - public links (`/api/v1/public/{token}`), task pages (`/api/v1/pages/{secret}`) and calendar feeds (`/feeds/{secret}/tasks.ics`);
   - the embedded web app and its service worker;
   - `/.well-known/security.txt`, which names where to report vulnerabilities in the software.
2. **Server to the outside.** Outbound requests go only to targets the owner or a user configured: webhooks, notification channels, calendar feeds, issue hosts, calendar sync, assistant providers, speech to text, the map provider, the OIDC issuer, SMTP, IMAP, backup destinations and push services. User-typed addresses go through `internal/outbound`.
3. **Server to device.** The server delivers the web app's code and the op log. For an end-to-end encrypted account, the server is outside the trust boundary for content, with the limits in [Malicious server for an encrypted account](#malicious-server-for-an-encrypted-account).
4. **Device to native shell.** The Android and iOS apps expose a bridge (`window.opentodoShell`) to pages of the configured server's origin only.
5. **Files the server reads.** Imports (ZIP, CSV, JSON, SQLite), email messages, iCalendar feeds, CalDAV bodies, backup archives during a restore.
6. **AI agents.** MCP clients and the in-app assistant read text other people may have written, and can propose or make changes within limits.
7. **Tenant to tenant (host mode).** One process serves many tenants, each with its own data directory, database, services and HTTP server (`internal/host`, `internal/tenant`).
8. **Operator to users.** The person who runs the server can read the database and the secrets files. End-to-end encryption is the only control against the operator, and only for content.

## Attacker profiles

### Anonymous internet user

**Defended.**
- Reaching any non-public route without a credential.
- Creating an account after the owner exists, unless sign-up is open or they hold an invitation.
- Guessing passwords at scale.
- Forging state-changing requests from another site with a victim's cookie.
- Choosing the address that rate limits and the audit log see.
- Reading another person's data through a public route.

**Mechanism.**
- The route policy wrapper (`internal/httpapi/policy.go`). A route is public only with a written reason, and every public route checks its own credential (a secret in the address, a bearer token or a single-use token).
- Rate limits per client address and per account, with account lockout after 10 failures in 15 minutes (`ratelimit.go`, `accountlock.go`).
- Session cookies are `HttpOnly` and `SameSite=Lax`. Cookie writes must carry a matching `Origin` (`originAllowed` in `middleware.go`). Without `Origin`, a cookie write needs `Sec-Fetch-Site: same-origin` or, with no Fetch Metadata either, a JSON body, which a cross-site form or navigation cannot declare (`cookieWriteAllowed`). With `OPENTODO_BASE_URL` set, the request must also be addressed to the base URL's host, which defends against DNS rebinding.
- Forwarded addresses are believed only from trusted proxies (`clientip.go`).
- First run: `OPENTODO_SETUP_TOKEN` or `OPENTODO_SETUP_CODE=required`. Without `OPENTODO_BASE_URL`, a first registration addressed to a domain name (not an IP address, a dotless name or a local-only suffix) needs the setup code from the log even with the code off, so a rebound name cannot create the owner (`setupHostVerified` in `setuphost.go`).

**Verified by.**
- `TestEveryRouteDeclaresAPolicy`, `TestSecurityRoutePolicies` (`internal/httpapi/policy_test.go`).
- `TestRouteMatrix` (`internal/httpapi/route_matrix_test.go`): every route, anonymous, with each token scope, as a member, as a viewer, cross-site and with a stale session.
- `TestLoginRateLimit`, `TestCrossSiteCookieWritesAreRejected` (`server_test.go`), including writes without `Origin` or `Sec-Fetch-Site`; the route matrix's pass of a form post with neither header on every write route.
- `TestSecurityHeaders` (`security_headers_test.go`): no framing, no sniffing, scripts only from the server.
- `TestAccountLockout`, `TestForwardedForOnlyFromTrustedPeers`, `TestOriginMustMatchBaseURL` (`client_identity_test.go`).
- `TestSetupHostVerified`, `TestSetupUnderDomainNameNeedsCode`, `TestNoHostCheckWithBaseURL` (`setuphost_test.go`); `TestSetupHostCheck` (`internal/auth/setupcode_test.go`).
- `TestClientAddressBehindTrustedProxies`, `TestInvalidTrustedProxyEntriesNeverWidenTrust` (`clientip_test.go`).

**Not defended.**
- Without `OPENTODO_BASE_URL`, the origin check compares against the request's own `Host`, so after setup a rebound name passes it. The session cookie belongs to the server's real name, so such a page has no session; it can reach public routes and try passwords against the rate limits. The docs tell operators to set the base URL.
- A JSON write with neither `Origin` nor `Sec-Fetch-Site` is accepted, so that non-browser clients signed in with a password (`ot login`) keep working. From another site it would need a CORS preflight, which the server never grants.
- Rate limits live in memory, per process. A restart clears them.
- Anyone who knows an email address can keep that account's password sign-in locked. Passkeys, single sign-on and open sessions keep working.
- `TestRouteMatrix` skips public routes, which are tested by their own feature tests.

### Signed-in member of a shared project

**Defended.**
- Reading or writing anything outside the projects shared with them.
- Moving an item from the shared project into, or out of, someone's private scope.
- Taking over another person's private item by reusing its id: the "id squat" found in an internal audit and fixed in 0.14.1.
- Attaching a project to a workspace they don't belong to.
- Forging a comment's author.

**Mechanism.**
- Every op gets its scope from the entity it touches (`resolver.resolve` in `internal/sync/scope.go`). `CanWrite(role, entity, field)` applies the role table.
- A `project_id` that crosses scopes is refused as `scope_change`.
- An id belongs to one scope on the server (`claimable` in `internal/sync/idhome.go`), and sharing refuses a project id held in someone else's personal scope (`members.go`).
- `checkWorkspace` (`grants.go`) checks workspace membership.
- REST, CalDAV, MCP and rules write through `ApplyStrict`, which refuses the whole batch.

**Verified by.**
- `TestSquattedTaskIDIsRefused`, `TestSquatRefusedForEveryEntity`, `TestPredictedIDCannotCaptureAWrite`, `TestProjectWorkspaceMustBeTheAuthors` (`internal/sync/id_ownership_test.go`).
- `TestShareRefusesProjectIDSquat` (`share_harden_test.go`).
- `TestProjectIdAcrossScopesIsRejected`, `TestPullIsScopedToMemberships`, `TestRemovedMemberReceivesNothing` (`sharing_test.go`).
- `TestCommentForgedAuthorIsRejected`, `TestSplitFromOtherScopeIsRefused`, `TestAssignToNonMemberIsRejected`.
- `TestConvergenceProperty` (`convergence_property_test.go`) shares a project part way through a random run and checks every replica.

**Not defended.**
- A member can read and change everything in the shared project their role allows, including other members' text, and can delete within it (tombstones, undoable).
- Shared projects are never end-to-end encrypted.
- Nothing mechanically enforces that REST handlers call `ApplyStrict` and not `Apply`, or that no package writes rows outside `internal/sync`. Both are conventions checked in review; a static check is a follow-up.
- `CanWrite` is tested by sampled cases, not exhaustively over role × entity × field.

### Viewer of a shared project

**Defended.** Writes to the project's tasks, sections and fields, assignments and tracked time.

**Mechanism.** The role table in `CanWrite` (`internal/sync/scope.go`). Refusals come back with the server's value, and the device undoes its local edit.

**Verified by.**
- `TestViewerWritesAreRejectedPerOp`, `TestEditorCannotEditProjectFields` (`internal/sync/sharing_test.go`).
- `TestViewerAssignmentIsForbidden`, `TestViewerCannotTrack`.
- `TestRouteMatrix` (as a viewer).
- `TestAgentWriteBatchRefusedOnViewerScope` (MCP).
- The client contract test "a viewer's edit is refused by the server, reported, and undone on the device" (`web/src/lib/sync.contract.test.ts`).

**Not defended.** Viewers read everything in the project, by design.

### Task page and public link guest

**Defended.**
- Reading more than the one published task or list.
- Writing anything except what the page allows: ticks, and replies on task pages that allow them.
- Using a revoked or unknown link.
- Learning whether a link existed.

**Mechanism.**
- The secret in the address is the credential (`public(...)` routes in `publiclinks.go` and `taskpages.go`). It is stored hashed, revocable, rate limited for unknown links, served with `no-referrer` and `noindex`, and refused on the demo.
- An encrypted account cannot create public links (`409 encryption_enabled`). Its task pages carry an encrypted snapshot the server cannot read, and replies to them must be ciphertext.
- Public links can expire after 1 to 90 days, if the creator chooses.

**Verified by.**
- `TestPublicListRead`, `TestPublicTick`, `TestPublicLinkLimits`, `TestPublicLinkEncryptedCreator` (`internal/httpapi/publiclinks_test.go`).
- `TestTaskPageRights`, `TestTaskPageLifecycle`, `TestTaskPageLimits`, `TestTaskPageEncrypted` (`taskpages_test.go`).
- `TestPublicLinkLifecycle` (`internal/auth`).

**Not defended.** Anyone the link is forwarded to has the same access, until the link is revoked or expires.

### API token holders

Tokens have one scope: `read`, `agent`, `full` or `admin`.

**Defended.**
- A `read` or `agent` token writing through REST or `/api/v1/sync`.
- A `full` token reaching credential and administration routes: second factor, passkeys, tokens, app passwords, user administration, SSO and secret-holding settings, the encryption key record.
- A token minting an `admin` token.
- A token holder starting the assistant (session only).

**Mechanism.**
- `middleware.go` refuses writes for scopes without full access, and counts `/api/v1/sync` as a write whatever the method (the route itself is `POST` only).
- `.credential()` routes accept only sessions and `admin` tokens.
- `admin` tokens are created only from a recently confirmed session.
- `agent` and `admin` are stored as a `read` scope plus a marker row. A server rolled back to an older version therefore treats them as read-only.
- Secrets are stored as SHA-256 hashes and shown once.

**Verified by.**
- `TestReadTokenRefusedOnWrites`, `TestLegacyTokensKeepFullAccess` (`internal/httpapi/tokens_scope_test.go`).
- `TestCredentialRoutesNeedAdminToken`, `TestAdminTokenOnlyFromFreshSession`, `TestPreScopeTokensAreFull` (`policy_test.go`).
- `TestAgentTokenRefusedOnRestWrites`, `TestAgentTokenDowngradeSafe` (`mcp_write_test.go`).
- `TestTurnRouteGuards` (assistant).
- `TestRouteMatrix` (every scope).

**Not defended.**
- A leaked `full` token reads and changes all of the account's data until revoked.
- Bearer tokens are never asked for a second factor or step-up.

### Stolen or unlocked device

**Defended.**
- A stolen session cannot quietly mint long-lived credentials (step-up).
- Signing out clears local data.
- **Sign out everywhere** ends every session and revokes every token and app password.
- An encrypted account's locked device holds no key.

**Mechanism.**
- `.recent()` routes need a password or code within 10 minutes (`mfa.go`, `FreshWindow`): new tokens, app passwords, passkeys, TOTP, SSO links, invitations, user administration, the key record.
- Sessions and remembered browsers are stored hashed and revocable.
- The account key is a non-extractable `CryptoKey`, forgotten on **Lock this device**.

**Verified by.**
- `TestReauthRequiredOnStaleSession` (`internal/httpapi/mfa_test.go`).
- `TestAddingCredentialsNeedsRecentSignIn`, `TestConfirmingTOTPDoesNotGrantFreshness`, `TestOIDCLinkNeedsRecentSignIn` (`credential_freshness_test.go`).
- `TestRouteMatrix` (stale session).
- `TestRelayEndsWithEncryptionAndOnLock` (`internal/relay`).
- `TestSecretsStoredOnlyAsHashes` (`internal/auth/secrets_at_rest_test.go`): session and API token secrets reach the database only as hashes.

**Not defended.**
- An unlocked device holds plaintext in IndexedDB. Anyone using it, malware or a browser extension with page access can read everything the account can.
- A device that was never locked or signed out keeps its local copy after its sessions are revoked: it can no longer sync, but its data stays.

### Malicious server for an encrypted account

The person turned on end-to-end encryption and does not trust the server, its operator, its disk or its backups with their content.

**Defended.**
- The server reading encrypted content fields, the passphrase, the recovery key or the account key.
- Moving a ciphertext to another field, item or entity: it fails authentication.
- Turning encryption off on devices by "forgetting" the key record: devices pause sync instead of uploading plaintext.
- Serving a key record with a derivation weaker than the 600,000 PBKDF2 iterations the app writes, or one that would hang the device.

**Mechanism.**
- AES-256-GCM in the browser (`web/src/lib/crypto.ts`), with additional data binding each value to `entity\0id\0field`.
- The account key is wrapped with AES-KW under a PBKDF2-SHA-256 passphrase key (600,000 iterations) and an HKDF-derived recovery key. Devices, `ot` and the server accept the same range, 600,000 to 10,000,000 (`ACCEPTED_ITERATIONS` in `web/src/lib/crypto.ts`, `crypt.MinIterations`, `e2ee.MinIterations`).
- The content field list is generated from the op schema (`Content: true` in `internal/sync/ops.go`, `CONTENT_FIELDS`, `internal/e2ee/contentfields.go`).
- Turning encryption on rewrites existing content of every kind (`web/src/lib/e2eeSync.ts`).
- A missing key record locks devices instead (`web/src/lib/e2ee.ts`).
- Shared projects are refused while encryption is on.

**Verified by.**
- Known-answer vectors shared by the web client, the server's checks and the CLI: `web/src/lib/e2ee.vectors.json`, read by `TestVectors` (`internal/e2ee/vectors_test.go`), `TestContentVectors` and `TestPassphraseAndRecoveryVectors` (`internal/e2ee/crypt/crypt_test.go`), and the "known-answer vectors" suite of `web/src/lib/crypto.test.ts`.
- Rewrite coverage: `web/src/lib/e2eeCoverage.test.ts` ("lists every entity kind that has content fields or content prefixes") fails when a content kind is missing from the job. It was added with the fix in 0.21.0 (#806); see [Known gaps and past issues](how-we-verify.md#known-gaps-and-past-issues).
- Key record handling: `web/src/lib/e2ee.test.ts` ("a 404 on refresh keeps encryption on and locks…", "refuses a key record with an iteration count outside the accepted range…"); `web/src/lib/crypto.test.ts` ("accepts the iteration range the server stores…") and `TestPassphraseAndRecoveryVectors` keep the device's and `ot`'s range equal to the server's.
- `TestGeneratedOpSchema` keeps the content list in step with the schema.
- `TestSharingRefusedForEncryptedAccount`, `TestNotificationsNeverShowCiphertext`.
- `TestServerDoesNotLinkCrypt`: the server binary never links the CLI's crypto.

**Not defended.**
- **Tampered JavaScript.** The server delivers the web app. A malicious server can change it and capture the passphrase or key on the next load. This is inherent to web-delivered end-to-end encryption.
- **Metadata.** Dates, priorities, structure, labels on tasks, counts, timing, device ids and ciphertext lengths are plaintext ([docs/e2ee.md](../e2ee.md)).
- **Rollback.** The server can serve an older ciphertext of the same field. The additional data has no version.
- **The device relay.** While a device is opted in to the relay and unlocked, the server can ask it to decrypt any content value it holds, or to encrypt text of its choosing for any content field. It needs only the entity, id and field, which it knows.
  - The device checks that each field is a content field and enforces its own caps: 5,000 values an hour and 20,000 a day. With **Confirm changes first** on, it shows every encryption request before answering.
  - It cannot tell a request for an assistant from one the server made up.
  - So, while the relay is on, the server operator is trusted with content, within those caps. [docs/mcp.md](../mcp.md) and the threat model in [docs/e2ee.md](../e2ee.md) say to opt a device in only on a server you run or trust.
- **Weak passphrases.** PBKDF2 is not memory-hard, so the wrapped key can be attacked offline.
- **Plaintext from before.** Content written before encryption was turned on stays in older backups and in the op log until **Purge plaintext history**.

### Malicious import file

**Defended.**
- Path traversal out of an archive (zip-slip).
- Decompression bombs.
- An archive with huge numbers of entries.
- A SQLite file that computes values (generated columns, virtual tables) or holds oversized values.
- An import that links another account's attachment.
- Crashes on malformed input.

**Mechanism.** `internal/importer`:
- The upload is capped by `OPENTODO_IMPORT_MAX_MB` (default 20, at most 200) with `http.MaxBytesReader`.
- Archives are read in memory: at most 1,000 entries, an unpacked total of 10× the upload limit checked against declared and actual sizes, unsafe names refused, and nested ZIPs one level deep.
- SQLite imports go to a private temporary directory. They are opened read-only and immutable with `query_only`, a 1 MiB value limit, a 30-second context, and refusal of computing schemas.
- Attachments are stored by the import itself, refusing ids already owned elsewhere.
- CSV records are read one at a time: a field holds at most 1 MiB, a record 4 MiB and 1,000 fields. JSON is refused when nested deeper than 256 levels, checked by one scan before any profile decodes it (`limits.go`).
- Imports write ops through the sync service with device `import`.

**Verified by.**
- `TestArchiveTooManyEntries`, `TestArchiveOversizedExpansion`, `TestArchiveUnsafeName`.
- `TestThingsRefusesSchemaThatComputes`, `TestThingsRefusesOversizedValue`, `TestThingsOpenerRefusesOtherSQLite`.
- `TestCSVFieldOverLimitRefused`, `TestCSVRecordOverLimitRefused`, `TestCSVTooManyFieldsRefused`, `TestEveryCSVProfileChecksFields`, `TestJSONNestingOverLimitRefused`, `TestJSONNestingInArchiveRefused` (`internal/importer/limits_test.go`); `TestImportShapeLimits413` (`internal/httpapi`).
- `FuzzParse` (every import profile, seeded from `internal/importer/testdata`) and `FuzzReadArchive` (`internal/importer/fuzz_test.go`), run nightly by `scripts/fuzz.sh`.

**Not defended.**
- The CSV limits are checked once a record is read, so reading one record still costs memory up to its length, which the upload limit bounds. A file within every limit still costs memory up to the upload limit times a constant.
- Fuzzing reaches nested ZIPs and the SQLite profiles only rarely (byte mutation of a database file covers little). The import planner (`plan*.go`) is not fuzzed.

### Malicious calendar, mail or issue server

**Defended.**
- A feed, issue host or calendar server making the OpenTodo server reach private or metadata addresses (SSRF), including through redirects or DNS rebinding.
- Unbounded responses and recurrence expansion.
- MIME bombs.
- Writes back to the remote: issues are never written to.

**Mechanism.**
- `internal/outbound`. Addresses are resolved, filtered and pinned. Loopback, private, link-local, CGNAT, ULA, multicast, NAT64 and 6to4 embeddings and metadata addresses are refused. With "allow private networks" on, metadata, link-local and `0.0.0.0/8` stay refused.
- Redirects are not followed, or followed at most 3 times with every hop re-checked. No environment proxy is used.
- Size and time limits:
  - calendar feeds: 2 MiB, 200,000 content lines, 5,000 occurrences, an expansion work budget and 5 seconds;
  - issues: 2 MiB, 10 pages;
  - calendar sync: 4 MiB, 3 redirects, never to another site;
  - email: 10 MiB, MIME depth 12, 500 parts.

**Verified by.**
- `TestDenyListTable`, `TestDialerPinsCheckedAddress`, `TestRedirectsNotFollowed`, `TestClientIgnoresEnvironmentProxy`, `TestAllowPrivateKeepsMetadataDenied` (`internal/outbound/outbound_test.go`).
- `TestFollowRedirectsChecksEveryHop`; `FuzzAddressPolicy` and `FuzzValidateURL` (`internal/outbound/fuzz_test.go`).
- `TestExpandWorkBudget`, `TestExpandDeadline`, `FuzzParseAndExpand` (`internal/calfeed`).
- `TestRedirectRefusedWithoutSecondRequest`, `TestBodyTooLarge`, `TestPrivateHostRefusedUnlessAllowed` (`internal/issues`).
- `TestRedirectToAnotherSiteIsRefused`, `TestGraphRefusesRedirectsAndOtherHosts`, `FuzzParseMultistatus` (`internal/calsync`).
- `TestParseRejectsHugeMessage`, `FuzzParse`, `FuzzHTMLToMarkdown` (`internal/email`).

**Not defended.**
- Content from these sources is untrusted text. It reaches tasks and, through them, AI agents (see the next profile).
- A calendar server the user connected can change the events it serves.
- The SMTP and IMAP connections, the OIDC issuer and backup destinations are configured by the operator and do not go through `internal/outbound`'s deny list, so they may be on the operator's own network. This is accepted: only the operator sets these targets, and host mode refuses backup settings to tenants. Their HTTP clients still take no proxy from the environment, the OIDC client follows no redirect, and the backup client follows at most 3, each to the destination's own scheme and host (`outbound.OperatorTransport`, `outbound.SameHostRedirects`; `TestOperatorTransportIgnoresEnvironmentProxy`, `TestSameHostRedirects`, `TestBackupClientIgnoresEnvironmentProxy`, `TestBackupDestinationRedirectsStayOnHost`, `TestProviderClientIgnoresEnvironmentProxy`, `TestProviderClientFollowsNoRedirect`).
- The outbound dialer tries only the first allowed address of a name.

### Malicious AI agent or prompt injection

The model behind an MCP client or the in-app assistant follows instructions hidden in data: task text, comments from other members, email-to-task bodies, imports, calendar items.

**Defended.**
- Writing without the owner's switch, the person's own switch and an `agent` token.
- More than 50 items per call, 30 calls a minute and 1,000 items a day per token, and 60 calls a minute and 2,000 items a day for all of one account's agent tokens together, for the item-writing tools.
- Permanent deletion.
- Trashing tasks the same token did not create.
- Touching sharing, members, tokens, settings or credentials.
- Turning on "Apply without asking" for a routine.
- The in-app assistant writing anything at all: it only proposes, and the person's device applies the confirmed part.

**Mechanism.**
- `internal/agenttools` is the one registry for MCP and the assistant. `Caller.WriteDenial` runs before any planning.
- Limits are in `limits.go`. Text written by people is wrapped as `untrusted_text` with a notice.
- An `agent.write` audit event is recorded for every call and refusal.
- MCP accepts only bearer tokens, checks `Origin` when present and caps bodies at 1 MB.
- The assistant loop (`internal/assistant`) is capped at 12 model rounds and 50 entities per proposal. It runs only for signed-in sessions and is refused for encrypted accounts.

**Verified by.**
- `TestPermissionGate`, `TestToolsListByPermission` (golden tool lists), `TestToolSurfaceIsClosed`, `TestLimiterPerMinuteAndPerDay`, `TestLimiterPerAccount`, `TestWriteRatePerAccount` (`limits_account_test.go`), `TestWriteLimitPerCall`, `TestTrashOnlyOwnCreations`, `TestResultsMarkUntrustedText` (`internal/agenttools/agenttools_test.go`).
- `TestMcpCookieRejected401`, `TestMcpBadOrigin403`, `TestMcpBodyTooLarge413` (`internal/httpapi/mcp_test.go`).
- `TestWriteLimitsOverHTTP`, `TestAgentWriteAudited` (`mcp_write_test.go`).
- `TestInjectionCannotEscapeRegistry`, `TestLoopCapsChangeSetAt50`, `TestLoopRoundLimit` (`internal/assistant/loop_test.go`).
- `TestPromptInjectionNeedsConfirmation`.

**Not defended.**
- Within those limits, an injected instruction can make an agent with write access change, complete, move or comment on the person's tasks. The changes are undoable and labelled in history.
- Limits are kept in memory and reset on restart.
- The routine tools let an agent create, enable and run routines. A routine's runs are bounded by the routine engine's own limits and step availability ([Routines](../routines.md)), not by the agent limits above.
- The in-app assistant sends what its read tools return to the model provider the person accepted (see the next profile).

### Compromised AI provider

**Defended.**
- The provider learning credentials, email addresses or data the person cannot see.
- The provider's answer writing anything without the person's confirmation.
- The server connecting to a member-chosen URL: members pick one of three built-in hosts, never a URL.
- Provider keys leaving the server.

**Mechanism.**
- The assistant sends only the conversation, a fixed system prompt and read-tool results.
- Write tools only plan.
- Keys live in `<data>/secrets/assistant.json` (0600) and redact themselves in JSON, `slog` and `%v`.
- An owner-entered compatible base URL goes through `internal/outbound`.
- Answers are rendered with the in-house Markdown renderer (raw HTML stays text).

**Verified by.**
- `TestAssistantSecretsNeverSerialised` (`internal/assistant/store_test.go`), `TestRouteNeverPrintsKey`.
- `TestAssistantPrivateEndpointRefused` (`internal/assistant/providers_test.go`).
- `TestNoProviderTrafficWhenDisabled`.
- `web/src/lib/markdown.test.ts` ("script tag is text", "refuses dangerous link targets").

**Not defended.**
- A compromised provider sees everything the read tools returned during a turn.
- It can propose misleading changes. The person reviews them, and an optional per-device auto-apply covers at most 3 existing tasks.
- The client for the three built-in providers honours proxy environment variables (fixed hosts only).

### Another tenant in host mode

**Defended.**
- Reading or writing another tenant's data.
- Using one tenant's session on another's host name.
- Reaching the operator's private network through webhooks, channels, calendar feeds, issue hosts, calendar sync, speech to text or the map proxy.
- Changing operator-owned settings.
- Exhausting another tenant's request, storage, operation or member limits.

**Mechanism.**
- Each tenant is opened from its own data directory (`<root>/tenants/<name>`) with its own database, lock, services and HTTP server (`internal/host`, `internal/tenant`).
- Routing takes exactly one label in front of the host name.
- On a hosted tenant, the private-network switch is forced off, which also covers speech to text, channels, issues, calendar feeds and calendar sync. The map proxy is public-only.
- `hostGuard` (`internal/httpapi/hosted.go`) refuses operator-owned settings: SMTP, OIDC, backups, MCP and assistant switches, webhook network policy and attachment limits. Email to task is off.
- Limits are counted per tenant and per client address.
- The operator interface is on its own listener with a hashed bearer token.

**Verified by.**
- `TestRouting` (`internal/host/host_test.go`): another tenant's cookie gets 401. `TestAPITokenStaysWithItsTenant`: so does another tenant's API token.
- `TestTwoTenantsNeverCross` (`internal/tenant/tenant_test.go`): sessions, sync, notifications and push keys.
- `TestOperatorSettingsStayWithTheHost`.
- `TestMapProxyPrivateTargets`.
- `TestHostTurnsPrivateMarksFailed` (`internal/webhook/worker_test.go`).
- `TestStorageLimit`, `TestRequestLimitPerClient`, `TestOperationLimits`, `TestMemberLimit` (`internal/host/limits_test.go`).
- `TestOperatorNeedsToken`.

**Not defended.**
- Tenants share one process, so one tenant's load affects the others' latency. Limits bound this but do not isolate CPU or memory.
- The assistant's concurrency limit (8 turns) is per tenant, so the operator's provider key can see 8 turns per open tenant.

### Demo visitor

**Defended.**
- Reaching another visitor's sandbox.
- Creating sandboxes at scale.
- Using routes that make outbound requests or touch credentials, settings, members or bulk writes.
- Writing without bound.

**Mechanism.**
- `internal/demo` creates sandboxes from a single-use, HMAC-signed, 10-minute token on a same-origin request. Limits:
  - 5 sandboxes per address an hour, IPv6 grouped per `/48`;
  - a live cap with eviction;
  - 600 ops an hour and 5,000 in total;
  - 2 MB of values, with values capped at 4 KB (32 KB for notes);
  - a database size guard and the nightly reset.
- The deny list (`internal/httpapi/demo.go`) runs before routing and matches every `.demoDenied()` route.

**Verified by.**
- `TestDemoDenyListMatchesPolicy` (`policy_test.go`).
- `TestSandboxTokenSingleUse`, `TestSandboxCreationLimits`, `TestSandboxLimitGroupsIPv6Sites`, `TestSandboxIsolation`, `TestSandboxWriteBudget`, `TestDemoRestrictedRoutes`, `TestDemoRefusesAgentAccess` (`internal/httpapi/demo_test.go`).
- `TestCreationTokenRules`, `TestNightlyResetDeletesAllSandboxes` (`internal/demo/demo_test.go`).

**Not defended.**
- A demo is public, so anything typed into it may be seen by its operator until the reset.
- The deny-list test probes each route with GET and POST only, for rules that have no method.

## Components in the review scope

Each item of the [review scope](review-scope.md) has a section here: where the code is, and which profiles above cover it.

### Authentication and sessions

- **Code:** `internal/auth`, `internal/webauthn`, `internal/oidc`, `internal/httpapi/auth_handlers.go`, `mfa.go`, `middleware.go`, `clientip.go`, `accountlock.go`.
- **Covered in:** [Anonymous internet user](#anonymous-internet-user) and [Stolen or unlocked device](#stolen-or-unlocked-device).
- **Further tests:**
  - TOTP: `TestTOTPReplayRefused`, `TestRecoveryCodesSingleUseAndRegenerate`.
  - Passkeys: `TestVerifyAssertionRejectsMismatches`, `TestCOSEKeyOffCurveRefused`, and the five `internal/webauthn` fuzz targets.
  - Single sign-on: `TestVerifyIDTokenVectors`, which refuses `alg: none`, HS256 key confusion, the wrong issuer, audience, `azp`, expiry and nonce; `FuzzVerifyIDToken`.

### Token scopes

- **Code:** `internal/auth` (scope side tables `api_token_scopes`, `api_token_agent`, `api_token_admin`) and `internal/httpapi/middleware.go`.
- **Covered in:** [API token holders](#api-token-holders).

### Route policy wrapper

- **Code:** `internal/httpapi/policy.go`, `internal/httpapi/httpx/policy.go`, `demo.go`, `hosted.go`.
- **How it works:** a route without a policy panics at start-up.
- **Tests:**
  - `TestEveryRouteDeclaresAPolicy` parses every source file of `internal/httpapi` and its route packages, and fails on a direct `Handle` call.
  - `TestSecurityRoutePolicies` pins the security-relevant policies.
  - `TestRouteMatrix` exercises every route.
  - `TestDemoDenyListMatchesPolicy` keeps the demo list in step.
- The source scan also covers the route packages `davroutes`, `maproutes` and `speech`, and any later package under `internal/httpapi/`. `httpx` is the exception, because it defines the router.

### Sync scopes and membership

- **Code:** `internal/sync` (`scope.go`, `members.go`, `idhome.go`, `grants.go`, `apply.go`).
- **Covered in:** [Signed-in member of a shared project](#signed-in-member-of-a-shared-project) and [Viewer of a shared project](#viewer-of-a-shared-project).
- **Convergence:** [How we verify security](how-we-verify.md#architecture-and-the-op-log-sync).

### End-to-end encryption

- **Code:** `web/src/lib/crypto.ts`, `e2ee.ts`, `e2eeSync.ts`, `e2eeEnvelope.ts`, `relay.ts`; `internal/e2ee`; `internal/relay`.
- **Covered in:** [Malicious server for an encrypted account](#malicious-server-for-an-encrypted-account).
- **Relay tests:** `TestRelayEndToEndNoPlaintextLeft`, `TestRelayAnswerFromAnotherSession`, `TestStreamCryptoVectors`, and `relay.test.ts` ("refuses fields that are not content and requests that are too big").

### CalDAV

- **Code:** `internal/caldav` and `internal/httpapi/davroutes`.
- **Controls:**
  - App passwords only, and `/api/v1` refuses them.
  - Writes go through `ApplyStrict` with device `caldav:<app-password-id>`, so sharing rules apply.
  - Refused for encrypted accounts.
- **Tests:** `TestAppPasswordIsNotAnAPIToken`, `TestDavRejectsAccountPasswordAndTokens`, `TestDavRateLimit`, `TestCaldavRefusedForEncryptedAccount`, `FuzzParseXML`, `FuzzParseICal`.

### MCP and the agent write gate

- **Code:** `internal/mcp`, `internal/agenttools`, `internal/httpapi/mcp.go`, `internal/mcpoauth`, `internal/httpapi/mcp_oauth.go`.
- **Covered in:** [Malicious AI agent or prompt injection](#malicious-ai-agent-or-prompt-injection).
- **OAuth for MCP:**
  - Dynamic registration is allowed for Google's connector redirects only.
  - Consent is required, with PKCE S256 and single-use codes.
  - Refresh tokens rotate on every refresh. A refresh token that was already exchanged revokes the whole grant and records `mcp_oauth.refresh_reused` (OpenSpec `mcp-oauth-refresh-rotation`).
  - Tests: `TestMCPOAuthAuthorizeNeedsConsent`, `TestMCPOAuthDynamicRegistrationIsGoogleOnly`, `TestMCPOAuthRevokeIsScopedToTheClient`, `TestMCPOAuthRefreshRotates`, `TestMCPOAuthRefreshReuseRevokesTheGrant`, `TestMCPOAuthRefreshReuseNeedsTheClient`, `TestMCPOAuthConcurrentRotatingRefreshRevokes`.
  - **Not defended:** a client registered only for Google's connector addresses (the Gemini preset and every dynamic client) keeps one refresh token, because Google's guide for connected apps requires the same token back on a refresh. It lasts 180 days from the last refresh, and deleting the client or revoking the grant stops it (`TestMCPOAuthGoogleClientKeepsItsRefreshToken`).

### Assistant tool loop

- **Code:** `internal/assistant` and `internal/httpapi/assistant.go`.
- **Covered in:** [Malicious AI agent or prompt injection](#malicious-ai-agent-or-prompt-injection) and [Compromised AI provider](#compromised-ai-provider).

### Outbound request policy

- **Code:** `internal/outbound`; callers `internal/webhook`, `channels`, `calfeed`, `issues`, `calsync`, `stt`, `assistant`, `maps`, and the OIDC avatar fetch.
- **Covered in:** [Malicious calendar, mail or issue server](#malicious-calendar-mail-or-issue-server) and [Another tenant in host mode](#another-tenant-in-host-mode).

### Importer parsers

- **Code:** `internal/importer` (ZIP, CSV, JSON, SQLite profiles) and `internal/backup/restore.go` for archives.
- **Covered in:** [Malicious import file](#malicious-import-file).
- **Backup restore:**
  - The manifest is read first.
  - Every entry must have exactly its listed size and SHA-256.
  - Names come from an allow-list, and free space is checked before anything is extracted.
  - Tests: `TestStageRejectsEntryLargerThanManifest`, `TestRestoreTamperedArchiveFails`.

### Attachments

- **Code:** `internal/blobs` and `internal/httpapi/attachments.go`.
- **Controls:**
  - Ids are `[A-Za-z0-9-]{1,64}`. Writes are streamed with size and SHA-256 checked, and files are immutable.
  - Quota holds cover parallel uploads and restores from the Trash.
  - Downloads carry `Content-Security-Policy: default-src 'none'; sandbox` and `nosniff`. Only images, PDF, plain text, audio and video are inline, never for encrypted files. SVG and HTML are always downloads.
- **Tests:** `TestBadIDRefused`, `TestMismatchLeavesNoFile`, `TestAttachmentDangerousTypesAreDownloads`, `TestEncryptedAttachmentServedAsOctetStream`, `TestAttachmentQuotaRestoreRacesUpload`.

### Public links and task pages

- **Covered in:** [Task page and public link guest](#task-page-and-public-link-guest).
- **Calendar feeds:** `GET /feeds/{secret}/tasks.ics` uses the same model, with a secret in the address.

### Host mode isolation

- **Covered in:** [Another tenant in host mode](#another-tenant-in-host-mode).

### Demo mode

- **Covered in:** [Demo visitor](#demo-visitor).

### Web client

- **Code:** `web/src`, the service worker `web/src/sw.ts` and `web/public/push-sw.js`.
- **Controls:**
  - Markdown is rendered by an in-house renderer to React elements. Raw HTML stays text, and only `http(s)` and `mailto` links are rendered (`web/src/lib/markdown.test.ts`).
  - Links from encrypted data open only `http(s)`.
  - The share target accepts only same-origin or share-sheet requests up to 100 MB (`shareRequestAllowed`, `web/src/lib/shareInbox.test.ts`).
  - Signing out empties the app's caches.
  - Strict CSP: `script-src 'self'` and `frame-ancestors 'none'` (`cspBase`), `X-Frame-Options: DENY`.
- **Tests:** `TestSecurityHeaders` (`internal/httpapi/security_headers_test.go`) pins `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` and the page policy's `default-src`, `script-src`, `frame-ancestors`, `base-uri` and `form-action`.
- **Gap:** the share target also accepts a request without `Sec-Fetch-Site`, which older browsers do not send.

### Android and iOS bridges

- **Code:** `web/src/lib/shell.ts`, `mobile/android/app/src/main/java/app/opentodo/Bridge.kt`, `mobile/ios/OpenTodo/Bridge.swift`.
- **Controls:**
  - The bridge is exposed to the configured server's origin only: Android's `addWebMessageListener` with that origin as its only rule and a main-frame check, and iOS's message handler checking the frame's security origin.
  - Navigation leaves the server only inside a sign-in flow.
  - The microphone is granted to that origin only.
- **Tests:** `BridgeFixtureTest`, `SignInFlowTest`, `WebMicrophoneTest` (`mobile/android/app/src/test/java/app/opentodo/`).
- **Gap:** the iOS bridge has no automated origin test in CI (follow-up).

### Container image

- **Code:** `Dockerfile` and `.github/workflows/ci.yml`.
- **Controls:**
  - A distroless static base pinned by digest, with no shell, running as `nonroot`.
  - Multipath TCP off (`godebug multipathtcp=0`, pinned by a test).
  - The image is scanned for known vulnerabilities before it is pushed (a critical one with a fix stops the release) and smoke-tested.
  - Signed with cosign (keyless), with an SBOM and build provenance; release files carry provenance attestations.
- **Checks in `scripts/repo-checks.test.mjs`:** "base and job images are pinned by digest", "the image under test is the one built in the run, scanned and smoke-tested", "published artefacts are signed and attested, with OIDC only where needed".

## Accepted risks

- **The operator.** Whoever runs the server can read the database and the secrets files. TOTP secrets are stored in plain form because the server computes codes from them. End-to-end encryption protects content only, and only while the operator does not change the served code.
- **The audit log is not tamper-evident** against someone with write access to the database file.
- **Rolling back** to a binary older than a security fix re-opens that issue. For example, deactivated accounts could sign in again on a server older than user administration. There are no down-migrations.
- **Rate limits and agent limits live in memory** and reset when the server restarts.
- **Availability** rests on one process. Host mode shares that process between tenants.
- **Leaked capability links** (public lists, task pages, calendar feeds) give their access to anyone holding them until revoked.
- **Backups made before a purge** still contain plaintext history and permanently deleted items.
