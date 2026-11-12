# Tasks

- [x] 1.1 `scripts/nightly-retry.sh check` tells a first attempt whose only unsuccessful jobs never got a runner from a real failure, from the run's jobs. Verify: against run 43209629099 (two macOS jobs without a runner) it exits 0; against run 42807202210 (budgets over) it exits 1.
- [x] 1.2 The nightly alert stays quiet on such a first attempt and reports every other one as before. Verify: `DRY_RUN=1 RUN_ID=43209629099 RUN_ATTEMPT=1 scripts/nightly-alert.sh` says it retries; with `RUN_ATTEMPT=2` it comments on the issue.
- [x] 1.3 `nightly-retry.yml` re-runs the failed and cancelled jobs of such a first attempt once, with the workflow's token. Verify: `node --test scripts/repo-checks.test.mjs`.
