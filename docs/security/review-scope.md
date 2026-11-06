---
title: Independent review scope
summary: The engagement brief for an independent security review of OpenTodo, with the pinned commit, the method, the scope items and how findings are recorded.
audience: developer
section: Internals
specs: []
screens: []
order: 42
---
# Independent review scope

This is the brief for an independent security review of OpenTodo. It is ready to hand to a reviewer, or to a funder that arranges reviews: OSTIF, the Sovereign Tech Fund, NLnet or the Open Technology Fund's Red Team Lab.

The review is optional for 1.0 and depends on funding. Until a review report is published here, OpenTodo claims none.

## Reviewer independence

The reviewer has made no commits to the repository, and received no payment for work on it, in the 12 months before the engagement. The engagement letter states this and lists every scope item below.

## The commit under review

The review covers one commit, named in full in the engagement letter and in the review record. To pin it:

1. Choose the commit: normally the latest release tag, or `main` after the last fix before the planned 1.0.
2. Record its full hash: `git rev-parse <tag>^{commit}`.
3. Check that its CI run passed: `gh run list --commit <hash>`.
4. Build from that commit only:
   - the binaries with `make web server`;
   - or the image with `docker build -t opentodo:review .`;
   - or the published release, verified with `cosign verify` and `gh attestation verify` ([verify the image and downloads](../self-hosting/docker.md#verifying-the-image-and-downloads)).
5. Send the reviewer the hash, this page and the [threat model](threat-model.md) as they are at that commit (`https://github.com/OpenTodoApp/OpenTodo/blob/<hash>/docs/security/threat-model.md`).

Fixes land on `main` as usual. The reviewer retests Critical and High findings on the commit that contains each fix, and the record names it.

## Method

- **Source review** of the scope items below, starting from the threat model's sections and the code paths they name.
- **Dynamic testing** of instances built from the pinned commit. The project provides two:
  - **Demo mode** (`OPENTODO_DEMO=true`): public sandboxes, the deny list and the limits.
  - **Host mode** (`OPENTODO_HOST_URL` and the operator listener): at least two tenants, for isolation testing.
  
  The reviewer may also run a plain self-hosted instance (`./bin/opentodo`; the first visit creates the owner) with end-to-end encryption, CalDAV, MCP and the assistant turned on.
- No testing against the public demo at `demo.open-todo.app`, or any instance the project does not provide for the review.

## Scope

Each item names the section of the threat model that describes its controls and the tests that pin them. `scripts/security-review.test.mjs` checks that every section exists.

| Item | Area | Threat model | Code |
|---|---|---|---|
| `authentication-and-sessions` | Passwords, sessions, second factor, passkeys, single sign-on, step-up, rate limits, client addresses | [Authentication and sessions](threat-model.md#authentication-and-sessions) | `internal/auth`, `internal/webauthn`, `internal/oidc`, `internal/httpapi` |
| `token-scopes` | API token scopes `read`, `agent`, `full`, `admin`; CalDAV app passwords | [Token scopes](threat-model.md#token-scopes) | `internal/auth`, `internal/httpapi/middleware.go` |
| `route-policy-wrapper` | Every route's declared policy, the demo deny list, operator-owned settings in host mode | [Route policy wrapper](threat-model.md#route-policy-wrapper) | `internal/httpapi/policy.go`, `internal/httpapi/httpx` |
| `sync-scopes-and-membership` | The op log, sharing scopes, roles, id ownership, workspaces | [Sync scopes and membership](threat-model.md#sync-scopes-and-membership) | `internal/sync` |
| `end-to-end-encryption` | Client cryptography, key records, the rewrite job, the device relay | [End-to-end encryption](threat-model.md#end-to-end-encryption) | `web/src/lib/crypto.ts`, `e2ee*.ts`, `relay.ts`, `internal/e2ee`, `internal/relay` |
| `caldav` | The CalDAV endpoint and its iCalendar and XML parsing | [CalDAV](threat-model.md#caldav) | `internal/caldav`, `internal/httpapi/davroutes` |
| `mcp-and-the-agent-write-gate` | MCP, its OAuth flow, the agent tools and their write gate and limits | [MCP and the agent write gate](threat-model.md#mcp-and-the-agent-write-gate) | `internal/mcp`, `internal/mcpoauth`, `internal/agenttools` |
| `assistant-tool-loop` | The in-app assistant's loop, proposals, provider keys | [Assistant tool loop](threat-model.md#assistant-tool-loop) | `internal/assistant` |
| `outbound-request-policy` | SSRF defences for every user- or owner-typed address | [Outbound request policy](threat-model.md#outbound-request-policy) | `internal/outbound` and its callers |
| `importer-parsers` | ZIP, CSV, JSON and SQLite imports; backup restore | [Importer parsers](threat-model.md#importer-parsers) | `internal/importer`, `internal/backup` |
| `attachments` | Storage, quotas, serving of uploaded files | [Attachments](threat-model.md#attachments) | `internal/blobs`, `internal/httpapi/attachments.go` |
| `public-links-and-task-pages` | Capability links: public lists, task pages, calendar feeds | [Public links and task pages](threat-model.md#public-links-and-task-pages) | `internal/httpapi/publiclinks.go`, `taskpages.go`, `calfeed.go` |
| `host-mode-isolation` | Tenant isolation, the operator interface | [Host mode isolation](threat-model.md#host-mode-isolation) | `internal/host`, `internal/tenant` |
| `demo-mode` | Public sandboxes and their limits | [Demo mode](threat-model.md#demo-mode) | `internal/demo`, `internal/httpapi/demo.go` |
| `web-client` | Rendering of user content (Markdown, links), the service worker, the share target | [Web client](threat-model.md#web-client) | `web/src`, `web/public/push-sw.js` |
| `android-and-ios-bridges` | The native shells' bridge to the web app | [Android and iOS bridges](threat-model.md#android-and-ios-bridges) | `web/src/lib/shell.ts`, `mobile/android`, `mobile/ios` |
| `container-image` | The image's base, user, build and signing | [Container image](threat-model.md#container-image) | `Dockerfile`, `.github/workflows/ci.yml` |

## Out of scope

- Operators' infrastructure, and the hosting of the public demo.
- The website repository.
- Third-party services reached by configuration (calendar, mail and AI providers), beyond how OpenTodo talks to them.
- The `ot` CLI, the browser extension and the Obsidian plugin, unless the funder extends the scope. Their server-facing behaviour is covered through the routes they use.

## Deliverables and how findings are recorded

The reviewer delivers a report with one row per finding. Each finding has:

- an id (for example `OTD-01`);
- a title;
- a severity: `Critical`, `High`, `Medium`, `Low` or `Info`, with a CVSS 4.0 vector when given;
- reproduction steps.

Critical, High and Medium findings go to the project as private GitHub security advisories, never as public issues.

The project records the review in `docs/security/reviews/<yyyy-mm>-<reviewer>.md`. The file has two tables:

- **`## Record`**: rows for `Reviewer`, `Commit` (the full hash), `Delivered`, `Published` (a date or `Not yet`) and `Scope` (every item id above, in backticks).
- **`## Findings`**: the columns `ID`, `Title`, `Severity`, `Status`, `Fix`, `Regression test` and `Advisory`.
  - **Status** is `Fixed (retested)`, `Fixed`, `Accepted`, `Open` or `Won't fix`.
  - **Fix** holds the pull request, or for `Accepted` a reason and a target version, or the issue link for Low and Info.
  - **Regression test** names the test and its file path in backticks.

`node --test scripts/security-review.test.mjs` (part of `make repo-check`) fails in any of these cases:

- the format is broken;
- a scope item is missing;
- a fixed Critical, High or Medium finding names a test file that does not exist.

**The fix rule, enforced by `make release-prepare` for every version from 1.0.0 once a review exists:**

| Severity | Rule |
|---|---|
| Critical and High | `Fixed (retested)` by the reviewer before the release |
| Medium | Fixed, or `Accepted` with a written reason and a target version no later than the next minor |
| Low and Info | An issue link, or `Won't fix` with a reason |

The same gate refuses a release when the newest review is more than 24 months old, and a new major version without a review delivered since the previous major's last release.

**Publication.** The report and a plain summary are published in `docs/security/` with the release that contains the Critical and High fixes, and no later than 90 days after delivery. Accepted risks are described there without exploit detail while they are unfixed.

## Contact

Use GitHub's private vulnerability reporting on [OpenTodoApp/OpenTodo](https://github.com/OpenTodoApp/OpenTodo/security/advisories/new), or the email address in [SECURITY.md](../../SECURITY.md).
