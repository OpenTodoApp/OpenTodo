## 1. Fast tier on pull requests

- [x] 1.1 `.github/workflows/ci.yml`: a pull request, draft or not, turns `ui`, `layout`, `a11y`, `mobile` and `ios` off; `merge_group` keeps the whole path tier; `ready_for_review` no longer starts a run. Verify: `node --test scripts/repo-checks.test.mjs`
- [x] 1.2 `docs/contributing/tests-and-checks.md` describes the tiers and where a queue failure's report is. Verify: `make docs-check`
- [ ] 1.3 After merge: the next 10 pull request and queue runs, wall time and runner-minutes, compared with the numbers in the proposal
- [x] 1.4 A push to `main` skips the heavy jobs the merge queue ran; the image, publishing and CI result still run. Verify: `node --test scripts/repo-checks.test.mjs`
