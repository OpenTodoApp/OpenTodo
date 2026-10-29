## ADDED Requirements

### Requirement: Published threat model
The repository SHALL publish `docs/security/threat-model.md` before an external review starts. It SHALL list the assets, the entry points with their route policies, the attacker profiles (anonymous internet user, signed-in member of a shared project, viewer, task page guest, holder of a `read`, `agent`, `full` or `admin` token, a malicious calendar, mail or issue server, a malicious import file, a compromised AI provider, another tenant in host mode, a demo visitor), the controls for each with the tests that pin them, and the accepted risks. Every scope item of the review SHALL map to a section of the model.

#### Scenario: Reviewer starts from the model
- **WHEN** the reviewer receives the engagement brief
- **THEN** it links the threat model at the pinned commit and each scope item names its model section

#### Scenario: Scope item without a model section
- **WHEN** the review scope lists "host mode isolation" and the model has no host mode section
- **THEN** the security review repo check fails naming the scope item

### Requirement: Independent review of a named scope
Before the `v1.0.0` tag, an external reviewer SHALL review a pinned commit by source review and dynamic testing of instances built from it, one with demo mode and one with host mode. The reviewer SHALL have made no commits or paid contributions to the repository in the 12 months before the engagement. The scope SHALL include authentication and sessions, token scopes, the route policy wrapper, sync scopes and membership, end-to-end encryption (client cryptography and the device relay), CalDAV, MCP and the agent write gate, the assistant's tool loop, the outbound request policy, the importers' file parsers, attachments, public links and task pages, host mode isolation, demo mode, the web client's rendering of user content and its service worker, the Android and iOS bridges, and the container image. The review file SHALL record the reviewer, the commit, the scope and the delivery date.

#### Scenario: Review record
- **WHEN** a review is delivered
- **THEN** `docs/security/reviews/<yyyy-mm>-<reviewer>.md` names the reviewer, the commit hash, every scope item and the delivery date in its front matter

### Requirement: Findings follow a severity-based fix rule
Every finding SHALL be recorded in the review file's findings table with an id, title, severity (`Critical`, `High`, `Medium`, `Low`, `Info`), status, fix reference, regression test and advisory id when published. `Critical` and `High` findings SHALL be `Fixed (retested)` by the reviewer before a release at or above 1.0.0. `Medium` findings SHALL be fixed, or `Accepted` with a written reason and a target version no later than the next minor release. `Low` and `Info` findings SHALL each link an issue or be `Won't fix` with a reason. Every fixed `Critical`, `High` or `Medium` finding SHALL name a regression test whose file exists. A repo check SHALL fail on a malformed table or a missing regression test file.

#### Scenario: High finding fixed
- **WHEN** the reviewer reports an SSRF bypass rated High and the fix lands with `TestOutboundRefusesIPv6Mapped` in `internal/outbound/outbound_test.go`
- **THEN** the table row reads `High`, `Fixed (retested)`, the PR, and that test, and the repo check passes

#### Scenario: Regression test missing
- **WHEN** a fixed Medium row names `internal/caldav/missing_test.go`, which does not exist
- **THEN** the repo check fails naming the finding id and the path

### Requirement: Release gate on review findings
`make release-prepare` for a version at or above 1.0.0 SHALL refuse when no review file has a delivery date within the 24 months before the release (or, for a new major version's `.0` release, after the previous major's last release), when a `Critical` or `High` finding is not `Fixed (retested)`, when a `Medium` finding is `Open` or `Accepted` without a reason or with a target version below the version being prepared, or when a `Low` or `Info` finding has neither an issue link nor a `Won't fix` reason. The refusal SHALL name each blocking finding.

#### Scenario: Open High blocks 1.0
- **WHEN** a maintainer runs `make release-prepare VERSION=1.0.0` and finding `OTD-04` is High and `Fixed`, not retested
- **THEN** the command fails naming `OTD-04` and the required status

#### Scenario: Accepted Medium within its target
- **WHEN** a Medium finding is `Accepted` with a reason and target 1.1.0 and the maintainer prepares 1.0.0
- **THEN** the gate passes for that finding

#### Scenario: Review older than 24 months
- **WHEN** a maintainer prepares 1.9.0 and the newest review was delivered 25 months earlier
- **THEN** the command fails saying a new external review is due

### Requirement: Published review report
The full report and a plain-language summary SHALL be published in `docs/security/` with the release that contains the fixes for its `Critical` and `High` findings, and no later than 90 days after delivery. The summary SHALL describe accepted risks without exploit detail while they are unfixed. The release notes of the first release containing the fixes SHALL link the report, and `SECURITY.md` SHALL link `docs/security/`.

#### Scenario: 1.0 release notes
- **WHEN** 1.0.0 is released after the review
- **THEN** its notes link the summary and the full report in `docs/security/`

### Requirement: Disclosure policy with response times and supported versions
`SECURITY.md` SHALL state the reporting channels; acknowledgement within 3 business days; an assessment with a severity within 10 business days; fix targets of 7 days for Critical, 30 for High, 90 for Medium and the next minor release for Low; coordinated disclosure within 90 days unless the reporter agrees to longer; GitHub security advisories with CVE ids; credit to reporters; a good-faith safe-harbour statement that excludes testing instances the researcher does not own; and the supported versions: the latest 1.x minor receives all security fixes, the previous minor receives Critical and High fixes for 3 months after the next minor ships, and the last 0.x release receives Critical fixes for 3 months after 1.0.0. A repo check SHALL fail when any of these sections or numbers is missing.

#### Scenario: Reporter reads the policy
- **WHEN** a researcher opens `SECURITY.md`
- **THEN** it shows where to report, the response times, the fix targets per severity, the disclosure window, the supported versions table and the safe-harbour statement

#### Scenario: Response time removed
- **WHEN** a change deletes the acknowledgement time from `SECURITY.md`
- **THEN** the repo check fails naming the missing section

#### Scenario: Fix for the previous minor
- **WHEN** a High vulnerability is fixed one month after 1.3.0 shipped
- **THEN** the policy promises a patch release for 1.3 and for 1.2
