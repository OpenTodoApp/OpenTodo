## 1. Shorter chain on pull requests

- [x] 1.1 `.github/workflows/ci.yml`: `cli` and `site-bundle` skip `pull_request`; the merge queue and every other event run them as before. Verify: `node --test scripts/repo-checks.test.mjs`
- [x] 1.2 `docs/contributing/tests-and-checks.md` lists them with the queue's jobs. Verify: `make docs-check`
- [ ] 1.3 After merge: the next 10 pull request runs, wall time and their longest path, compared with the numbers in the proposal
