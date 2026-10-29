# Tasks

## 1. Preparation

- [ ] 1.1 `docs/security/threat-model.md` with assets, entry points, attacker profiles, controls with their tests, accepted risks, one section per scope item; verify `make docs-check` and review by a second maintainer recorded in the PR
- [ ] 1.2 `docs/security/README.md` (index, scope list, how findings are recorded); verify `make docs-check`
- [ ] 1.3 (Optional, owner decision) Apply for funding (OSTIF first; Sovereign Tech Fund or NLnet NGI Zero as fallback), agree the scope and the 12-month independence rule in the engagement letter; verify the letter lists every scope item of the spec (checked by hand, noted in the PR that adds the review file)

## 2. Checks

- [ ] 2.1 `scripts/security-review.test.mjs`: parse review files (front matter, findings table), check scope items against threat model sections, check regression test paths exist; add to `make repo-check`; verify `node --test scripts/security-review.test.mjs` with valid and broken fixtures
- [ ] 2.2 Release gate in `scripts/release/prepare.mjs` for versions ≥ 1.0.0 (review age, Critical/High retested, Medium rule, Low/Info issue links), naming each blocking finding; verify `node --test scripts/release/prepare.test.mjs` cases: no review file passes, open High, accepted Medium in target, Medium past target, review older than 24 months, new major without a fresh review
- [ ] 2.3 `SECURITY.md` sections (what to expect, fix targets, coordinated disclosure, safe harbour, supported versions table, security reviews) and a repo check for their headings and numbers; verify `make repo-check`

## 3. Review and fixes

- [ ] 3.1 Pin the commit, build the two instances (demo mode, host mode) for the reviewer, give access; verify the commit hash is in the review file's front matter
- [ ] 3.2 Record every finding in `docs/security/reviews/<yyyy-mm>-<reviewer>.md`; open private advisories for Critical, High and Medium; verify the repo check passes
- [ ] 3.3 Fix each finding in its own PR with a regression test (an OpenSpec change when behaviour changes), and get the reviewer's retest for Critical and High; verify `go test ./...`, `npm test` and the gate in 2.2 passing for `VERSION=1.0.0`
- [ ] 3.4 Publish advisories and CVEs for fixed findings that affected released versions; verify each row's `Advisory` column

## 4. Publication

- [ ] 4.1 Publish the report and summary in `docs/security/`, link them from `SECURITY.md` and the 1.0 release notes; verify `make docs-check`
- [ ] 4.2 CHANGELOG entry under Unreleased; verify `make check`
