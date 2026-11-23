## 1. Shorter chain on pull requests

- [x] 1.1 `.github/workflows/ci.yml`: `cli` and `site-bundle` skip `pull_request`; the merge queue and every other event run them as before. Verify: `node --test scripts/repo-checks.test.mjs`
- [x] 1.2 `docs/contributing/tests-and-checks.md` lists them with the queue's jobs. Verify: `make docs-check`
- [x] 1.3 After merge: the next 10 pull request runs, wall time and their longest path, compared with the numbers in the proposal. Measured on 11 pull request runs, 22 Nov 23:02 to 23 Nov 01:53 UTC (runs 45081041614 to 45097057182): web build, binaries and site bundle skipped in all 11, so the longest path is changed paths → server; wall time median 6.0 min (5.1 to 12); the longest runner wait in a run median 0.2 min (max 2.7), against 12 min on 22 November; 18 to 27 runner-minutes (69 before ci-pr-fast-tier); the server job, which now builds the web app, 4.5 to 7.3 min. Runner supply was light overnight, so the wait figures are a best case.
