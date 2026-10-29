# Proposal

## Why

OpenTodo asks people to put their whole working life on a server they run themselves, and from 0.14 on it holds credentials for their calendars, mail, issue trackers and AI providers. Its security so far rests on internal audits (the 2026-10 audit waves), CodeQL, gosec and fuzzing. Those catch classes of bugs; they do not replace an independent reviewer looking at the design and the running system. For a project that wants to be the default, trustworthy choice at 1.0 (ROADMAP-1.0 "Trust"), an independent review with a published report is the evidence people and organisations ask for, and the commercial apps cannot offer it in the open. `SECURITY.md` also lacks response times and a version support window, which a 1.0 promise needs.

## What Changes

- **A threat model, published before the review:** `docs/security/threat-model.md`. It covers assets, trust boundaries, attacker profiles (anonymous internet, signed-in member of a shared project, viewer, guest on a task page, `read`/`agent`/`full`/`admin` token holder, malicious calendar, mail or issue server, malicious import file, a compromised AI provider, another tenant in host mode, a demo visitor) and the controls for each.
- **One independent review of a pinned commit** before the 1.0 tag, by a reviewer with no contribution to the repository in the previous 12 months, arranged through OSTIF or a comparable funder (Sovereign Tech Fund, NLnet NGI Zero, Open Technology Fund Red Team Lab). It covers a **named scope**:
  - authentication and sessions;
  - token scopes;
  - the route policy wrapper;
  - sync scopes and membership;
  - end-to-end encryption (client crypto, relay);
  - CalDAV;
  - MCP and the agent write gate;
  - the assistant's tool loop;
  - the outbound policy (SSRF);
  - the importers' parsers (ZIP, SQLite, CSV);
  - attachments;
  - public links and task pages;
  - host mode isolation;
  - demo mode;
  - the web client (Markdown rendering, service worker);
  - the Android and iOS bridges;
  - the container image.

  The method is source review plus dynamic testing of a running instance.
- **Findings with a severity-based fix rule**, recorded in `docs/security/reviews/<yyyy-mm>-<reviewer>.md` as a table. The rule by severity:
  - **Critical and High:** fixed and retested by the reviewer before `v1.0.0`.
  - **Medium:** fixed before `v1.0.0`, or accepted by the owner with a written reason and a fix no later than 1.1.
  - **Low and Informational:** each gets an issue.
  
  Every fixed Critical, High or Medium finding names a regression test.
- **A release gate.** `make release-prepare` for any version ≥ 1.0.0 refuses to run when no review file exists, or when a finding breaks the rule above.
- **A published report.** The reviewer's full report and a plain summary go in `docs/security/`. They're published when the fixes ship, and no later than 90 days after delivery.
- **A disclosure policy in `SECURITY.md`:**
  - acknowledgement within 3 business days and an assessment within 10;
  - fix targets of 7 days (Critical), 30 (High), 90 (Medium) and the next minor (Low);
  - coordinated disclosure within 90 days, with GitHub security advisories and CVE ids;
  - credit and a good-faith safe-harbour statement;
  - supported versions after 1.0: the latest 1.x minor gets all fixes, the previous minor gets Critical and High fixes for 3 months, and the last 0.x gets Critical fixes for 3 months after 1.0.
- **Recurring reviews.** A new external review happens before every new major version and at least every 24 months.

No new environment variable, no new dependency, no op schema change. Not **BREAKING**.

## Out of scope

- A bug bounty with payments (no budget; the policy credits reporters).
- Certification (SOC 2, ISO 27001): OpenTodo is software, not a service.
- Operators' infrastructure, the public demo's hosting, and the website repository. The demo *mode* code is in scope; its host isn't.
- Third-party services reached by configuration (calendar, mail, AI providers), beyond how OpenTodo talks to them.
- A `security.txt` served by each instance. It would point self-hosters' visitors to the project instead of the operator; that's left for an owner decision.

## Roadmap

Advances ROADMAP-1.0 milestone 1.0 "Trust", item `external-security-review`.

## Capabilities

### New Capabilities

- `security-review`: the threat model, the external review scope and independence, the findings record and fix rule, the release gate, the published report, the disclosure policy with response times and supported versions, and the review cadence.

### Modified Capabilities

None. `audit-log`, `auth-hardening` and the other security specs keep their requirements; fixes for findings arrive as their own changes or as fixes under the existing specs.

## Impact

- **Data model, sync, E2EE, API/CLI/MCP:** none from this change itself. Fixes for findings may touch any of them and follow the usual rules (a finding that needs a behaviour change gets its own OpenSpec change).
- **Repository:** `docs/security/threat-model.md`, `docs/security/reviews/`, `SECURITY.md` sections, a check in `scripts/release/prepare.mjs`, a repo check of the findings table format.
- **Binary and bundle size:** none.
- **Cost:** an external review typically costs €15,000–€40,000 for this scope (10–20 reviewer days). It needs funding from a programme above; see the open question in design.md.
