# Design

## Context

- `SECURITY.md` has a reporting channel (GitHub private vulnerability reporting, plus an email), a scope list, the security model and "What is logged". "Supported versions" says only the latest release gets fixes. There are no response times.
- Existing automated controls: CodeQL and gosec (`.github/workflows/security.yml`), Go fuzz targets (`scripts/fuzz.sh`, nightly), the route policy test, the audit allow-list test, `outbound` tests, and the 2026-10 internal audit waves (several archived hardening changes).
- `scripts/release/prepare.mjs` prepares a release and has its own tests.

## Decisions

**D1. The project writes the threat model; the reviewer tests it.** A threat model written before the review gives the reviewer the intended trust boundaries. It also gives a scope that can be checked: each scope item maps to a model section and to the code paths named in AGENTS.md. Sections per component:

- the assets (credentials, content, encryption keys, the op log, attachments, secrets files);
- the entry points (route families with their policies, CalDAV, MCP, the sync endpoint, the event stream, email polling, calendar and issue polling, the importers, the bridges);
- the attacker profiles in the proposal;
- the controls and the tests that pin them;
- known accepted risks (for example: the audit log is not tamper-evident against database write access).

Alternative: let the reviewer derive the model. Rejected: it costs paid reviewer days, and the project should own its model after the review.

**D2. Independence and method are fixed in the spec, the firm isn't.** The reviewer must:

- have made no commits or paid contributions to the repository in the 12 months before the engagement;
- review a pinned commit, given in the report;
- do both source review and dynamic testing against an instance built from that commit, with the demo mode and host mode enabled in separate instances.

Naming a firm in a spec would tie the spec to a contract. OSTIF is the recommended route because it handles scoping and funding for open-source projects. The alternatives are listed so the owner can pick.

**D3. Findings table as the single record.** `docs/security/reviews/<yyyy-mm>-<reviewer>.md` starts with front matter (reviewer, commit, delivery date, publication date) and has one table:

| Column | Values |
|---|---|
| `ID` | the reviewer's id, e.g. `OTD-01` |
| `Title` | short title |
| `Severity` | `Critical`, `High`, `Medium`, `Low`, `Info` (the reviewer's rating; CVSS 4.0 vector when given) |
| `Status` | `Fixed (retested)`, `Fixed`, `Accepted`, `Open`, `Won't fix` |
| `Fix` | the PR or commit, or the reason for Accepted |
| `Regression test` | test name and file path |
| `Advisory` | GHSA id when one was published |

A repo check (`node --test scripts/security-review.test.mjs`) parses every review file and fails when the format is broken, or when a named regression test file doesn't exist.

**D4. Fix rule enforced at release time, not at merge time.** `prepare.mjs` gains a gate for versions `>= 1.0.0`. It refuses when:

- no review file has a delivery date within the last 24 months, or before the current major's `.0` (for a new major);
- a `Critical` or `High` finding isn't `Fixed (retested)`;
- a `Medium` finding is `Open`, or is `Accepted` without a reason and a target version, or its target version is lower than the one being released;
- a `Low` or `Info` finding has no issue link and isn't `Won't fix` with a reason.

Alternative: a CI check on every PR. Rejected: during the fix window main would be red for everyone.

**D5. Publication timing.** Until the fixes ship, the report stays private: the reviewer's copy, and drafts in private advisories. The summary and the full PDF are published in `docs/security/` together with the release that contains the fixes, and at most 90 days after delivery even if a Medium is still accepted. In that case the summary describes accepted risks without exploit details. The 1.0 release notes link the report.

**D6. Disclosure policy content.** `SECURITY.md` gains or extends these sections:

- "Reporting a vulnerability": unchanged channels.
- "What to expect": acknowledgement within 3 business days, an assessment with a severity within 10 business days, fix targets (Critical 7 days, High 30, Medium 90, Low next minor), coordinated disclosure with the reporter within 90 days unless a fix needs longer and the reporter agrees, a GHSA and CVE through GitHub, and credit.
- "Safe harbour": good-faith research on your own instance is welcome; no testing against instances you don't own, including the public demo, beyond normal use.
- "Supported versions": the window from the proposal, as a table.
- "Security reviews": a link to `docs/security/`.

A repo check asserts these headings exist and the response-time numbers are present, so they can't silently disappear.

**D7. Cadence.** A new review happens before every new major version and at least every 24 months. The D4 gate enforces this, because a release after 24 months without a new review fails.

## Data model impact

None.

## Size and memory

No dependency, no runtime change.

## Interface budget

No screen changes.

## Progressive disclosure

Nothing in the app.

## Open questions for the owner

- **Optional (owner, 2026-10-30):** the review is not required for 1.0; the gate passes with no review file.
- **Funding and route (if done):** apply to OSTIF first (it also covers the Go supply chain), with the Sovereign Tech Fund or NLnet NGI Zero as fallbacks. The review must be booked about three months before the planned 1.0 date.
- **Contact address:** `SECURITY.md` lists a personal email as the fallback channel. A project address (for example `security@` on the website domain) may be preferable before publishing response times.
- **security.txt:** not served by instances (out of scope). Owner decision.
