# Tasks

## 1. Implementation

- [x] 1.1 Add request-scoped project/section defaults, reset and focus return for the shared sheet, including batch/project overrides. Verify sheet interaction tests and typecheck.
- [x] 1.2 Route phone section/board actions to the sheet and omit the top input; preserve desktop and permissions. Verify phone/board/budget tests; update user docs and changelog.

## 2. Verification and review

- [x] 2.1 Build web/server; run tests, lint, bundle budget, strict OpenSpec validation and `make check`; record results in design.md.
- [x] 2.2 Check browser layout/accessibility, offline destinations and send without input focus; capture before/after screenshots on isolated servers.
- [ ] 2.3 Review the feature diff and remaining device checks, then archive the change in the PR that finishes it.
